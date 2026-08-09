const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const adminSource=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const adminCssSource=fs.readFileSync(path.join(root,'admin.css'),'utf8');
const catalogSource=fs.readFileSync(path.join(root,'order-catalog.js'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');

const dataMatch=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);
assert.ok(dataMatch,'embedded kiosk data exists');
const dataContext={window:{}};
vm.createContext(dataContext);
vm.runInContext(`window.KIOSK_DATA=${dataMatch[1]}`,dataContext);
vm.runInContext(catalogSource,dataContext,{filename:'order-catalog.js'});
const kiosk=dataContext.window.KIOSK_DATA;
const catalog=dataContext.window.PJ_ORDER_CATALOG;
for(const [sourceKey,catalogKey] of [['PIZZAS','pizzas'],['TOPPINGS','toppings'],['SIDES','sides'],['DRINKS','drinks'],['SAUCES','sauces']]){
  for(const item of kiosk[sourceKey])assert.strictEqual(catalog[catalogKey][item.id],item.name,`${sourceKey} ${item.id} uses the customer catalog name`);
}

assert.ok(!adminSource.includes('MOBILE_SIDE_NAMES'),'stale side-name guesses were removed');
assert.ok(!adminSource.includes('MOBILE_DRINK_NAMES'),'stale drink-name guesses were removed');
assert.ok(!adminSource.includes('item?.pizzaName||'),'admin pizza display does not trust a stored locale string');
assert.ok(adminSource.includes("productName(leftId,'pizzas'"),'admin pizza display looks up IDs');
assert.ok(adminSource.includes("ORDER_CATALOG.sauces?.[id]?'sauces':'drinks'"),'admin distinguishes sauces by ID');
for(const label of ['주문시간','이용방법','인원','좌석','연락처','결제수단','분할결제'])assert.ok(adminSource.includes(label),`admin card includes ${label}`);
for(const label of ['피자','토핑','사이드','음료','원 금액','할인금액','결제금액'])assert.ok(adminSource.includes(label),`admin item card includes ${label}`);
assert.ok(!adminSource.includes('toggleOrderDetail'),'order list no longer has a detail toggle function');
assert.ok(!adminSource.includes('data-action="toggle-detail"'),'order card has no detail toggle button');
assert.ok(!adminSource.includes('class="order-detail"'),'order card has no hidden detail block');
assert.ok(adminSource.includes('orderMenuHTML(order)'),'complete menu information is rendered directly in each card');
assert.ok(adminSource.includes('orderOperationsHTML(order)'),'operations and payment information is rendered directly in each card');
assert.ok(adminCssSource.includes('grid-template-columns:minmax(0,1fr);gap:15px;width:100%'),'order list uses one full-width card per row');
assert.ok(!adminSource.includes("['사이즈',adminCustomerSizeLabel"),'size is not repeated as a separate item row');
assert.ok(!adminSource.includes("['도우',adminCustomerDoughLabel"),'dough is not repeated as a separate item row');
assert.ok(!adminSource.includes("['크러스트',adminCustomerCrustLabel"),'crust is not repeated as a separate item row');

const pizzaHelperMatch=adminSource.match(/function normalizedOption[\s\S]*?\nfunction adminPizzaName/);
assert.ok(pizzaHelperMatch,'pizza display helpers found');
const pizzaContext={String,Number,Math,displayText(value,fallback='-'){if(typeof value==='string'||typeof value==='number')return String(value).trim()||fallback;return fallback},esc(value){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}};
vm.createContext(pizzaContext);
vm.runInContext(pizzaHelperMatch[0].replace(/\nfunction adminPizzaName$/,''),pizzaContext,{filename:'pizza-display-helpers.js'});
const code=pizzaContext.formatPizzaDisplayCode;
for(const [pizza,expected] of [
 [{size:'R',dough:'오리지널',crust:'오리지널'},'9"'],
 [{size:'L',dough:'오리지널',crust:'오리지널'},'12"'],
 [{size:'F',dough:'오리지널',crust:'오리지널'},'14"'],
 [{size:'F',dough:'씬도우',crust:'오리지널'},'TH'],
 [{size:'L',crust:'치즈롤'},'CH12'],
 [{size:'F',crust:'치즈롤'},'CH14'],
 [{size:'L',crust:'골드링'},'12G'],
 [{size:'F',crust:'골드링'},'14G'],
 [{size:'F',dough:'씬도우',crust:'골드링'},'T14G'],
 [{size:'L',dough:'크루아상',crust:'오리지널'},'CRO12']
])assert.strictEqual(code(pizza),expected,`${JSON.stringify(pizza)} becomes ${expected}`);
assert.strictEqual(code({size:'F',dough:'씬도우',crust:'골드링'}),'T14G','thin gold ring takes priority over thin default');
assert.notStrictEqual(code({size:'L',dough:'씬도우',crust:'오리지널'}),'TH','unsupported thin combination is not converted to TH');
assert.notStrictEqual(code({size:'F',dough:'씬도우',crust:'임의크러스트'}),'TH','unsupported thin crust is not converted to TH');
const renderedTH=pizzaContext.renderPizzaDisplayCode('TH');
assert.strictEqual((renderedTH.match(/pizza-code-alpha/g)||[]).length,1,'TH uses one alpha span containing both letters');
assert.ok(renderedTH.includes('pizza-code-alpha">TH</span>'),'T and H both receive the alpha class');
assert.ok(renderedTH.startsWith('<span class="pizza-code">[')&&renderedTH.endsWith(']</span>'),'TH brackets stay outside the alpha span');
const renderedT14G=pizzaContext.renderPizzaDisplayCode('T14G');
assert.strictEqual((renderedT14G.match(/pizza-code-alpha/g)||[]).length,2,'T14G highlights T and G separately');
assert.ok(!pizzaContext.renderPizzaDisplayCode('12"').includes('pizza-code-alpha'),'plain size code has no alpha class');
assert.ok(adminSource.includes('<span class="admin-item-name">'),'detail lists separate product names from quantities');
assert.ok(adminSource.includes('class="admin-pizza-heading"'),'pizza code and name share a dedicated one-line heading');
assert.ok(adminSource.includes('class="admin-pizza-name"'),'pizza name uses an element separate from the code');
assert.ok(adminCssSource.includes('.admin-product-row{display:flex'),'detail product rows use flex layout');
assert.ok(adminCssSource.includes('justify-content:space-between'),'detail quantities align to the right edge');
assert.ok(adminCssSource.includes('white-space:nowrap!important;word-break:keep-all!important;overflow-wrap:normal!important'),'pizza codes override inherited wrapping rules');
assert.ok(adminCssSource.includes('.pizza-code-alpha{display:inline!important;margin:0!important}'),'pizza code letters override the generic order-item block span rule');
assert.ok(adminCssSource.includes('.admin-quantity{display:block!important;flex:0 0 auto'),'detail quantities stay at the right edge and do not shrink');
assert.ok(adminCssSource.includes(".admin-toppings .admin-detail-list>.admin-product-row::before{content:'•'"),'topping rows retain their bullet');
assert.ok(adminCssSource.includes('border-radius:0!important;background:transparent!important'),'pizza detail uses a compact POS-style list instead of cards');

const sortHelperMatch=adminSource.match(/function orderTimeMillis[\s\S]*?\n}\nfunction seoulBusinessDayKey/);
assert.ok(sortHelperMatch,'oldest-first order comparator found');
const sortContext={Number,Date};
vm.createContext(sortContext);
vm.runInContext(sortHelperMatch[0].replace(/\nfunction seoulBusinessDayKey[\s\S]*/,''),sortContext);
const sorted=[
 {id:'third',createdAtClient:'2026-07-20T10:00:00Z',sequence:3},
 {id:'first',createdAt:'2026-07-20T08:00:00Z',sequence:1},
 {id:'second',createdAtClient:'2026-07-20T09:00:00Z',sequence:2}
].sort(sortContext.compareOrdersOldestFirst);
assert.deepStrictEqual(sorted.map(order=>order.id),['first','second','third'],'oldest order is first and missing createdAt falls back to createdAtClient');
const sameTime=[{id:'b',createdAtClient:'2026-07-20T09:00:00Z',dailySequence:2},{id:'a',createdAtClient:'2026-07-20T09:00:00Z',sequence:1}].sort(sortContext.compareOrdersOldestFirst);
assert.deepStrictEqual(sameTime.map(order=>order.id),['a','b'],'sequence breaks equal-time ties');
const filteredThenSorted=[{id:'newer',status:'paid',createdAtClient:'2026-07-20T11:00:00Z'},{id:'ignored',status:'cancelled',createdAtClient:'2026-07-20T07:00:00Z'},{id:'older',status:'paid',createdAtClient:'2026-07-20T10:00:00Z'}].filter(order=>order.status==='paid').sort(sortContext.compareOrdersOldestFirst);
assert.deepStrictEqual(filteredThenSorted.map(order=>order.id),['older','newer'],'filtered orders remain oldest first');

