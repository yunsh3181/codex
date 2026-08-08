const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const admin=fs.readFileSync(path.resolve(__dirname,'../admin.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../admin/index.html'),'utf8');
const rules=fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8');
const tv=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv.js'),'utf8');

for(const token of ['stats-toolbar','manualCustomerCallForm','manualCustomerNumber','대면 포장 접수','주문접수','바로 조리완료','키오스크 외 대면 포장 · 뒤 4자리','키오스크 외 대면으로 접수한 포장 주문의 고객 전화번호 뒤 4자리를 입력하세요.'])assert.ok(html.includes(token),`${token} UI exists`);
const toolbar=html.match(/<section class="stats-toolbar"[\s\S]*?<\/section>/)?.[0]||'';
const rail=html.match(/<aside class="takeout-rail"[\s\S]*?<\/aside>/)?.[0]||'';
assert.ok(toolbar.includes('id="manualCustomerCallForm"'),'manual intake form is inside the top stats toolbar');
assert.ok(!rail.includes('id="manualCustomerCallForm"'),'processing rail contains cards only, not the intake form');
assert.strictEqual((html.match(/id="manualCustomerCallForm"/g)||[]).length,1,'manual intake form id is unique');
assert.strictEqual((html.match(/id="manualCustomerNumber"/g)||[]).length,1,'manual number input id is unique');
assert.ok(html.includes('type="submit" class="manual-call-primary" data-manual-status="cooking">주문접수</button>'),'order intake is the primary submit button');
assert.ok(html.includes('type="button" class="manual-call-secondary" data-manual-status="ready">바로 조리완료</button>'),'direct completion is a secondary button');
assert.ok(admin.includes("isCounterTakeout(order)?'대면 포장':'포장'"),'central rows identify in-person takeout orders');
assert.ok(admin.includes("replace(/[^0-9]/g,'').slice(0,4)"),'input blocks non-digits and limits to four');
assert.ok(admin.includes("manualCustomerCallForm?.addEventListener('submit'")&&admin.includes("createManualCustomerCall(manualCustomerNumber.value,'cooking'"),'Enter performs order intake and creates cooking');
assert.ok(admin.includes("db.runTransaction"),'registration uses a transaction');
assert.ok(admin.includes('PJAdminOperations.counterTakeoutOrderId(orderNumber,businessDay)'),'browser delegates the deterministic order id to production operations');
assert.ok(admin.includes('await createCounterTakeoutTransaction({db'),'manual creation calls the shared production transaction helper');
assert.ok(!/createManualCustomerCall[\s\S]{0,1600}db\.runTransaction/.test(admin),'browser does not duplicate the counter transaction');
const operations=fs.readFileSync(path.resolve(__dirname,'../admin-operations.js'),'utf8');
assert.ok(operations.includes("source:'admin_counter'")&&operations.includes("items:[]")&&operations.includes("totalAmount:0")&&operations.includes("methodName:'대면 결제'"),'production helper contains no fabricated menu or revenue');
assert.ok(operations.includes("status==='ready'?{completedAt:timestamp"),'direct completion records completion metadata atomically');
assert.ok(rules.includes('validAdminCounterOrderCreate()'),'rules contain a narrow administrator counter-order create policy');

const validatorSource=admin.match(/function validManualCustomerNumber[\s\S]*?\n}/)[0];
const context={String};
vm.runInNewContext(validatorSource,context);
for(const value of ['0000','3333',' 4444 '])assert.strictEqual(context.validManualCustomerNumber(value),true,`${JSON.stringify(value)} is accepted`);
for(const value of ['333','33333','33a3','12-3','한글',''])assert.strictEqual(context.validManualCustomerNumber(value),false,`${JSON.stringify(value)} is rejected`);

assert.ok(tv.includes("collection('manualCustomerCalls').onSnapshot"),'TV subscribes to manual calls');
assert.ok(tv.includes('hasInitialManualSnapshot'),'TV suppresses existing ready calls on initial snapshot');
assert.ok(tv.includes('previousAnnounceVersions'),'TV deduplicates announcements by version');
assert.ok(tv.includes('speechQueue=speechQueue.then'),'announcements are queued');
assert.ok(rules.includes('match /manualCustomerCalls/{callId}'),'manual collection has explicit rules');
assert.ok(rules.includes("matches('^[0-9]{4}$')"),'rules require exactly four digits');
assert.ok(rules.includes("request.resource.data.keys().hasOnly(['orderNumber','displayStatus','storeId','businessDay','announceVersion','createdAt','updatedAt'])"),'rules restrict public fields');
assert.ok(rules.includes('allow create: if isAdmin()')&&rules.includes('allow delete: if isAdmin()'),'writes require admin');

console.log('in-person takeout intake UI, lifecycle, isolation, TV, voice, and rules checks passed');
