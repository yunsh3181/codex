const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const admin=fs.readFileSync(path.resolve(__dirname,'../admin.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../admin/index.html'),'utf8');
const rules=fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8');
const tv=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv.js'),'utf8');

for(const token of ['manualCustomerCallForm','manualCustomerNumber','대면 포장 수동접수','주문접수','바로 조리완료','키오스크 외 대면으로 접수한 포장 주문의 고객 전화번호 뒤 4자리를 입력하세요.'])assert.ok(html.includes(token),`${token} UI exists`);
assert.ok(html.includes('type="submit" class="manual-call-primary" data-manual-status="cooking">주문접수</button>'),'order intake is the primary submit button');
assert.ok(html.includes('type="button" class="manual-call-secondary" data-manual-status="ready">바로 조리완료</button>'),'direct completion is a secondary button');
assert.ok(admin.includes('<span class="manual-badge">대면접수</span>')&&admin.includes('<strong>대면 포장</strong>'),'cards identify in-person takeout intake');
assert.ok(admin.includes("replace(/[^0-9]/g,'').slice(0,4)"),'input blocks non-digits and limits to four');
assert.ok(admin.includes("manualCustomerCallForm?.addEventListener('submit'")&&admin.includes("createManualCustomerCall(manualCustomerNumber.value,'cooking'"),'Enter performs order intake and creates cooking');
assert.ok(admin.includes("db.runTransaction"),'registration uses a transaction');
assert.ok(admin.includes("`${MANUAL_CALL_STORE_ID}_${orderNumber}`"),'store and number form the deterministic document id');
assert.ok(admin.includes("db.collection('manualCustomerCalls')"),'admin uses the isolated manual collection');
assert.ok(admin.includes("displayStatus:status")&&admin.includes("status==='ready'?1:0"),'order intake creates cooking while direct completion creates ready');
assert.ok(admin.includes("ref.update({displayStatus:'ready',announceVersion:1"),'cooking advances to ready');
assert.ok(admin.includes("if(status==='picked-up')await ref.delete()"),'pickup completion deletes the display document');
assert.ok(!/createManualCustomerCall[\s\S]{0,2000}collection\('orders'\)/.test(admin),'manual creation does not access orders');
assert.ok(!/createManualCustomerCall[\s\S]{0,2000}publicOrderDisplays/.test(admin),'manual creation does not access publicOrderDisplays');
assert.ok(admin.includes('Counter/in-person takeout intake only')&&admin.includes('Menu, payment, and sales records'),'code documents the non-kiosk display-only purpose');

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
assert.ok(rules.includes("request.resource.data.keys().hasOnly(['orderNumber','displayStatus','storeId','announceVersion','createdAt','updatedAt'])"),'rules restrict public fields');
assert.ok(rules.includes('allow create: if isAdmin()')&&rules.includes('allow delete: if isAdmin()'),'writes require admin');

console.log('in-person takeout intake UI, lifecycle, isolation, TV, voice, and rules checks passed');