const paymentHelperMatch=adminSource.match(/function safeAmounts[\s\S]*?\n}\nfunction orderMenuHTML/);
assert.ok(paymentHelperMatch,'safe amount and split-payment helpers found');
const paymentContext={Number,Math,Array};
vm.createContext(paymentContext);
vm.runInContext(paymentHelperMatch[0].replace(/\nfunction orderMenuHTML[\s\S]*/,''),paymentContext);
for(const [paid,count,expected] of [[76100,5,[15220,15220,15220,15220,15220]],[26000,2,[13000,13000]]]){
 const summary=paymentContext.splitPaymentSummary({payment:{method:'meal_ticket',splitCount:count}},paid);
 assert.deepStrictEqual(Array.from(summary.amounts),expected,`${paid} is split exactly across ${count} people`);
 assert.strictEqual(summary.total,paid,'split amount sum matches paid amount');
}
const storedSplit=paymentContext.splitPaymentSummary({payment:{method:'meal_ticket',splitCount:5,splitAmounts:[15000,15000,15000,15000,16100]}},76100);
assert.deepStrictEqual(Array.from(storedSplit.amounts),[15000,15000,15000,15000,16100],'stored splitAmounts take priority');
assert.strictEqual(paymentContext.splitPaymentSummary({payment:{method:'meal_ticket',splitCount:1}},31000),null,'split count 1 is hidden');
assert.strictEqual(paymentContext.splitPaymentSummary({payment:{method:'meal_ticket',splitCount:0}},31000),null,'invalid split count is hidden');
assert.strictEqual(paymentContext.splitPaymentSummary({payment:{method:'card',splitCount:4,splitAmounts:[10000,10000,10000,10000]}},40000),null,'non-meal-ticket split metadata is hidden');
assert.strictEqual(paymentContext.splitPaymentSummary({payment:{method:'meal_ticket',splitCount:3}},10000),null,'non-divisible legacy totals are not presented as equal splits');
const mixedKnown=paymentContext.splitPaymentSummary({payment:{methods:[{method:'meal_ticket',amount:28000,splitCount:3,splitAmounts:[10000,10000,8000]},{method:'card',amount:12000}]}},40000);
assert.deepStrictEqual(Array.from(mixedKnown.amounts),[10000,10000,8000],'known mixed payment uses only the meal-ticket entry');
assert.strictEqual(mixedKnown.total,28000,'card amount is excluded from the meal-ticket split total');
assert.strictEqual(paymentContext.splitPaymentSummary({payment:{methods:[{method:'meal_ticket'},{method:'card'}],splitCount:4,splitAmounts:[10000,10000,10000,10000]}},40000),null,'ambiguous mixed legacy data never treats the whole paid amount as meal-ticket money');
assert.strictEqual(paymentContext.splitPaymentSummary({payment:{methods:['meal_ticket','card'],splitCount:4,splitAmounts:[10000,10000,10000,10000]}},40000),null,'string-only mixed methods hide split details');
assert.deepStrictEqual(JSON.parse(JSON.stringify(paymentContext.safeAmounts({total:31000,discountAmount:-100}))),{original:31000,discount:0,paid:31000},'negative discounts are clamped and amounts stay finite');
assert.deepStrictEqual(JSON.parse(JSON.stringify(paymentContext.safeAmounts({originalAmount:'bad',total:undefined}))),{original:0,discount:0,paid:0},'missing and invalid amounts safely fall back to zero');

