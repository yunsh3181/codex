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
for(const label of ['순번','주문번호','주문시간','주문채널','이용방법','예약','인원','구역','좌석','연락처','적용혜택','결제수단','분할결제'])assert.ok(adminSource.includes(`'${label}'`),`admin detail includes ${label}`);
for(const label of ['피자','토핑','사이드','음료','금액 정보','원 금액','할인금액','결제금액'])assert.ok(adminSource.includes(label),`admin item detail includes ${label}`);
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

assert.ok(adminSource.includes("db.collection('dailyStats').doc(`order-sequence_"),'sequence uses the admin-writable dailyStats counter');
assert.ok(adminSource.includes('db.runTransaction(async transaction=>'),'sequence allocation uses a Firestore transaction');
assert.ok(adminSource.includes('Promise.all([transaction.get(orderRef),transaction.get(counterRef)])'),'transaction reads before writes');
assert.ok(adminSource.includes('transaction.update(orderRef,{businessDay,sequence:next,dailySequence:next'),'sequence is persisted on the order');
assert.ok(rules.includes("match /dailyStats/{document=**} { allow read, write: if isAdmin(); }"),'existing rules authorize authenticated admin counter writes');

const functionMatch=adminSource.match(/function seoulBusinessDayKey[\s\S]*?\n}\nconst sequenceAssignments/);
assert.ok(functionMatch,'business day helper found');
const timeContext={Intl,Date,Object,Number};
vm.createContext(timeContext);
vm.runInContext(functionMatch[0].replace(/\nconst sequenceAssignments[\s\S]*/,''),timeContext);
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-20T00:00:00.000Z')),'2026-07-20','09:00 KST starts a new business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-19T23:59:59.000Z')),'2026-07-19','08:59:59 KST remains on the previous business day');
assert.strictEqual(timeContext.seoulBusinessDayKey(new Date('2026-07-20T13:00:00.000Z')),'2026-07-20','22:00 KST remains on the current business day');

const allowedKeys=rules.match(/request\.resource\.data\.keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/)[1].match(/'([^']+)'/g).map(x=>x.slice(1,-1));
const returnBlock=html.match(/return \{\n  channel:'mobile'[\s\S]*?\n \}\n}\nasync function submitMobileOrder/)[0];
assert.ok(!returnBlock.includes('discountBreakdown'),'mobile payload excludes fields rejected by Firestore rules');
for(const key of ['items','itemCount','normalAmount','discountAmount','totalAmount','total','payment','benefit'])assert.ok(allowedKeys.includes(key),`${key} is allowed by Firestore rules`);
for(const key of ['pizzaLeft','pizzaRight','crust','dough','toppings','sides','drinks','includedSides','includedDrinks','qty','discountAmount','total'])assert.ok(html.includes(`${key}:`),`order items retain ${key}`);

async function verifyConcurrentSequenceAllocation(){
  const allocatorMatch=adminSource.match(/function seoulBusinessDayKey[\s\S]*?\n}\nconst ORDER_CATALOG=/);
  assert.ok(allocatorMatch,'sequence allocator source found');
  const source=allocatorMatch[0].replace(/\nconst ORDER_CATALOG=[\s\S]*/,'');
  const documents=new Map([
    ['orders/o1',{storeId:'pangyo2-techno-valley'}],
    ['orders/o2',{storeId:'pangyo2-techno-valley'}],
    ['orders/o3',{storeId:'pangyo2-techno-valley'}]
  ]);
  let transactionQueue=Promise.resolve();
  const db={
    collection(name){return {doc(id){return {path:`${name}/${id}`}}}},
    runTransaction(work){
      const run=transactionQueue.then(async()=>{
        const writes=[];
        const transaction={
          async get(ref){const value=documents.get(ref.path);return {exists:value!==undefined,data(){return {...value}}}},
          set(ref,value,options){writes.push(()=>documents.set(ref.path,options?.merge?{...(documents.get(ref.path)||{}),...value}:{...value}))},
          update(ref,value){writes.push(()=>documents.set(ref.path,{...(documents.get(ref.path)||{}),...value}))}
        };
        await work(transaction);
        writes.forEach(write=>write());
      });
      transactionQueue=run.catch(()=>{});
      return run;
    }
  };
  const context={Intl,Date,Object,Number,String,Set,Promise,console,db,firebase:{firestore:{FieldValue:{serverTimestamp(){return 'server-time'}}}}};
  vm.createContext(context);
  vm.runInContext(source,context,{filename:'sequence-allocator.js'});
  await Promise.all([
    context.ensureOrderSequence({id:'o1',storeId:'pangyo2-techno-valley',createdAtClient:'2026-07-20T00:00:00.000Z'}),
    context.ensureOrderSequence({id:'o2',storeId:'pangyo2-techno-valley',createdAtClient:'2026-07-20T00:00:00.001Z'})
  ]);
  assert.deepStrictEqual([documents.get('orders/o1').sequence,documents.get('orders/o2').sequence],[1,2],'concurrent orders receive unique increasing sequences');
  await context.ensureOrderSequence({id:'o3',storeId:'pangyo2-techno-valley',createdAtClient:'2026-07-21T00:00:00.000Z'});
  assert.strictEqual(documents.get('orders/o3').sequence,1,'next 09:00 KST business day resets to sequence 1');
}

verifyConcurrentSequenceAllocation().then(()=>console.log('canonical order catalog, ID-based admin detail, Firestore schema, and concurrent 09:00 Asia/Seoul sequence transaction passed')).catch(error=>{console.error(error);process.exitCode=1});
