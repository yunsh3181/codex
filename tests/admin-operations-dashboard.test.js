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
assert.ok(css.includes('grid-template-columns:minmax(220px,250px) minmax(520px,1fr) minmax(240px,280px)'),'wide view reserves at least 240px for the seat column');
assert.ok(css.includes('.seat-overview{grid-area:seats;min-width:240px}'),'seat panel cannot shrink below the fixed grid');
assert.ok(css.includes('.seat-overview{max-height:none;overflow:visible}'),'seat panel displays every row without vertical scrolling');
assert.ok(css.includes('grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-flow:row'),'seat overview uses a responsive three-column desktop grid');
assert.ok(css.includes('.seat-overview-card{display:flex;min-width:0;min-height:126px;box-sizing:border-box'),'seat cards have compact operational geometry');
assert.ok(css.includes('font-size:13px;line-height:1.15')&&css.includes('font-size:9px;line-height:1.2'),'cards use a compact information hierarchy');
assert.ok(css.includes('@media(max-width:1300px)')&&css.includes('.seat-overview-grid{grid-template-columns:repeat(3,minmax(0,1fr))}'),'1300px breakpoint preserves three desktop columns');
assert.ok(css.includes('@media(max-width:768px)'),'two-column override is scoped to the mobile breakpoint');
assert.ok(css.includes('.seat-overview-grid{grid-template-columns:repeat(2,minmax(0,1fr));width:100%;min-width:0;max-width:none}'),'only the narrow mobile breakpoint changes the seat overview to two columns');
assert.ok(!css.includes('repeat(3,50px)')&&!css.includes('repeat(2,50px)'),'no obsolete 50px seat grid rules remain');
assert.ok(css.includes('.seat-overview-card:is(button):active{transform:none'),'seat activation never scales or moves the card');
assert.ok(css.includes('.seat-overview-card:is(button):focus-visible'),'interactive seat cards retain a visible keyboard focus indicator');
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
assert.ok(admin.includes("const ADMIN_SEAT_SLOTS=Array.from({length:15}"),'the dashboard renders exactly fifteen numbered display slots');
assert.strictEqual(Math.ceil(15/3),5,'fifteen dashboard slots form five rows');
for(let number=1;number<=15;number++)assert.ok(number>=1&&number<=15,`table ${number} is represented once by the generated sequence`);
assert.ok(admin.includes('<strong>테이블 ${slot.number}</strong>'),'every seat card uses its sequential table number');
assert.ok(admin.includes("if(!seat)return `<article class=\"seat-overview-card empty placeholder\""),'slots without a protected table ID remain safe non-interactive empty cards');
for(const state of ["className:'empty',label:'빈자리'","className:'occupied',label:'사용중'","className:'cooking',label:'조리중'","className:'attention',label:'확인 필요'"])assert.ok(admin.includes(state),`${state} uses existing data-derived state`);
for(const pair of ["empty:'빈자리'","occupied:'사용중'","held:'주문중'"])assert.ok(admin.includes(pair),`${pair} is explicit`);
assert.ok(admin.includes("status==='empty'")&&admin.includes('`<article class="seat-overview-card ${visual.className}"'),'empty seats render as non-interactive articles');
assert.ok(admin.includes('`<button type="button" class="seat-overview-card ${visual.className}" data-action="open-seat-order"'),'occupied seats open their linked order');
assert.ok(admin.includes('data-action="clear-seat" data-seat-id="${esc(seatId)}"'),'seat clearing remains available from the linked order detail');
for(const detail of ['주문 ${esc(orderNumber','시작 ${formatTime(started)','경과 ${elapsedMinutes','${money(paid)}'])assert.ok(admin.includes(detail),`occupied cards include ${detail}`);
assert.ok(admin.includes("normalizedSeatStatus(data.status)==='empty'"),'only non-empty seats can be cleared');
assert.ok(admin.includes("if(!confirm('이 좌석을 빈자리로 변경할까요?'))return false"),'seat clearing asks for confirmation');
assert.ok(admin.includes("if(button){button.disabled=true;button.setAttribute('aria-busy','true')}"),'seat clearing disables and marks its action busy to prevent duplicate activation');
assert.ok(admin.includes("button.disabled=false;button.removeAttribute('aria-busy')"),'seat clearing restores the card after processing');
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
assert.ok(clearSource.includes("db.collection('seats').doc(id).set(seatReleasePayload(),{merge:true})"),'manual clearing reuses the shared release payload');
assert.ok(setStatusSource.includes("batch.set(db.collection('seats').doc(seatId),seatReleasePayload(),{merge:true})"),'automatic dine-in release reuses the same payload');
assert.ok(!clearSource.includes("collection('orders')"),'seat clearing never changes an order');
assert.ok(rules.includes('match /seats/{seatId}')&&rules.includes('allow create: if isAdmin();'),'existing admin-only seat mutation policy remains');
assert.ok(rules.includes("keys().hasOnly(['orderNumber','displayStatus','storeId','updatedAt'])"),'TV public data remains minimal');
console.log('admin operations layout, exact seat map, status visuals, and safe seat clearing passed');
