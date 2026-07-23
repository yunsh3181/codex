const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('admin.js'),html=read('admin/index.html'),css=read('admin.css');
const rules=read('firestore.rules'),tvHTML=read('waiting-tv/index.html'),tvJS=read('waiting-tv/waiting-tv.js');

for(const id of ['takeoutPending','takeoutProcessing'])assert.ok(html.includes(`id="${id}"`),`${id} is present`);
assert.ok(admin.includes('takeoutPendingCard(pendingTakeout[0])'),'only the oldest pending takeout is the large priority card');
assert.ok(admin.includes("['accepted','paid','cooking','ready'].includes(order.status)"),'all active takeout statuses share one processing area');
assert.ok(css.includes('.takeout-processing{display:grid;grid-template-columns:1fr'),'processing cards use one-column left rail');
assert.ok(!html.includes('id="takeoutCooking"')&&!html.includes('id="takeoutReady"'),'processing cards are not split by status');
for(const transition of [
 ["data-status=\"cooking\">주문접수"],
 ["label:'조리완료',status:'ready'"],
 ["label:'픽업완료',status:'completed'"]
])assert.ok(admin.includes(transition),`${transition} transition is configured`);
assert.ok(admin.includes("batch.delete(displayRef)"),'pickup removes only the public display document');
assert.ok(!admin.includes("delete(db.collection('orders')"),'pickup never deletes the source order');
assert.ok(admin.includes("status==='ready'&&order.orderType==='takeout'"),'customer call occurs when manufacturing is ready');

assert.ok(tvHTML.includes('id="cookingOrders"')&&tvHTML.includes('id="readyOrders"'),'TV has cooking and ready sections');
assert.ok(tvJS.includes("collection('publicOrderDisplays').onSnapshot"),'TV subscribes to public data in real time');
for(const forbidden of ['phone','menu','amount','payment','seat'])assert.ok(!tvJS.toLowerCase().includes(forbidden),`TV data code excludes ${forbidden}`);
assert.ok(rules.includes('match /publicOrderDisplays/{orderId}'),'public display collection has explicit rules');
assert.ok(rules.includes("keys().hasOnly(['orderNumber','displayStatus','storeId','updatedAt'])"),'public writes allow only display-safe fields');
assert.ok(rules.includes('match /orders/{orderId}')&&rules.includes('allow read, update, delete: if isAdmin();'),'orders remain admin-readable only');
const orderRule=rules.match(/match \/orders\/\{orderId\} \{[\s\S]*?\n    \}/)?.[0]||'';
assert.ok(orderRule&&!orderRule.includes('allow read: if true'),'orders are never public');
console.log('takeout single-screen workflow, TV display, and public-data security checks passed');
