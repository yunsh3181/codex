const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const admin=read('admin.js'),html=read('admin/index.html'),css=read('admin.css'),rules=read('firestore.rules');

for(const id of ['takeoutPending','orderList','seatOverviewGrid'])assert.ok(html.includes(`id="${id}"`),`${id} exists`);
assert.ok(!html.includes('id="takeoutProcessing"'),'duplicate processing rail is removed');
assert.ok(html.includes('primary-admin-tabs')&&html.includes('secondary-admin-tabs'),'primary operations and secondary statistics remain accessible');
assert.ok(html.includes('class="stats-toolbar"'),'compact stats and manual intake share the top toolbar');
assert.ok(css.includes('grid-template-columns:minmax(500px,.95fr) minmax(470px,1.05fr)'),'wide toolbar keeps compact stats and manual intake on one row');
assert.ok(css.includes('min-height:58px')&&css.includes('height:36px'),'toolbar cards and controls use compact target heights');
assert.ok(css.includes('grid-template-columns:minmax(0,1fr) minmax(300px,19%)'),'wide view expands the order list while preserving the seat panel');
assert.ok(css.includes('.seat-overview{grid-area:seats;min-width:300px}'),'seat panel remains wide enough for readable Korean names');
assert.ok(css.includes('.seat-overview{max-height:none;overflow:visible}'),'seat panel displays every row without vertical scrolling');
assert.ok(css.includes('grid-template-columns:repeat(3,minmax(0,1fr))')&&css.includes('grid-auto-flow:row'),'seat overview uses a fluid three-column grid');
assert.ok(css.includes('grid-template-rows:repeat(6,minmax(0,auto))'),'seat overview reserves the official six-row layout');
assert.ok(css.includes('.seat-overview-card{display:flex;grid-column:auto;width:auto;height:auto;aspect-ratio:1/1;min-width:0;min-height:0;box-sizing:border-box'),'all seat cards derive their width from the fluid grid cell while preserving a square aspect ratio');
assert.ok(css.includes('.seat-overview-card{display:flex;grid-column:auto'),'empty seat status never inherits the generic full-row empty-state placement');
assert.ok(!css.includes('.seat-overview-card{display:flex;min-width:0;height:88px'),'seat cards no longer use the fixed 88px height');
assert.ok(css.includes('word-break:keep-all')&&css.includes('-webkit-line-clamp:2'),'long Korean seat names remain readable on at most two lines');
assert.ok(css.includes('min-height:24px')&&css.includes('overflow-wrap:normal'),'dashboard seat names reserve two readable lines without per-character Korean wrapping');
assert.ok(css.includes('.admin-seat-actions{display:flex;width:100%;min-width:0;align-items:center;justify-content:center;gap:1px;margin-top:auto}'),'shared seat actions stay on the card bottom row with the compact gap');
assert.ok(css.includes('min-height:16px')&&css.includes('padding:1px 2px')&&css.includes('font-size:8px')&&css.includes('line-height:1'),'shared seat actions retain the minimum readable compact geometry');
assert.ok(css.includes('@media(max-width:1300px)')&&css.includes('.seat-overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}'),'1300px breakpoint preserves three columns');
assert.ok(css.includes('@media(max-width:768px)'),'narrow layout rules remain scoped');
assert.ok(!css.includes('grid-template-columns:repeat(2,70px)'),'seat overview never falls back to a two-column fixed list');
assert.ok(!css.includes('repeat(3,50px)')&&!css.includes('repeat(2,50px)'),'no obsolete 50px seat grid rules remain');
assert.ok(css.includes('.seat-overview-card:is(button):active{transform:none'),'seat activation never scales or moves the card');
assert.ok(css.includes('.seat-overview-card:is(button):focus-visible'),'interactive seat cards retain a visible keyboard focus indicator');
assert.ok(css.includes('position:sticky;top:58px'),'operations tabs remain visible below the compact header');