assert.ok(!adminSource.includes("db.collection('dailyStats').doc(`order-sequence_"),'administrator display sequencing creates no counter document');
assert.ok(adminSource.includes('adminDisplaySequence:index+1'),'sequence is derived from the deterministic business-day ordering');
assert.ok(!adminSource.includes('transaction.update(orderRef,{businessDay,sequence:next,dailySequence:next'),'display sequence is never persisted on the order');
assert.ok(rules.includes("match /dailyStats/{document=**} { allow read, write: if isAdmin(); }"),'existing rules authorize authenticated admin counter writes');
assert.ok(rules.includes("request.resource.data.businessDay == resource.data.businessDay"),'public display rules prevent an existing business day from being overwritten');

const functionMatch=adminSource.match(/function seoulBusinessDayKey[\s\S]*?\n}\nconst ORDER_CATALOG/);
assert.ok(functionMatch,'business day helper found');
const timeContext={Intl,Date,Object,Number,compareOrdersOldestFirst:sortContext.compareOrdersOldestFirst};
vm.createContext(timeContext);
vm.runInContext(functionMatch[0].replace(/\nconst ORDER_CATALOG[\s\S]*/,''),timeContext);
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-20T00:00:00.000Z')),'2026-07-20','09:00 KST starts a new business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-19T23:59:59.000Z')),'2026-07-19','08:59:59 KST remains on the previous business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-20T13:00:00.000Z')),'2026-07-20','22:00 KST remains on the current business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-21T23:59:00.000Z')),'2026-07-21','08:59 KST remains on the previous business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-22T00:00:00.000Z')),'2026-07-22','09:00 KST starts the next business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-22T14:59:00.000Z')),'2026-07-22','23:59 KST stays on the current business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-22T15:30:00.000Z')),'2026-07-22','00:30 KST stays on the previous calendar business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-23T00:00:00.000Z')),'2026-07-23','next 09:00 KST starts a new business day');
assert.strictEqual(timeContext.seoulBusinessDayKey('not-a-date'),null,'invalid dates are rejected safely');

