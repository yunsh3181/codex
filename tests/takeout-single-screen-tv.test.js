const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('admin.js'),html=read('admin/index.html'),css=read('admin.css');
const rules=read('firestore.rules'),tvHTML=read('waiting-tv/index.html'),tvJS=read('waiting-tv/waiting-tv.js');

assert.ok(html.includes('id="takeoutPending"'),'the compatibility hook is present');
assert.ok(!html.includes('id="takeoutProcessing"'),'the duplicate processing rail is removed');
assert.ok(html.includes('id="takeoutPending" hidden'),'the retired central pending card remains only as a compatibility hook');
assert.ok(admin.includes("if(takeoutPending)takeoutPending.innerHTML=''"),'the central area never duplicates a pending takeout card');
assert.ok(admin.includes('function centralOrderRow(order)'),'all takeout statuses remain in the central order list');
assert.ok(!html.includes('id="takeoutCooking"')&&!html.includes('id="takeoutReady"'),'processing cards are not split by status');
for(const transition of [
 ["data-status=\"cooking\">결제대기 · 주문 접수"],
 ["label:'조리완료',status:'ready'"],
 ["label:'픽업완료',status:'completed'"]
])assert.ok(admin.includes(transition),`${transition} transition is configured`);
assert.ok(admin.includes('transaction.delete(displayRef)'),'pickup removes only the public display document');
assert.ok(!admin.includes("delete(db.collection('orders')"),'pickup never deletes the source order');
assert.ok(!admin.includes("(status==='ready'&&committedOrder.orderType==='takeout')||"),'takeout completion does not automatically invoke administrator TTS');

assert.ok(tvHTML.includes('id="cookingOrders"')&&tvHTML.includes('id="readyOrders"'),'TV has cooking and ready sections');
assert.ok(tvJS.includes("collection('publicOrderDisplays').onSnapshot"),'TV subscribes to public data in real time');
const tvCSS=read('waiting-tv/waiting-tv.css');
assert.match(tvCSS,/\.number-grid\{[^}]*display:flex;[^}]*flex-direction:column/,'TV order lists stack in one column');
assert.match(tvCSS,/\.order-number\{display:flex;width:100%/,'each TV order number occupies its own row');
assert.ok(tvCSS.includes('overflow-x:hidden')&&tvCSS.includes('overflow-y:auto'),'long TV order lists scroll vertically without horizontal overflow');
for(const forbidden of ['phone','menu','amount','payment','seat'])assert.ok(!tvJS.toLowerCase().includes(forbidden),`TV data code excludes ${forbidden}`);
assert.ok(rules.includes('match /publicOrderDisplays/{orderId}'),'public display collection has explicit rules');
assert.ok(rules.includes("keys().hasOnly(['orderNumber','customerIdentityType','customerDisplayName','language','displayStatus','storeId','businessDay','preparationMinutes','preparationStartedAt','readyDueAt','autoReadyEnabled','updatedAt'])"),'public writes allow only display-safe identity and countdown fields');
assert.ok(rules.includes('match /orders/{orderId}')&&rules.includes('allow read, delete: if isAdmin();')&&rules.includes('allow update: if isAdmin()'),'orders remain admin-readable only');
const orderRule=rules.match(/match \/orders\/\{orderId\} \{[\s\S]*?\n    \}/)?.[0]||'';
assert.ok(orderRule&&!orderRule.includes('allow read: if true'),'orders are never public');
console.log('takeout single-screen workflow, TV display, and public-data security checks passed');