const seatBlock=admin.match(/const ADMIN_SEATS=\[[\s\S]*?\n\];/)?.[0]||'';
const expected=[
 ['papa-2','커플석','papa',1,1],['papa-bar4','바테이블','papa',1,2],
 ['outdoor-1','야외석1','outdoor',2,1],['outdoor-2','야외석2','outdoor',2,2],['outdoor-3','야외석3','outdoor',2,3],['outdoor-4','야외석4','outdoor',3,1],
 ['annex-1','별관1','annex',4,1],['annex-2','별관2','annex',4,2],['annex-3','별관3','annex',4,3],['annex-4','별관4','annex',5,1],
 ['room-1','룸1','room',6,1],['room-2','룸2','room',6,2],['room-3','룸3','room',6,3]
];
assert.strictEqual((seatBlock.match(/\{id:/g)||[]).length,13,'exactly 13 real seats are configured');
assert.strictEqual(new Set(expected.map(([id])=>id)).size,13,'real seat IDs are unique');
assert.strictEqual(new Set(expected.map(([,name])=>name)).size,13,'admin seat display names are unique');
assert.strictEqual(Math.max(...expected.map(([, , ,row])=>row)),6,'the explicit desktop layout spans six rows');
expected.forEach(([id,name,zone,row,column])=>assert.ok(seatBlock.includes(`id:'${id}',name:'${name}',zone:'${zone}',row:${row},column:${column}`),`${id} maps to ${name} at row ${row}, column ${column}`));
const occupiedCells=new Set(expected.map(([, , ,row,column])=>`${row}:${column}`));
assert.deepStrictEqual(['1:3','3:2','3:3','5:2','5:3'].filter(cell=>!occupiedCells.has(cell)),['1:3','3:2','3:3','5:2','5:3'],'the five requested grid cells remain empty without placeholders');
for(const [zone,colors] of Object.entries({papa:['#eef6ff','#3b82f6','#1d4f91'],outdoor:['#edf9f0','#3b9b5f','#176b35'],annex:['#fff1f1','#dc4c52','#9f2028'],room:['#fff6e8','#ee9b2e','#9a5700']})){
 assert.ok(css.includes(`.seat-overview-card.seat-zone-${zone}{background:${colors[0]};border-color:${colors[1]};color:${colors[2]}}`),`${zone} retains its zone palette`);
}
assert.ok(css.includes('.seat-overview-card.empty,.seat-overview-card.held{background:#fff;border-color:#d1d5db;color:#1f2937}'),'unused dashboard seats override zone colors with the white neutral palette');
assert.ok(css.includes('.seat-overview-card.occupied{background:#fff1f1;border-color:#ef4444;color:#7f1d1d}'),'occupied dashboard seats override zone colors with the red tint');
assert.ok(css.includes('.seat-overview-card.reserved{background:#f3e8ff;border-color:#8b5cf6;color:#581c87}'),'reserved dashboard seats reuse the manager reservation palette');
assert.ok(css.includes('.seat-overview-card.unknown{background:#f1f5f9;border-color:#64748b;color:#334155}'),'unknown dashboard seats use the safe fallback palette');
assert.ok(css.includes('.seat-overview-card.occupied:is(button):hover{background:#fff1f1;border-color:#dc2626}'),'occupied hover preserves its red tint');
assert.ok(admin.includes('class="seat-overview-card seat-zone-${seat.zone} ${status}"'),'zone and state classes are independently rendered');
assert.ok(admin.includes('style="grid-row-start:${seat.row};grid-column-start:${seat.column}"'),'real seat cards receive explicit grid positions');
assert.ok(css.indexOf('.seat-overview-card.empty,.seat-overview-card.held{')>css.indexOf('.seat-overview-card.seat-zone-room{'),'state colors override every zone palette');
assert.ok(admin.includes('normalizeAdminSeatStatus,getAdminSeatActions,transitionAdminSeatState'),'dashboard imports all shared seat policy functions');
assert.ok(admin.includes('function normalizedSeatStatus(status){return normalizeAdminSeatStatus(status)}'),'dashboard delegates normalization to the shared policy');
assert.ok(admin.includes('const pending=statusUpdateLocks.has(`seat:${seat.id}`),actions=getAdminSeatActions(status)'),'dashboard obtains its complete action list from shared metadata');
assert.ok(admin.includes("status==='held'&&data.orderId"),'held exposes only the existing linked-order detail path');
assert.ok(admin.includes("actions.length?`<div class=\"admin-seat-actions\""),'empty, occupied, and reserved actions share the common wrapper');
assert.ok(admin.includes('await transitionAdminSeatState({db,seatId:id,expectedStatus:expected,targetStatus:target'),'dashboard mutations use the production transaction helper');
assert.ok(admin.includes('data-action="clear-seat" data-seat-id="${esc(seatId)}"'),'seat clearing remains available from the linked order detail');
assert.ok(admin.includes("const content=`<strong>${esc(seat.name)}</strong>"),'the card contains only seat name, status, and optional order number');
assert.ok(admin.includes("if(!['occupied','reserved'].includes(expected))return false"),'held and unknown cannot use the linked-detail clear path');
assert.ok(admin.includes('!confirm(metadata.confirmation)'),'confirmation copy comes from shared action metadata');
assert.ok(admin.includes('pendingAdminSeatTargets.set(id,target);renderSeatOverview()'),'dashboard locks all card actions until the target snapshot arrives');
assert.ok(admin.includes('pendingAdminSeatTargets.delete(id);statusUpdateLocks.delete(lockId);renderSeatOverview()'),'failed transactions restore the latest snapshot state without optimistic mutation');
assert.ok(admin.includes("event.target.closest('button[data-action]')"),'native button click and Enter/Space activation reuse the delegated clear-seat action');
const releaseSource=admin.match(/function seatReleasePayload\(\)\{[\s\S]*?\n\}/)?.[0]||'';
const clearSource=admin.match(/async function clearSeat[\s\S]*?\n\}/)?.[0]||'';
const setStatusSource=admin.match(/async function setStatus[\s\S]*?\n\}\n\ndocument\.getElementById/)?.[0]||'';
const allowedReleaseFields=['status','orderId','orderNo','partySize','groupId','occupiedAt','heldBy','heldAt','heldUntil','cleaningAt','updatedAt'];
const releaseKeys=[...releaseSource.matchAll(/\b([A-Za-z][A-Za-z0-9]*):/g)].map(match=>match[1]);
assert.deepStrictEqual(releaseKeys,allowedReleaseFields,'shared release payload contains exactly the established automatic-release fields');
for(const forbidden of ['groupSize','groupLabel','groupTableCount','reservationName','reservationPartySize','reservationAt','reservationPhone']){
 assert.ok(!releaseSource.includes(`${forbidden}:`),`${forbidden} is not synthesized by seat release`);
}
assert.ok(clearSource.includes("return transitionOverviewSeat(id,expected,'empty',button)"),'manual clearing delegates to the shared transition path');
assert.ok(setStatusSource.includes('transaction.set(ref,seatReleasePayload(),{merge:true})'),'automatic dine-in release reuses the same payload');
assert.ok(!clearSource.includes("collection('orders')"),'seat clearing never changes an order');
assert.ok(rules.includes('match /seats/{seatId}')&&rules.includes('allow create: if isAdmin();'),'existing admin-only seat mutation policy remains');
assert.ok(rules.includes("keys().hasOnly(['orderNumber','displayStatus','storeId','businessDay','updatedAt'])"),'TV public data remains minimal');
console.log('admin operations layout, exact seat map, status visuals, and safe seat clearing passed');
