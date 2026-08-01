const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const start=admin.indexOf('function normalizedOption');
const end=admin.indexOf('\nfunction showOrderDetail',start);
assert.ok(start>=0&&end>start,'order detail renderer source exists');

const catalog={
 pizzas:{P001:'페퍼로니'},
 toppings:{T001:'양파',T002:'피망'},
 sides:{S001:'치킨스트립'},
 drinks:{D001:'코카-콜라 1.25L'},
 sauces:{}
};
const context={
 ORDER_CATALOG:catalog,
 PIZZAS:[{id:'P001',name:'페퍼로니'}],
 TOPPINGS:[{id:'T001',name:'양파'},{id:'T002',name:'피망'}],
 SIDES:[{id:'S001',name:'치킨스트립'}],
 DRINKS:[{id:'D001',name:'코카-콜라 1.25L'}],
 PJCommon:{legacyChannel:()=> 'mobile'},
 displayText(value,fallback='-'){
  if(typeof value==='string'||typeof value==='number')return String(value).trim()||fallback;
  return fallback;
 },
 productName(id,category,legacy=[]){return catalog[category]?.[id]||legacy.find(item=>item.id===id)?.name||id},
 esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))},
 money(value){return Number(value||0).toLocaleString('ko-KR')+'원'},
 adminOrderNumberLabel:()=> '6707',
 orderSeatLabel:()=> '별관 4번',
 formatTime:()=> '07. 30. 오후 12:22'
};
vm.createContext(context);
vm.runInContext(admin.slice(start,end),context);

const baseOrder={
 orderNo:'D6707',customerNumber:'D6707',orderType:'dinein',partySize:2,
 phone:'01067786707',status:'completed',createdAtClient:'2026-07-30T03:22:00Z',
 seat:{zone:'annex',tables:['annex-4']},
 pickup:null,disposables:true,
 normalAmount:65800,totalAmount:55400,total:55400,
 payment:{methodName:'현금'},language:'ko',
 items:[{
  pizzaLeft:'P001',size:'F',dough:'오리지널',crust:'치즈롤',qty:1,total:43000,
  toppings:{T001:1,T002:2},
  sides:{S001:{quantity:1,total:9900}},includedSides:{},
  drinks:{D001:{quantity:2,total:2500}},includedDrinks:{}
 }]
};

const reserved=context.renderOrderDetail({...baseOrder,pickup:{mode:'reserve',time:'12:30'}});
assert.ok(reserved.includes('detail-reservation">예약</span>'),'reservation appears only from saved reservation data');
assert.ok(reserved.includes('detail-order-type dinein">매장식사'),'dine-in uses the green-type class and actual label');
assert.ok(reserved.includes('pizza-code-alpha">CH</span>14'),'alphabetic pizza code characters are isolated from numeric characters');
assert.ok(reserved.includes('페퍼로니')&&reserved.includes(' + 양파 + 피망2'),'pizza name and saved topping quantities are rendered separately');
assert.ok(reserved.includes('치킨스트립')&&reserved.includes('9,900원'),'a stored side-line price is rendered without fabrication');
assert.ok(reserved.includes('코카-콜라 1.25L')&&reserved.includes('*2')&&reserved.includes('2,500원'),'stored drink quantity and price remain aligned');
assert.ok(reserved.includes('<span>일회용 포크</span><strong>O</strong>'),'saved true fork choice renders O');
assert.ok(reserved.includes('data-action="copy-phone"')&&reserved.includes('data-action="call-customer"'),'existing copy and customer-call actions stay connected');
assert.ok(reserved.includes('<span>결제수단</span>')&&reserved.includes('<span>원 금액</span>')&&reserved.includes('<span>할인금액</span>'),'four-column payment data uses agreed labels');

const normal=context.renderOrderDetail({...baseOrder,status:'cooking',pickup:{mode:'now',time:null},disposables:false});
assert.ok(!normal.includes('detail-reservation">예약</span>'),'normal orders remove the reservation label and its space');
assert.ok(normal.includes('<span>일회용 포크</span><strong>X</strong>'),'saved false fork choice renders X');
assert.ok(!normal.includes('<strong><i></i>완료</strong>'),'incomplete orders do not claim completion');

const takeout=context.renderOrderDetail({...baseOrder,orderType:'takeout',seat:null});
assert.ok(takeout.includes('detail-order-type takeout">포장'),'takeout uses the red-type class and actual label');

const legacy=context.renderOrderDetail({...baseOrder,disposables:undefined,items:[{...baseOrder.items[0],sides:{S001:1},drinks:{D001:2}}]});
const chickenLine=legacy.match(/<div class="detail-menu-line extra"><span class="detail-menu-name">치킨스트립[\s\S]*?<\/div>/)?.[0]||'';
assert.ok(chickenLine&&!chickenLine.includes('detail-menu-price'),'legacy lines without stored prices do not invent or calculate a price');

console.log('admin full-screen order detail reservation, colors, prices, fork choice, copy, and call checks passed');
