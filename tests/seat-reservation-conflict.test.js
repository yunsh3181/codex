const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const kiosk=fs.readFileSync(path.join(root,'index.html'),'utf8');
const manager=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');

test('reserved is a first-class manager state with conditional transactions',()=>{
 assert.match(manager,/statusNames=\{[^}]*reserved:'예약'/);
 assert.match(manager,/transitionReservation\(id,'empty','reserved'\)/);
 assert.match(manager,/transitionReservation\(id,'reserved','empty'\)/);
 assert.match(manager,/db\.runTransaction/);
 assert.match(manager,/normalizedSeatStatus\(saved\.status\)!==from/);
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
 const conflict=kiosk.indexOf("snapshot.data().status==='reserved'");
 const orderWrite=kiosk.indexOf('transaction.set(orderRef,payload)');
 assert.ok(conflict>0&&conflict<orderWrite);
 assert.match(kiosk,/error\.code='SEAT_RESERVED'/);
 assert.match(kiosk,/showSeatReservationConflict\(\);return/);
 assert.match(rules,/request\.resource\.data\.status == 'held'[\s\S]*resource\.data\.status == 'empty'/);
});

test('takeout orders keep the seat check empty and preserve the payload schema',()=>{
 assert.match(kiosk,/state\.orderType==='dinein'\?state\.selectedTables\.map/);
 assert.match(kiosk,/seat:state\.orderType==='dinein'\?/);
 assert.doesNotMatch(rules,/reservedAt[\s\S]*match \/orders/);
});