const businessNow=new Date('2026-07-22T03:00:00.000Z');
const businessOrders=[
 {id:'today-pending',businessDay:'2026-07-22',status:'payment_pending',createdAtClient:'2026-07-22T01:00:00.000Z'},
 {id:'today-done',businessDay:'2026-07-22',status:'completed',createdAtClient:'2026-07-22T02:00:00.000Z'},
 {id:'yesterday-active',businessDay:'2026-07-21',status:'accepted',createdAtClient:'2026-07-21T02:00:00.000Z'},
 {id:'yesterday-ready',businessDay:'2026-07-21',status:'ready',createdAtClient:'2026-07-21T03:00:00.000Z'},
 {id:'yesterday-cancelled',businessDay:'2026-07-21',status:'cancelled',createdAtClient:'2026-07-21T04:00:00.000Z'},
 {id:'created-at-fallback',status:'completed',createdAt:'2026-07-22T02:30:00.000Z'},
 {id:'client-fallback',status:'completed',createdAtClient:'2026-07-22T02:45:00.000Z'},
 {id:'missing-date',status:'payment_pending'}
];
const visible=Array.from(timeContext.visibleBusinessDayOrders(businessOrders,businessNow));
assert.deepStrictEqual(visible.map(order=>order.id),['today-pending','today-done','created-at-fallback','client-fallback'],'today list contains the complete current business day only');
assert.strictEqual(timeContext.orderBusinessDayKey(businessOrders[5]),'2026-07-22','createdAt provides a missing business day');
assert.strictEqual(timeContext.orderBusinessDayKey(businessOrders[6]),'2026-07-22','createdAtClient is the final date fallback');
assert.strictEqual(timeContext.orderBusinessDayKey(businessOrders[7]),null,'orders without dates are safely excluded');
assert.strictEqual(timeContext.isCurrentBusinessDayOrder(businessOrders[0],businessNow),true,'current-day added order is eligible for notification');
assert.strictEqual(timeContext.isCurrentBusinessDayOrder(businessOrders[2],businessNow),false,'past active added order is not eligible for notification');
const capped=Array.from(timeContext.visibleBusinessDayOrders(Array.from({length:101},(_,index)=>({id:`order-${index+1}`,businessDay:'2026-07-22',status:'completed',createdAtClient:new Date(Date.UTC(2026,6,22,0,0,index)).toISOString()})),businessNow));
assert.strictEqual(capped.length,101,'the current business day total is never truncated for pagination');
assert.strictEqual(capped[0].id,'order-1','the oldest order remains available with sequence 1');
assert.strictEqual(capped[100].id,'order-101','the newest order remains available for descending display');
assert.ok(adminSource.includes("notifyNewOrders(added.filter(o=>['payment_pending','new'].includes(o.status)&&isCurrentBusinessDayOrder(o,now)))"),'new-order notification is limited to current-business-day pending orders');
assert.ok(!adminSource.includes("collection('orders').limit(200)"),'subscription does not truncate current-day orders behind historical documents');

