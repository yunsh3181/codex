const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'waiting-tv/waiting-tv.js'),'utf8');
const html=fs.readFileSync(path.join(root,'waiting-tv/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'waiting-tv/waiting-tv.css'),'utf8');
const subscriptions={};
const intervals=[];
let fakeNow=1700000000000;
const elements=new Map();
const element=id=>{
 if(!elements.has(id))elements.set(id,{innerHTML:'',textContent:'',className:'',classList:{toggle(){}},addEventListener(){}});
 return elements.get(id);
};
const context={
 console,
 Date:{now:()=>fakeNow},
 Map,
 Promise,
 SpeechSynthesisUtterance:class{},
 document:{getElementById:element},
 navigator:{onLine:true},
 localStorage:{getItem:()=>'false',setItem(){},removeItem(){}},
 window:{addEventListener(){},setInterval(callback,delay){intervals.push({callback,delay})}},
 db:{collection(name){return {onSnapshot(next){subscriptions[name]=next}}}}
};
vm.runInNewContext(source,context);

const timestamp=milliseconds=>({toMillis:()=>milliseconds});
const doc=(id,orderNumber,displayStatus,updatedAt)=>({
 id,
 data:()=>({orderNumber,displayStatus,updatedAt:timestamp(updatedAt)})
});
const now=fakeNow;

assert.ok(html.includes('<h2 id="readyTitle">조리완료</h2>'),'ready title uses 조리완료');
assert.ok(html.includes('조리완료 주문이 없습니다.'),'ready empty state uses 조리완료');
assert.ok(!html.includes('제조완료'),'legacy wording is absent from TV HTML');
assert.match(css,/\.ready-section \.order-number\.ready-overdue\{[^}]*border:4px solid #d71920;[^}]*background:#ffe1e1;[^}]*color:#b30009;[^}]*animation:ready-overdue-pulse 1s ease-in-out infinite/,'overdue card is red and animated');
assert.ok(css.includes('@keyframes ready-overdue-pulse'),'overdue pulse keyframes exist');
assert.strictEqual(intervals.length,1,'automatic highlight refresh timer is registered');
assert.strictEqual(intervals[0].delay,30000,'highlight refreshes every 30 seconds');

subscriptions.publicOrderDisplays({docs:[
 doc('recent','1111','ready',now-299999),
 doc('overdue','2222','ready',now-300001),
 doc('cooking','3333','cooking',now-600000)
]});
subscriptions.manualCustomerCalls({docs:[
 doc('manual-recent','4444','ready',now-299999),
 doc('manual-overdue','5555','ready',now-300001)
]});

let readyHTML=element('readyOrders').innerHTML;
assert.match(readyHTML,/class="order-number">1111<\/div>/,'ready under five minutes keeps normal green class');
assert.match(readyHTML,/class="order-number ready-overdue">2222<\/div>/,'public ready over five minutes is highlighted');
assert.match(readyHTML,/class="order-number">4444<\/div>/,'manual ready under five minutes keeps normal green class');
assert.match(readyHTML,/class="order-number ready-overdue">5555<\/div>/,'manual ready over five minutes is highlighted');
assert.ok(!readyHTML.includes('3333'),'cooking order is not rendered as ready');

fakeNow+=2;
intervals[0].callback();
readyHTML=element('readyOrders').innerHTML;
assert.match(readyHTML,/class="order-number ready-overdue">1111<\/div>/,'timer rerender can promote an order without reload');

subscriptions.publicOrderDisplays({docs:[
 doc('recent','1111','ready',now-300001),
 doc('cooking','3333','cooking',now-600000)
]});
assert.ok(!element('readyOrders').innerHTML.includes('2222'),'picked-up order disappears with its snapshot removal');

console.log('TV ready title, five-minute highlight, timer, pickup, and manual-call checks passed');
