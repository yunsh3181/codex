const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('admin.js');
const html=read('admin/index.html');
const css=read('admin.css');

assert.ok(html.includes('id="orderDetailModal"')&&html.includes('role="dialog"')&&html.includes('aria-modal="true"'),'one shared accessible order detail dialog exists');
assert.strictEqual((html.match(/id="orderDetailModal"/g)||[]).length,1,'the shared detail modal is not duplicated by status');
assert.ok(admin.includes('function renderOrderDetail(order,seatId=null)'),'all entry points share the same detail renderer');
assert.ok(admin.includes('function openOrderDetail(orderId,trigger=null)')&&admin.includes('function openSeatOrderDetail(seatId,trigger=null)'),'card and table entry points use shared detail opening');

for(const renderer of ['takeoutProcessingCard']){
 const start=admin.indexOf(`function ${renderer}(`);
 const source=start<0?'':admin.slice(start,admin.indexOf('\n}',start)+2);
 assert.ok(source.includes('order-detail-trigger')&&source.includes('data-order-id='),`${renderer} opens order detail`);
 assert.ok(source.includes('role="button"')&&source.includes('tabindex="0"'),`${renderer} is keyboard accessible`);
}
const pendingStart=admin.indexOf('function takeoutPendingCard(');
const pendingSource=pendingStart<0?'':admin.slice(pendingStart,admin.indexOf('\n}',pendingStart)+2);
const mainStart=admin.indexOf('function mainOrderCard(');
const mainSource=mainStart<0?'':admin.slice(mainStart,admin.indexOf('\n}',mainStart)+2);
assert.ok(pendingSource.includes('mainOrderCard(order,{takeoutAcceptance:true})'),'pending takeout uses the shared main order card');
assert.ok(mainSource.includes('order-detail-trigger')&&mainSource.includes('data-order-id='),'shared main card opens order detail');
assert.ok(mainSource.includes('role="button"')&&mainSource.includes('tabindex="0"'),'shared main card is keyboard accessible');
assert.ok(admin.includes("if(!['Enter',' '].includes(event.key)"),'Enter and Space activate clickable order cards');
assert.ok(admin.includes("event.key==='Escape'"),'Escape closes the shared order detail');
assert.ok(admin.includes("if(event.target===orderDetailModal){closeOrderDetail();return}"),'backdrop closes detail consistently');

const filterSource=admin.match(/function filterOrders[\s\S]*?\n}\nfunction reservationStatusLabel/)?.[0].replace(/\nfunction reservationStatusLabel[\s\S]*/,'');
assert.ok(filterSource,'main-list filter helpers found');
const filterContext={activeFilter:'completed',activeChannel:'all',PJCommon:{legacyChannel:()=> 'mobile'}};
vm.createContext(filterContext);
vm.runInContext(filterSource,filterContext);
const completed=[
 {id:'takeout-complete',orderType:'takeout',status:'completed'},
 {id:'takeout-ready',orderType:'takeout',status:'ready'},
 {id:'dinein-complete',orderType:'dinein',status:'completed',seat:{id:'papa-2'}},
 {id:'takeout-cancelled',orderType:'takeout',status:'cancelled'},
 {id:'takeout-failed',orderType:'takeout',status:'failed'}
];
assert.deepStrictEqual(Array.from(filterContext.ordersForMainList(completed),order=>order.id),['takeout-complete','takeout-ready','dinein-complete'],'completed list includes takeout without table fields and excludes cancelled/failed orders');
filterContext.activeFilter='payment_pending';
assert.deepStrictEqual(Array.from(filterContext.ordersForMainList([{id:'pending-dinein',orderType:'dinein',status:'payment_pending'},{id:'pending-takeout',orderType:'takeout',status:'payment_pending'}]),order=>order.id),['pending-dinein'],'pending takeout stays in its dedicated card instead of being duplicated');

const seatSource=admin.match(/function activeOrdersForSeat[\s\S]*?\n}\nfunction openSeatOrderDetail/)?.[0].replace(/\nfunction openSeatOrderDetail[\s\S]*/,'');
assert.ok(seatSource,'table-to-order resolver found');
const seatContext={
 orders:[
  {id:'older',orderType:'dinein',status:'accepted',createdAtClient:'2026-07-25T01:00:00Z',seat:{tables:['papa-2','papa-bar4']}},
  {id:'newer',orderType:'dinein',status:'cooking',createdAtClient:'2026-07-25T02:00:00Z',seat:{id:'papa-2'}},
  {id:'completed',orderType:'dinein',status:'completed',createdAtClient:'2026-07-25T03:00:00Z',seat:{id:'papa-2'}},
  {id:'takeout',orderType:'takeout',status:'accepted',createdAtClient:'2026-07-25T04:00:00Z'}
 ],
 ACTIVE_ORDER_STATUSES:new Set(['payment_pending','new','accepted','paid','cooking']),
 orderSeatIds(order){return order.seat?.tables||[order.seat?.id].filter(Boolean)},
 orderTimeMillis(value){return new Date(value).getTime()}
};
vm.createContext(seatContext);
vm.runInContext(seatSource,seatContext);
assert.deepStrictEqual(Array.from(seatContext.activeOrdersForSeat('papa-2'),order=>order.id),['newer','older'],'same-table active orders are newest-first, not arbitrary');
assert.deepStrictEqual(Array.from(seatContext.activeOrdersForSeat('papa-bar4'),order=>order.id),['older'],'every table in a multi-table order resolves to the same order');
assert.deepStrictEqual(Array.from(seatContext.activeOrdersForSeat('outdoor-4')),[],'an empty table resolves safely');

for(const label of ['예약','매장식사','포장','인원','좌석','연락처','복사','결제금액','완료','주문시간','피자','일회용 포크','결제수단','원 금액','할인금액','📣 고객 호출'])assert.ok(admin.includes(label),`detail includes ${label}`);
assert.ok(admin.includes("const seatLabel=takeout?'-':displayText(orderSeatLabel(order))"),'takeout detail keeps the shared seat slot without inventing a table');
assert.ok(admin.includes("event.preventDefault();event.stopPropagation()"),'nested actions stop detail-card propagation');
assert.ok(admin.includes("if(!id||statusUpdateLocks.has(id))return false"),'status mutations retain duplicate protection');
assert.ok(!admin.includes("collection('orders').where("),'detail access adds no new Firestore query or index requirement');
assert.ok(css.includes('width:min(1900px,calc(100vw - 20px))')&&css.includes('height:min(980px,calc(100vh - 20px))'),'detail dialog uses the available administrator viewport');
assert.ok(css.includes('grid-template-columns:minmax(0,45fr) minmax(0,55fr)'),'detail body preserves the approved 45:55 split');
assert.ok(css.includes('.detail-payment-grid')&&css.includes('grid-template-columns:repeat(4,minmax(0,1fr))'),'payment summary keeps exactly four columns');
assert.ok(css.includes('.detail-customer-call')&&css.includes('linear-gradient(100deg,#5f45c9,#834ce1,#6550c9)'),'customer call remains the large purple action');

console.log('admin shared order detail, completed takeout visibility, action isolation, and dining table resolution passed');
