const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const kiosk=fs.readFileSync(path.join(root,'index.html'),'utf8');
const manager=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
const seatTransaction=fs.readFileSync(path.join(root,'kiosk-seat-transaction.js'),'utf8');

test('reserved is a first-class manager state through the shared transaction policy',()=>{
 assert.match(manager,/ADMIN_SEAT_STATUSES,normalizeAdminSeatStatus,getAdminSeatActions,transitionAdminSeatState/);
 assert.match(manager,/runSeatAction\(id,expected,target\)/);
 assert.match(manager,/await transitionAdminSeatState/);
 assert.match(manager,/pendingSeatTargets\.set\(id,target\)/);
 assert.match(manager,/targetStatus==='empty'\|\|bottleActionAllowed\(id\)/);
 assert.doesNotMatch(manager,/transitionReservation|current==='held'/);
});

test('order dashboard preserves realtime reserved snapshots without corrective writes',()=>{
 const dashboard=fs.readFileSync(path.join(root,'admin.js'),'utf8');
 const dashboardCss=fs.readFileSync(path.join(root,'admin.css'),'utf8');
 assert.match(dashboard,/function normalizedSeatStatus\(status\)\{return normalizeAdminSeatStatus\(status\)\}/);
 assert.match(dashboard,/ADMIN_SEAT_STATUSES/);
 assert.match(dashboardCss,/\.seat-overview-card\.reserved\{background:#f3e8ff;border-color:#8b5cf6;color:#581c87\}/);
 assert.match(dashboard,/unsubscribeSeats=db\.collection\('seats'\)\.onSnapshot\(snapshot=>\{/);
 const listener=dashboard.match(/unsubscribeSeats=db\.collection\('seats'\)\.onSnapshot\(snapshot=>\{[\s\S]*?\n \},error=>\{/)?.[0]||'';
 assert.doesNotMatch(listener,/\.set\(|\.update\(|runTransaction/);
 assert.match(dashboard,/actions=getAdminSeatActions\(status\)/);
});

test('reserved customer seats are visible and cannot be selected',()=>{
 assert.match(kiosk,/doc\?\.status==='reserved'\|\|doc\?\.status==='occupied'/);
 assert.match(kiosk,/seatStatus:d\.status==='reserved'\?'reserved'/);
 assert.match(kiosk,/aria-disabled','true'/);
 assert.match(kiosk,/ui\.seatReservation\.disabled/);
 assert.match(kiosk,/reserved:'🟣'/);
});

test('live reservation conflicts are guarded and reset through the home workflow once',()=>{
 assert.match(kiosk,/if\(seatReservationConflictActive\|\|state\.firebaseOrderId\)return/);
 assert.match(kiosk,/selectedTables\.some\(id=>mobileSeatDocs\[id\]\?\.status==='reserved'\)/);
 assert.match(kiosk,/ui\.seatReservation\.conflict/);
 assert.match(kiosk,/function confirmSeatReservationConflict\(\)\{reset\(\)/);
});

test('final order transaction rejects reservations before order write',()=>{
 const conflict=seatTransaction.indexOf("snapshot.data().status==='reserved'");
 const orderWrite=seatTransaction.indexOf('transaction.set(orderRef,committedPayload)');
 assert.ok(conflict>0&&conflict<orderWrite);
 assert.match(seatTransaction,/error\.code='SEAT_RESERVED'/);
 assert.match(kiosk,/showSeatReservationConflict\(\);return/);
 assert.match(rules,/request\.resource\.data\.status == 'held'[\s\S]*resource\.data\.status == 'empty'/);
});

test('takeout orders keep the seat check empty and preserve the payload schema',()=>{
 assert.match(kiosk,/state\.orderType==='dinein'[\s\S]*?PJ_KIOSK_SEAT_TRANSACTION\.commitSeatOrder/);
 assert.match(kiosk,/seat:state\.orderType==='dinein'\?/);
 assert.doesNotMatch(rules,/reservedAt[\s\S]*match \/orders/);
});
