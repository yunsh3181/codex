const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('admin.js'),html=read('admin/index.html'),css=read('admin.css'),rules=read('firestore.rules');

for(const id of ['takeoutProcessing','takeoutPending','orderList','seatOverviewGrid'])assert.ok(html.includes(`id="${id}"`),`${id} exists`);
assert.ok(html.indexOf('id="takeoutProcessing"')<html.indexOf('id="takeoutPending"'),'desktop source keeps processing rail before the central pending card');
assert.ok(html.includes('primary-admin-tabs')&&html.includes('secondary-admin-tabs'),'primary operations and secondary statistics remain accessible');
assert.ok(html.includes('class="stats-toolbar"'),'compact stats and manual intake share the top toolbar');
assert.ok(css.includes('grid-template-columns:minmax(500px,.95fr) minmax(470px,1.05fr)'),'wide toolbar keeps compact stats and manual intake on one row');
assert.ok(css.includes('min-height:58px')&&css.includes('height:36px'),'toolbar cards and controls use compact target heights');
assert.ok(css.includes('grid-template-columns:minmax(220px,250px) minmax(520px,1fr) minmax(400px,460px)'),'wide view has the requested three-column operations layout');
assert.ok(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'seat overview uses a three-column desktop grid');
assert.ok(css.includes('.seat-overview-card{display:flex;width:100%;min-width:0;min-height:0;aspect-ratio:1/1'),'seat cards remain square without a conflicting fixed minimum height');
assert.ok(css.includes('.seat-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr))}'),'mobile seat overview keeps a two-column grid');
assert.ok(css.includes('overflow-x:hidden'),'seat overview prevents horizontal scrolling');
assert.ok(css.includes('position:sticky;top:58px'),'operations tabs remain visible below the compact header');

const seatBlock=admin.match(/const ADMIN_SEATS=\[[\s\S]*?\n\];/)?.[0]||'';
const expected=[
 ['papa-2','파파존 2인석'],['papa-bar4','파파존 바테이블'],
 ['outdoor-1','야외존1번'],['outdoor-2','야외존2번'],['outdoor-3','야외존3번'],['outdoor-4','야외존4번'],
 ['annex-1','별관1'],['annex-2','별관2'],['annex-3','별관3'],['annex-4','별관4'],
 ['room-1','룸1'],['room-2','룸2'],['room-3','룸3']
];
assert.strictEqual((seatBlock.match(/\{id:/g)||[]).length,13,'exactly 13 real seats are configured');
expected.forEach(([id,name])=>assert.ok(seatBlock.includes(`id:'${id}',name:'${name}'`),`${id} maps to ${name}`));
for(const pair of ["empty:'빈자리'","occupied:'사용중'","held:'주문중'"])assert.ok(admin.includes(pair),`${pair} is explicit`);
assert.ok(admin.includes("status==='occupied'?`<button type=\"button\" data-action=\"clear-seat\""),'only occupied seats render a clear button');
assert.ok(admin.includes("if(!confirm('이 좌석을 빈자리로 변경할까요?'))return false"),'seat clearing asks for confirmation');
const releaseSource=admin.match(/function seatReleasePayload\(\)\{[\s\S]*?\n\}/)?.[0]||'';
const clearSource=admin.match(/async function clearSeat[\s\S]*?\n\}/)?.[0]||'';
const setStatusSource=admin.match(/async function setStatus[\s\S]*?\n\}\n\ndocument\.getElementById/)?.[0]||'';
const allowedReleaseFields=['status','orderId','orderNo','partySize','groupId','occupiedAt','heldBy','heldAt','heldUntil','cleaningAt','updatedAt'];
const releaseKeys=[...releaseSource.matchAll(/\b([A-Za-z][A-Za-z0-9]*):/g)].map(match=>match[1]);
assert.deepStrictEqual(releaseKeys,allowedReleaseFields,'shared release payload contains exactly the established automatic-release fields');
for(const forbidden of ['groupSize','groupLabel','groupTableCount','reservationName','reservationPartySize','reservationAt','reservationPhone']){
 assert.ok(!releaseSource.includes(`${forbidden}:`),`${forbidden} is not synthesized by seat release`);
}
assert.ok(clearSource.includes("db.collection('seats').doc(id).set(seatReleasePayload(),{merge:true})"),'manual clearing reuses the shared release payload');
assert.ok(setStatusSource.includes("batch.set(db.collection('seats').doc(seatId),seatReleasePayload(),{merge:true})"),'automatic dine-in release reuses the same payload');
assert.ok(!clearSource.includes("collection('orders')"),'seat clearing never changes an order');
assert.ok(rules.includes('match /seats/{seatId}')&&rules.includes('allow create: if isAdmin();'),'existing admin-only seat mutation policy remains');
assert.ok(rules.includes("keys().hasOnly(['orderNumber','displayStatus','storeId','updatedAt'])"),'TV public data remains minimal');
console.log('admin operations layout, exact seat map, status visuals, and safe seat clearing passed');