const orderCreateRules=rules.match(/function validOrderCreate\(\) \{([\s\S]*?)\n    \}/)[1];
const allowedKeys=orderCreateRules.match(/request\.resource\.data\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/)[1].match(/'([^']+)'/g).map(x=>x.slice(1,-1));
const returnBlock=html.match(/return \{\n  channel:'mobile'[\s\S]*?\n \}\n}\nasync function submitMobileOrder/)[0];
assert.ok(!returnBlock.includes('discountBreakdown'),'mobile payload excludes fields rejected by Firestore rules');
for(const key of ['items','itemCount','normalAmount','discountAmount','totalAmount','total','payment','benefit'])assert.ok(allowedKeys.includes(key),`${key} is allowed by Firestore rules`);
assert.ok(allowedKeys.includes('disposables'),'the saved disposable-fork choice is allowed by Firestore rules');
assert.ok(returnBlock.includes('disposables:state.disposables===true'),'the submitted order stores an explicit disposable-fork boolean');
assert.ok(rules.includes("!request.resource.data.keys().hasAny(['disposables'])"),'legacy clients may omit the disposable-fork field during rollout');
assert.ok(rules.includes('request.resource.data.disposables is bool'),'when present, Firestore requires a real disposable-fork boolean');
for(const key of ['pizzaLeft','pizzaRight','crust','dough','toppings','sides','drinks','includedSides','includedDrinks','qty','discountAmount','total'])assert.ok(html.includes(`${key}:`),`order items retain ${key}`);

async function verifyDeterministicDisplaySequence(){
  const sourceOrders=[
    {id:'o2',businessDay:'2026-07-20',createdAtClient:'2026-07-20T00:00:00.000Z'},
    {id:'o1',businessDay:'2026-07-20',createdAtClient:'2026-07-20T00:00:00.000Z'},
    {id:'o3',businessDay:'2026-07-20',createdAtClient:'2026-07-20T00:00:00.001Z'}
  ];
  const result=Array.from(timeContext.visibleBusinessDayOrders(sourceOrders,new Date('2026-07-20T03:00:00Z')));
  assert.deepStrictEqual(result.map(order=>[order.id,order.adminDisplaySequence]),[['o1',1],['o2',2],['o3',3]],'same-time orders use document ID and receive unique display-only sequences');
  assert.ok(!adminSource.includes('ensureOrderSequence')&&!adminSource.includes('sequenceAssignedAt'),'display sequencing has no asynchronous Firestore allocator');
}

