const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'admin.css'),'utf8');
const adminOperations=require('../admin-operations.js');

for(const label of ['오더 리스트','(오늘 주문)','순번','예약/즉시','주문시간','전화번호','주문번호','포장/매장식사','좌석','인원','결제금액','결제수단','상세보기']){
 assert.ok(html.includes(label),`central list includes ${label}`);
}
assert.ok(html.includes('id="businessDayOrderCount"')&&html.includes('id="orderPagination"'),'live total and pagination controls exist');
const cssVersion=html.match(/admin\.css\?v=([0-9.]+)/)?.[1],jsVersion=html.match(/admin\.js\?v=([0-9.]+)/)?.[1];
assert.strictEqual(cssVersion,'47.6.0','changed administrator CSS has a new cache version');
assert.strictEqual(jsVersion,cssVersion,'administrator CSS and JS cache versions move together');
assert.ok(html.includes('주문 관리자 v47.6.0')&&html.includes('실시간 주문관리 · v47.6.0'),'page title and visible version match the changed core asset');
assert.ok(!html.includes('takeoutProcessingTitle')&&!html.includes('id="takeoutProcessing"'),'the duplicate left processing rail is removed');
for(const label of ['신규주문','결제대기','결제완료','사용중','완료'])assert.ok(admin.includes(label),`inline order actions include ${label}`);
assert.ok(admin.includes('data-confirm="결제를 확인하고 주문을 조리중으로 접수하시겠습니까?"'),'payment acceptance uses the required confirmation');
assert.ok(admin.includes('data-confirm="주문을 완료하고 연결된 좌석을 빈자리로 변경하시겠습니까?"'),'seat completion uses the required confirmation');
assert.ok(admin.includes("if(event.target.closest('button[data-action]'))return;"),'double-clicking an inline action cannot open order detail');

const inlineStart=admin.indexOf('function isPendingOrder('),inlineEnd=admin.indexOf('function centralOrderRow(',inlineStart);
assert.ok(inlineStart>=0&&inlineEnd>inlineStart,'inline state renderers found');
const inlineContext={
 esc:value=>String(value??''),adminOrderNumberLabel:()=> '1',orderSeatIds:order=>order.seatIds||[],seatDocuments:{seat1:{status:'occupied',orderId:'order-1'}},classifySeatOrderMismatch:adminOperations.classifySeatOrderMismatch,forceConfirmationValue:adminOperations.forceConfirmationValue
};
vm.createContext(inlineContext);vm.runInContext(admin.slice(inlineStart,inlineEnd),inlineContext);
const paymentFixtures=[
 ['payment_pending','결제대기',true],['new','결제대기',true],['accepted','결제완료',false],['paid','결제완료',false],
 ['cooking','결제완료',false],['ready','결제완료',false],['completed','결제완료',false],['cancelled','취소',false],
 [undefined,'확인 필요',false],[null,'확인 필요',false],['','확인 필요',false],['unknown_status','확인 필요',false]
];
for(const [status,label,actionable] of paymentFixtures){
 const markup=inlineContext.centralPaymentAction({id:'order-1',status});
 assert.ok(markup.includes(`>${label}<`),`${String(status)} displays ${label}`);
 assert.strictEqual(markup.includes('<button'),actionable,`${String(status)} actionable=${actionable}`);
 if(!actionable)assert.ok(!markup.includes('data-action=')&&!markup.includes('data-status='),`${String(status)} cannot start a transaction`);
}
for(const status of ['accepted','paid','cooking']){
 const markup=inlineContext.centralPaymentAction({id:'takeout-1',status,orderType:'takeout'});
 assert.match(markup,/data-action="confirm-takeout-complete"[^>]*>주문 완료<\/button>/,`${status} takeout exposes the guarded completion modal action`);
}
for(const status of ['payment_pending','new','ready','completed','cancelled',undefined,null,'','unknown']){
 assert.doesNotMatch(inlineContext.centralPaymentAction({id:'takeout-1',status,orderType:'takeout'}),/confirm-takeout-complete/,`${String(status)} takeout cannot start completion`);
}
assert.ok(html.includes('id="takeoutCompleteModal"')&&html.includes('aria-modal="true"')&&html.includes('포장 주문을 완료할까요?'),'takeout completion uses an accessible confirmation modal');
const pickupMarkup=inlineContext.centralPaymentAction({id:'takeout-ready',status:'ready',orderType:'takeout'});
assert.match(pickupMarkup,/data-action="confirm-takeout-pickup"[^>]*>픽업 완료<\/button>/,'ready takeout exposes the guarded pickup action');
for(const status of ['payment_pending','new','accepted','paid','cooking','completed','cancelled',undefined,null,'','unknown'])assert.doesNotMatch(inlineContext.centralPaymentAction({id:'takeout-1',status,orderType:'takeout'}),/confirm-takeout-pickup/,`${String(status)} takeout cannot start pickup completion`);
assert.ok(html.includes('id="takeoutPickupModal"')&&html.includes('aria-modal="true"')&&html.includes('픽업 완료 처리할까요?'),'pickup completion uses a separate accessible confirmation modal');
for(const status of ['cancelled',undefined,null,'','unknown_status']){
 const markup=inlineContext.centralSeatAction({id:'order-1',status,orderType:'dinein',seatIds:['seat1']});
 assert.ok(!markup.includes('<button'),`${String(status)} has no seat action`);
}
assert.ok(html.includes('admin-mobile.css?v=44.0.0'),'unchanged mobile CSS keeps its existing cache version');
assert.ok(!html.includes('id="channelFilters"')&&!html.includes('id="filters"'),'inactive channel and status filters are absent from the all-orders screen');
assert.ok(admin.includes('const CENTRAL_ORDER_PAGE_SIZE=15'),'the central list uses 15 rows per page');
assert.ok(admin.includes("addEventListener('dblclick'")&&admin.includes("if(!['Enter',' '].includes(event.key)"),'mouse and keyboard detail entry points exist');
assert.ok(admin.includes('selectedCentralOrderId=trigger.dataset.orderId;syncCentralOrderSelection(trigger)'),'single click updates the live row without replacing tbody');
assert.ok(admin.includes("document.body.classList.add('order-detail-open')")&&admin.includes("document.body.classList.remove('order-detail-open')"),'modal locks and restores background scrolling');
assert.ok(css.includes('table-layout:fixed')&&css.includes('overflow:hidden')&&css.includes('text-overflow:clip'),'the ten-column table prevents overlap without disguising required-value clipping');
assert.ok(css.includes('font-variant-numeric:tabular-nums')&&css.includes('font-feature-settings:"tnum" 1'),'numeric columns use stable tabular figures on Windows');

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
