const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'admin.css'),'utf8');

for(const label of ['오더 리스트','(오늘 주문)','순번','예약/즉시','주문시간','전화번호','주문번호','포장/매장식사','좌석','인원','결제금액','결제수단','상세보기']){
 assert.ok(html.includes(label),`central list includes ${label}`);
}
assert.ok(html.includes('id="businessDayOrderCount"')&&html.includes('id="orderPagination"'),'live total and pagination controls exist');
assert.ok(admin.includes('const CENTRAL_ORDER_PAGE_SIZE=15'),'the central list uses 15 rows per page');
assert.ok(admin.includes("addEventListener('dblclick'")&&admin.includes("if(!['Enter',' '].includes(event.key)"),'mouse and keyboard detail entry points exist');
assert.ok(admin.includes("document.body.classList.add('order-detail-open')")&&admin.includes("document.body.classList.remove('order-detail-open')"),'modal locks and restores background scrolling');
assert.ok(css.includes('table-layout:fixed')&&css.includes('overflow:hidden')&&css.includes('text-overflow:ellipsis'),'the ten-column table prevents horizontal overlap');

const start=admin.indexOf('function orderTimeMillis(');
const end=admin.indexOf('const ORDER_CATALOG=',start);
assert.ok(start>=0&&end>start,'business-day helper source found');
const context={Intl,Date,Number,String,Boolean,Set};
vm.createContext(context);
vm.runInContext(admin.slice(start,end),context);

const at=value=>new Date(value);
assert.strictEqual(context.seoulBusinessDayKey(at('2026-08-05T23:59:59Z')),'2026-08-05','08:59:59 Seoul belongs to the prior business day');
assert.strictEqual(context.seoulBusinessDayKey(at('2026-08-06T00:00:00Z')),'2026-08-06','09:00:00 Seoul starts the new business day');
assert.strictEqual(context.seoulBusinessDayKey(at('2026-08-06T12:59:59Z')),'2026-08-06','21:59:59 remains in the current business day');
assert.strictEqual(context.seoulBusinessDayKey(at('2026-08-06T15:30:00Z')),'2026-08-06','orders after closing remain until the next 09:00 boundary');
assert.strictEqual(context.seoulBusinessDayKey(at('2026-08-06T23:59:59Z')),'2026-08-06','next-day 08:59:59 remains in the prior business day');

const now=at('2026-08-06T14:00:00Z');
const mixed=[
 {id:'dine-now',orderType:'dinein',createdAtClient:'2026-08-06T01:00:00Z'},
 {id:'takeout-reserve',orderType:'takeout',createdAtClient:'2026-08-06T02:00:00Z'},
 {id:'same-b',createdAtClient:'2026-08-06T03:00:00Z'},
 {id:'same-a',createdAtClient:'2026-08-06T03:00:00Z'},
 {id:'previous-day',createdAtClient:'2026-08-05T02:00:00Z',status:'cooking'}
];
const first=Array.from(context.visibleBusinessDayOrders(mixed,now));
const shuffled=Array.from(context.visibleBusinessDayOrders([...mixed].reverse(),now));
assert.deepStrictEqual(first.map(order=>[order.id,order.adminDisplaySequence]),[
 ['dine-now',1],['takeout-reserve',2],['same-a',3],['same-b',4]
],'takeout, dine-in, immediate, and reservation data share one sequence with ID tie-breaking');
assert.deepStrictEqual(shuffled.map(order=>[order.id,order.adminDisplaySequence]),first.map(order=>[order.id,order.adminDisplaySequence]),'listener input order cannot change the sequence');
assert.ok(!admin.includes('assignMissingOrderSequences')&&!admin.includes("collection('dailyStats').doc(`order-sequence_"),'display sequencing performs no Firestore counter or order writes');
assert.ok(admin.includes("db.collection('orders').onSnapshot")&&!admin.includes("collection('orders').where("),'the existing single orders listener is reused without N+1 reads');

console.log('admin central business-day list, deterministic sequence, pagination, and accessible detail checks passed');
