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

for(const renderer of ['takeoutPendingCard','takeoutProcessingCard']){
 const start=admin.indexOf(`function ${renderer}(`);
 const source=start<0?'':admin.slice(start,admin.indexOf('\n}',start)+2);
 assert.ok(source.includes('order-detail-trigger')&&source.includes('data-order-id='),`${renderer} opens order detail`);
 assert.ok(source.includes('role="button"')&&source.includes('tabindex="0"'),`${renderer} is keyboard accessible`);
}
assert.ok(admin.includes("if(!['Enter',' '].includes(event.key)"),'Enter and Space activate clickable order cards');
assert.ok(admin.includes("event.key==='Escape'"),'Escape closes the shared order detail');
assert.ok(admin.includes("if(event.target===orderDetailModal){closeOrderDetail();return}"),'backdrop closes detail consistently');

const filterSource=admin.match(/function filterOrders[\s\S]*?\n}\nfunction adminStatusName/)?.[0].replace(/\nfunction adminStatusName[\s\S]*/,'');
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

for(const label of ['주문번호','주문 시각','주문 유형','전화번호','예약 주문','결제 상태','주문 상태','정상금액','할인금액','최종 결제금액'])assert.ok(admin.includes(label),`detail includes ${label}`);
for(const label of ['피자','사이드메뉴','음료','곁들이','도우','크러스트','하프앤하프','토핑'])assert.ok(admin.includes(label),`detail supports ${label}`);
assert.ok(admin.includes("takeout?'':`<div><span>테이블"),'takeout detail omits table while dine-in detail shows it');
assert.ok(admin.includes("event.preventDefault();event.stopPropagation()"),'nested actions stop detail-card propagation');
assert.ok(admin.includes("if(!id||statusUpdateLocks.has(id))return false"),'status mutations retain duplicate protection');
assert.ok(!admin.includes("collection('orders').where("),'detail access adds no new Firestore query or index requirement');
assert.ok(css.includes('.order-detail-panel')&&css.includes('max-height:min(90vh,920px)')&&css.includes('overflow:auto'),'detail dialog stays within the viewport and scrolls internally');

console.log('admin shared order detail, completed takeout visibility, action isolation, and dining table resolution passed');
