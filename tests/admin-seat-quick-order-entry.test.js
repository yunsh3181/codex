const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const seats=fs.readFileSync(path.join(root,'seats.js'),'utf8');

test('seat manager passes an encoded seatId without creating or writing an order',()=>{
 assert.match(seats,/location\.assign\(`\.\.\/admin\/\?seatId=\$\{encodeURIComponent\(id\)\}`\)/);
 const entry=seats.slice(seats.indexOf('function openOccupiedSeatOrder'),seats.indexOf('async function clearOccupiedSeat'));
 assert.doesNotMatch(entry,/collection\(|\.set\(|\.add\(|create/i);
});

test('admin deep link waits for authentication and initial orders, validates the seat, and opens once',()=>{
 const entry=admin.slice(admin.indexOf('function openRequestedSeatOrder'),admin.indexOf('function stopRealtimeSubscriptions'));
 assert.match(entry,/requestedSeatEntryHandled\|\|!adminAuthenticated\|\|!initialOrdersLoaded/);
 assert.match(entry,/ADMIN_SEATS\.some\(seat=>seat\.id===seatId\)/);
 assert.match(entry,/requestedSeatEntryHandled=true/);
 assert.match(entry,/return openSeatOrderDetail\(seatId\)/);
 assert.ok(admin.indexOf('initialOrdersLoaded=true')<admin.indexOf('openRequestedSeatOrder();'));
 assert.ok(admin.indexOf('adminAuthenticated=true')<admin.indexOf('startRealtimeSubscriptions();'));
});

test('missing or invalid seatId keeps the normal admin screen and performs no writes',()=>{
 assert.match(admin,/if\(!seatId\|\|!ADMIN_SEATS\.some\(seat=>seat\.id===seatId\)\)return false/);
 const entry=admin.slice(admin.indexOf('function requestedAdminSeatId'),admin.indexOf('function stopRealtimeSubscriptions'));
 assert.doesNotMatch(entry,/collection\(|\.set\(|\.add\(|batch\.|innerHTML|eval\(/);
});

test('handled seatId is removed so refresh and back navigation do not reopen it',()=>{
 assert.match(admin,/url\.searchParams\.delete\('seatId'\)/);
 assert.match(admin,/history\.replaceState\(history\.state,'',`\$\{url\.pathname\}\$\{url\.search\}\$\{url\.hash\}`\)/);
});

test('the existing seat-order lookup implementation remains unchanged and creates no order',()=>{
 const start=admin.indexOf('function openSeatOrderDetail(seatId,trigger=null)');
 const end=admin.indexOf("\ndocument.getElementById('ordersPanel')",start);
 const implementation=admin.slice(start,end<0?start+1200:end);
 assert.match(implementation,/const related=activeOrdersForSeat\(seatId\)/);
 assert.match(implementation,/showAdminMessage\('이 테이블에 연결된 활성 주문이 없습니다\.'/);
 assert.doesNotMatch(implementation,/collection\(|\.set\(|\.add\(|createOrder\(/);
});
