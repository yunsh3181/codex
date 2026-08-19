const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const operations=require('../admin-operations');

const ts=value=>({toMillis:()=>value});
function fixture(initial,sessions=[]){
 const seat={...initial},writes=[];let transactionCount=0;
 const seatRef={kind:'seat',id:'room-2'},sessionRefs=sessions.map((value,index)=>({kind:'session',id:String(index),value}));
 const db={collection(name){return name==='seats'?{doc:()=>seatRef}:{doc:()=>({collection:()=>({doc:index=>sessionRefs[Number(index)]||sessionRefs[0]})})}},async runTransaction(callback){transactionCount++;let pending;const result=await callback({async get(ref){if(ref.kind==='seat')return {exists:true,data:()=>({...seat})};return {exists:Boolean(ref?.value),data:()=>({...ref.value})}},set(ref,payload){assert.equal(ref,seatRef);pending=payload}});if(pending){writes.push(pending);Object.assign(seat,pending)}return result}};
 return {db,seat,writes,sessionRefs,get transactionCount(){return transactionCount}};
}
const recover=(f,overrides={})=>operations.recoverOrphanHeldSeatTransaction({db:f.db,seatId:'room-2',expectedHeldBy:'owner',expectedHeldUntil:ts(1000),nowMillis:62000,serverTimestamp:()=>ts(62000),adminId:'admin-1',activeSessionRefs:f.sessionRefs,...overrides});

test('A expired held without an order recovers with exactly one audited seat write',async()=>{const f=fixture({status:'held',heldBy:'owner',heldAt:ts(0),heldUntil:ts(1000),orderId:null});const result=await recover(f);assert.equal(result.seatWrites,1);assert.equal(result.orderWrites,0);assert.equal(result.paymentCalls,0);assert.equal(f.writes.length,1);assert.equal(f.seat.status,'empty');assert.equal(f.seat.recoveryReason,'orphan_expired_hold');assert.equal(f.seat.recoveredBy,'admin-1')});
test('B a linked order blocks recovery with zero writes',async()=>{const f=fixture({status:'held',heldBy:'owner',heldAt:ts(0),heldUntil:ts(1000),orderId:'order-1'});await assert.rejects(recover(f),{code:'seat/recovery-order-linked'});assert.equal(f.writes.length,0)});
test('C a recent or unexpired hold blocks recovery',async()=>{const f=fixture({status:'held',heldBy:'owner',heldAt:ts(60000),heldUntil:ts(61000),orderId:null});await assert.rejects(recover(f,{expectedHeldUntil:ts(61000)}),{code:'seat/recovery-recent-hold'});assert.equal(f.writes.length,0)});
test('D a matching active kiosk session blocks recovery',async()=>{const f=fixture({status:'held',heldBy:'owner',heldAt:ts(0),heldUntil:ts(1000),orderId:null},[{sessionId:'owner',heartbeatAt:ts(62000)}]);await assert.rejects(recover(f),{code:'seat/recovery-active-session'});assert.equal(f.writes.length,0)});
test('E stale owner identity blocks recovery',async()=>{const f=fixture({status:'held',heldBy:'other',heldAt:ts(0),heldUntil:ts(1000),orderId:null});await assert.rejects(recover(f),{code:'seat/stale-recovery'});assert.equal(f.writes.length,0)});
test('F occupied reserved and unknown states never recover',async()=>{for(const status of ['occupied','reserved','unknown']){const f=fixture({status,heldBy:'owner',heldAt:ts(0),heldUntil:ts(1000),orderId:null});await assert.rejects(recover(f));assert.equal(f.writes.length,0)}});
test('G damaged hold timestamps fail closed',async()=>{const f=fixture({status:'held',heldBy:'owner',heldAt:null,heldUntil:null,orderId:null});await assert.rejects(recover(f));assert.equal(f.writes.length,0)});
test('H an unrelated active session does not own the expired hold',async()=>{const f=fixture({status:'held',heldBy:'owner',heldAt:ts(0),heldUntil:ts(1000),orderId:null},[{sessionId:'different',heartbeatAt:ts(62000)}]);await recover(f);assert.equal(f.writes.length,1)});
test('I a second administrator using the stale snapshot cannot write',async()=>{const f=fixture({status:'held',heldBy:'owner',heldAt:ts(0),heldUntil:ts(1000),orderId:null});await recover(f);await assert.rejects(recover(f));assert.equal(f.writes.length,1)});
test('J dashboard and seat manager use the production helper and expose only the dedicated action',()=>{const root=path.join(__dirname,'..'),admin=fs.readFileSync(path.join(root,'admin.js'),'utf8'),seats=fs.readFileSync(path.join(root,'seats.js'),'utf8');for(const source of [admin,seats]){assert.match(source,/recoverOrphanHeldSeatTransaction/);assert.match(source,/orphanHeldSeatState/);assert.match(source,/강제 빈자리/);assert.doesNotMatch(source,/status:'empty'.*data-recover-orphan-hold/)}assert.match(admin,/data-action="recover-orphan-hold"/);assert.match(seats,/data-recover-orphan-hold/)});
