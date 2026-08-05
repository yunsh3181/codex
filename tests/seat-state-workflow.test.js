const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const kiosk=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const seats=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const seatCss=fs.readFileSync(path.join(root,'seats.css'),'utf8');
const adminCss=fs.readFileSync(path.join(root,'admin.css'),'utf8');
const ko=fs.readFileSync(path.join(root,'i18n/ko.js'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');

assert.ok(kiosk.includes('const SEAT_IDLE_MS=30000'),'seat inactivity timeout is exactly 30 seconds');
assert.ok(kiosk.includes("transaction.set(ref,{status:'held'"),'seat selection writes the ordering state transactionally');
assert.ok(kiosk.includes("saved.heldBy!==seatClientId")||kiosk.includes("saved.heldBy!==seatClientId"),'another kiosk cannot claim an active seat');
assert.ok(kiosk.includes("throw new Error('SEAT_UNAVAILABLE')"),'duplicate seat claims are rejected');
assert.ok(kiosk.includes('seatIdleTimer=setTimeout(expireOrderIdle,SEAT_IDLE_MS)'),'central idle timeout uses the canonical 30-second value');
assert.ok(kiosk.includes("reset('idle',{skipRelease:true});render()"),'idle timeout releases seats, clears state, and returns to promotions');
for(const eventName of ['pointerdown','touchstart','keydown','wheel','click','input'])assert.ok(kiosk.includes(`'${eventName}'`),`${eventName} resets the inactivity timer`);
assert.ok(!kiosk.includes("'wheel','scroll','click'"),'programmatic scroll cannot extend the inactivity timer');
assert.ok(kiosk.includes("window.addEventListener('pagehide'"),'page close releases an unpaid seat');
assert.ok(kiosk.includes("window.addEventListener('beforeunload'"),'browser unload attempts seat release');
assert.ok(kiosk.includes("status:'held',heldBy:null,heldUntil:null,partySize"),'payment keeps dine-in seats in ordering state');
assert.ok(!kiosk.includes("status:'occupied',\n    partySize:state.partySize"),'payment no longer marks a seat in use');

assert.strictEqual([...seats.matchAll(/const statusNames=\{([^}]+)\}/g)].length,1,'seat manager has one canonical status map');
for(const label of ['빈자리','주문중','사용중'])assert.ok(seats.includes(label),`seat manager displays ${label}`);
assert.ok(seats.includes("function normalizedSeatStatus(status){return status==null||status==='empty'?'empty':['held','occupied','reserved'].includes(status)?status:'unknown'}"),'missing and unknown statuses use distinct safe fallbacks');
for(const [zone,background,border,color] of [['papa','#eef6ff','#3b82f6','#1d4f91'],['outdoor','#edf9f0','#3b9b5f','#176b35'],['annex','#fff1f1','#dc4c52','#9f2028'],['room','#fff6e8','#ee9b2e','#9a5700']])assert.ok(seatCss.includes(`.seat-zone-${zone} .simple-seat{background:${background};border-color:${border};color:${color}}`),`${zone} keeps its zone palette`);
assert.ok(seatCss.includes('.simple-seat.held em i{background:#d97706}'),'ordering seats use an orange status dot');
assert.ok(seatCss.includes('.simple-seat.occupied em i{background:#c62828}'),'in-use seats use a red status dot');
assert.ok(seatCss.includes('.simple-seat.empty,.simple-seat.held{background:#fff;border-color:#d1d5db;color:#1f2937}'),'unused seat manager cards override zone colors with the white neutral palette');
assert.ok(seatCss.includes('.simple-seat.occupied{background:#fff1f1;border-color:#ef4444;color:#7f1d1d}'),'occupied seat manager cards override zone colors with the red tint');
for(const icon of ['🟢','🟡','🔴'])assert.ok(seats.includes(icon),`${icon} is shown in the seat manager`);
assert.ok(seatCss.includes('transition:background-color 180ms ease'),'seat cards use a restrained 180ms transition');
assert.ok(kiosk.includes("const SEAT_STATUS_ICONS={available:'🟢',selected:'🟡',ordering:'🟡',occupied:'🔴',reserved:'🟣'}"),'kiosk uses the reservation-aware status icons');
assert.ok(kiosk.includes('.tableCard.available,.tableCard:not(.selected):not(.occupiedCard){background:#E8F7EC'),'kiosk available cards use the unified green');
assert.ok(kiosk.includes('.tableCard.ordering,.tableCard.selected{background:#FFF4D6'),'kiosk ordering cards use the unified yellow');
assert.ok(kiosk.includes('.tableCard.occupiedCard.occupied{background:#FDE7E7'),'kiosk occupied cards use the unified red');
for(const label of ["available:'사용가능'","selected:'주문중'","occupied:'사용중'"])assert.ok(ko.includes(label),`Korean kiosk label ${label} uses the three-state wording`);

assert.ok(admin.includes('data-status="accepted">결제대기 · 주문 접수</button>'),'pending takeout and dine-in orders share the emphasized accept action');
assert.ok(admin.includes('data-status="completed">조리완료</button>'),'accepted takeout and dine-in orders share the cooking-complete action');
assert.ok(admin.includes("status:'occupied',heldBy:null,heldUntil:null"),'first dine-in click marks seats in use');
assert.ok(admin.includes("status:'empty'"),'second dine-in click releases seats');
assert.ok(admin.includes('await db.runTransaction(async transaction=>'),'order status and seat changes share one transaction');
assert.ok(admin.includes('transaction.update(orderRef'),'workflow changes commit atomically');
for(const [visual,background,color] of [['seat-available','#E8F7EC','#1F7A3A'],['seat-ordering','#FFF4D6','#C77B00'],['seat-occupied','#FDE7E7','#C62828']])assert.ok(adminCss.includes(`.status-badge.${visual}{background:${background};color:${color}}`),`${visual} admin badge uses the unified palette`);
assert.ok(admin.includes("takeout?'ready':'occupied-action'"),'dine-in completion action remains visually red while the seat is in use');
assert.ok(adminCss.includes('.actions .ready{background:#E8F7EC;color:#1F7A3A}'),'takeout completion action is green');

assert.ok(rules.includes("request.resource.data.status == 'held'"),'rules allow a constrained kiosk seat claim');
assert.ok(rules.includes("existsAfter(/databases/$(database)/documents/orders/$(request.resource.data.orderId))"),'paid seat linkage requires the new order in the same transaction');
assert.ok(!rules.match(/match \/orders\/{orderId}[\s\S]*?discountBreakdown/),'order payload schema remains unchanged');

console.log('seat claim, idle release, three-state display, and admin dine-in/takeout lifecycle checks passed');
