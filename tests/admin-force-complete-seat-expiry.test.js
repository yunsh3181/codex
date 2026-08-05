const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const html=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'admin.css'),'utf8');

test('force completion is centrally classified and writes only the order document',()=>{
 assert.match(admin,/function classifySeatOrderMismatch\(order,seats=seatDocuments\)/);
 for(const status of ['payment_pending','new','accepted','paid','cooking','ready'])assert.ok(admin.includes(`'${status}'`));
 assert.match(admin,/if\(allHeld\|\|allOccupied\)return \{forceEligible:false/);
 assert.match(admin,/belongs\(record\)&&!\['held','occupied'\]\.includes\(record\.status\)/);
 const forceSource=admin.match(/async function forceCompleteOrder\(\)\{[\s\S]*?\n\}/)?.[0]||'';
 assert.match(forceSource,/transaction\.update\(orderRef,\{status:'completed'/);
 assert.doesNotMatch(forceSource,/transaction\.(?:set|update)\([^\n]*seats/);
 assert.doesNotMatch(forceSource,/callCustomer|payment.*API|enqueueCustomerCall/);
 assert.match(forceSource,/adminForceCompleted:true/);
});

test('force confirmation modal is accessible, guarded, and action clicks stay isolated',()=>{
 for(const text of ['주문 강제완료','이 주문은 현재 좌석 상태와 연결 정보가 일치하지 않습니다.','강제완료하면 주문 기록만 완료로 변경됩니다. 현재 좌석과 실제 결제는 변경되지 않습니다.','실제로 제공 및 완료된 주문인 경우에만 사용하세요.','강제완료 확인'])assert.ok(html.includes(text));
 assert.match(html,/role="dialog" aria-modal="true"/);
 assert.match(admin,/value\.slice\(-Math\.min\(4,value\.length\)\)/);
 assert.match(admin,/event\.key==='Escape'/);
 assert.match(admin,/event\.target\.closest\('button\[data-action\]'\)/);
 assert.match(css,/\.central-status-action\.force-complete\{background:#a8202d/);
});

test('occupied expiry uses the exact three-hour boundary and grouped seat-only transactions',()=>{
 assert.match(admin,/OCCUPIED_EXPIRY_MS=3\*60\*60\*1000/);
 assert.match(admin,/millis<=now-OCCUPIED_EXPIRY_MS/);
 assert.match(admin,/group\.every\(seat=>\{const millis=timestampMillis\(seat\.occupiedAt\);return seat\.status==='occupied'/);
 const releaseSource=admin.match(/async function releaseExpiredSeatGroup\(group,now\)\{[\s\S]*?\n\}/)?.[0]||'';
 assert.match(releaseSource,/current\.status!=='occupied'/);
 assert.match(releaseSource,/timestampMillis\(current\.occupiedAt\)!==timestampMillis\(initial\.occupiedAt\)/);
 assert.match(releaseSource,/transaction\.set\(ref,seatReleasePayload\(\)/);
 assert.doesNotMatch(releaseSource,/collection\('orders'\)|status:'completed'/);
});

test('expiry lifecycle, missing timestamp warning, and readable list tokens are present',()=>{
 for(const trigger of ["setInterval(releaseExpiredSeats,60000)","window.addEventListener('focus'","visibilitychange","scheduleExpiredSeatRelease()"] )assert.ok(admin.includes(trigger));
 assert.ok(admin.includes('점유시간 확인 필요'));
 assert.ok(admin.includes('Windows 시간 동기화를 확인해 주세요.'));
 for(const token of ['--central-header-font','--central-body-font','--central-sequence-font','--central-row-height','--central-action-height','--central-action-font'])assert.ok(css.includes(token));
 assert.match(css,/@media\(max-width:1150px\).*--central-action-height:40px/);
});