async function verifyPublicDisplayBusinessDayBackfill(){
  const match=adminSource.match(/let publicDisplayBusinessDayBackfill=null;[\s\S]*?\n}\n\nfunction scheduleBusinessDayRefresh/);
  assert.ok(match,'public display business-day backfill source found');
  const documents=new Map([
    ['legacy',{orderNumber:'P9999',displayStatus:'ready'}],
    ['current',{orderNumber:'P1234',displayStatus:'ready',businessDay:'2026-08-01'}],
    ['invalid-existing',{orderNumber:'P5555',displayStatus:'ready',businessDay:'suspect'}],
    ['missing-source',{orderNumber:'P0001',displayStatus:'ready'}],
    ['invalid-source-date',{orderNumber:'P0002',displayStatus:'ready'}]
  ]);
  const writes=new Map();
  const ref=id=>({id});
  const docs=['legacy','current','invalid-existing','missing-source','invalid-source-date','legacy'].map(id=>({id,ref:ref(id),data:()=>({...documents.get(id)})}));
  let transactionQueue=Promise.resolve();
  const db={
    collection(){return {async get(){return {docs}}}},
    runTransaction(work){
      const run=transactionQueue.then(async()=>{
        const pending=[];
        await work({
          async get(documentRef){const value=documents.get(documentRef.id);return {exists:value!==undefined,data:()=>({...value})}},
          update(documentRef,value){pending.push(()=>{documents.set(documentRef.id,{...documents.get(documentRef.id),...value});writes.set(documentRef.id,(writes.get(documentRef.id)||0)+1)})}
        });
        pending.forEach(write=>write());
      });
      transactionQueue=run.catch(()=>{});
      return run;
    }
  };
  const context={Map,Promise,console,Date,Number,orderBusinessDayKey:order=>order?.businessDay||null,db,firebase:{firestore:{FieldValue:{serverTimestamp(){return 'server-time'}}}}};
  vm.createContext(context);
  vm.runInContext(match[0].replace(/\nfunction scheduleBusinessDayRefresh[\s\S]*/,''),context,{filename:'public-display-business-day-backfill.js'});
  const sourceOrders=[{id:'legacy',businessDay:'2026-07-31'},{id:'current',businessDay:'2026-08-01'},{id:'invalid-existing',businessDay:'2026-08-01'},{id:'invalid-source-date',businessDay:'not-a-date'}];
  await Promise.all([context.backfillPublicDisplayBusinessDays(sourceOrders),context.backfillPublicDisplayBusinessDays(sourceOrders)]);
  assert.strictEqual(documents.get('legacy').businessDay,'2026-07-31','P9999-style document receives the source order business day without a number exception');
  assert.strictEqual(writes.get('legacy'),1,'duplicate target in one snapshot is written at most once');
  assert.strictEqual(writes.get('current'),undefined,'valid existing business day is not written');
  assert.strictEqual(writes.get('invalid-existing'),undefined,'an existing suspect value is not automatically overwritten');
  assert.strictEqual(writes.get('missing-source'),undefined,'missing source order is skipped');
  assert.strictEqual(writes.get('invalid-source-date'),undefined,'invalid source date never falls back to today');
  await context.backfillPublicDisplayBusinessDays(sourceOrders);
  assert.strictEqual(writes.get('legacy'),1,'a repeated snapshot after backfill produces no additional write');
  context.publicDisplayBusinessDayBackfill=null;
  await context.backfillPublicDisplayBusinessDays(sourceOrders);
  assert.strictEqual(writes.get('legacy'),1,'admin page reinitialization produces no additional write');
  documents.set('legacy',{...documents.get('legacy'),displayStatus:'ready',updatedAt:'later'});
  await context.backfillPublicDisplayBusinessDays(sourceOrders);
  assert.strictEqual(documents.get('legacy').businessDay,'2026-07-31','status and updatedAt changes preserve the original business day');
  assert.strictEqual(writes.get('legacy'),1,'status and updatedAt changes do not trigger another backfill write');
}

Promise.all([verifyDeterministicDisplaySequence(),verifyPublicDisplayBusinessDayBackfill()]).then(()=>console.log('canonical order catalog, public display business-day backfill, Firestore schema, and deterministic 09:00 Asia/Seoul display sequence passed')).catch(error=>{console.error(error);process.exitCode=1});
