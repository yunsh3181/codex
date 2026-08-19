const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,runTransaction,serverTimestamp,setDoc,updateDoc,Timestamp}=require('firebase/firestore');
const adminOperations=require('../admin-operations.js');

assert.equal(typeof adminOperations.createAutoReadyCoordinator,'function');

const PROJECT_ID='demo-admin-inline-actions';
const root=path.resolve(__dirname,'..');
const emulatorAvailable=Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if(!emulatorAvailable){
 test('admin inline action Firestore transactions (run with temporary emulator)',{skip:true},()=>{});
}else{
 let environment;
 const activeAutoReadyCoordinators=[];
 test.before(async()=>{environment=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}})});
 test.beforeEach(async()=>{await environment.clearFirestore()});
 test.afterEach(()=>{
  for(const coordinator of activeAutoReadyCoordinators){
   assert.equal(coordinator.timers.size,0,'fixture leaves no auto-ready timer');
   assert.equal(coordinator.locks.size,0,'fixture leaves no auto-ready lock');
  }
  activeAutoReadyCoordinators.length=0;
 });
 test.after(async()=>{await environment.cleanup()});

 const adminDb=()=>environment.authenticatedContext('admin-inline',{admin:true}).firestore();
 const userDb=()=>environment.authenticatedContext('ordinary-user',{}).firestore();
 const ref=(db,collection,id)=>doc(db,collection,id);
 const seed=async({orders=[],seats=[],displays=[]})=>environment.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await Promise.all([
   ...orders.map(value=>setDoc(ref(db,'orders',value.id),value)),
   ...seats.map(value=>setDoc(ref(db,'seats',value.id),value)),
   ...displays.map(value=>setDoc(ref(db,'publicOrderDisplays',value.id),value))
  ]);
 });
 const read=async(db,collection,id)=>{const snapshot=await getDoc(ref(db,collection,id));return snapshot.exists()?snapshot.data():null};
 const order=(id,status='payment_pending',overrides={})=>({id,status,orderType:'dinein',customerNumber:id,businessDay:'2026-08-05',seat:{tables:[`${id}-seat`]},...overrides});
 const seat=(id,orderId,status='held')=>({id,status,orderId,orderNo:orderId,partySize:2});

 const adminSource=fs.readFileSync(path.join(root,'admin.js'),'utf8');
 const releaseSource=adminSource.match(/function seatReleasePayload\(\)\{[\s\S]*?\n\}/)?.[0];
 const setStatusSource=adminSource.match(/async function setStatus\(id,status,button\)\{[\s\S]*?\n\}\n\nlet forceCompleteOrderId/)?.[0].replace(/\n\nlet forceCompleteOrderId[\s\S]*/,'');
 assert.ok(releaseSource&&setStatusSource,'production transaction source found');
 assert.equal((setStatusSource.match(/createAutoReadyCoordinator\(/g)||[]).length,1,'production source creates exactly one auto-ready coordinator');

 function compatDb(db,mutationLog=[],options={}){
  return {
   collection(name){return {doc(id){return ref(db,name,id)}}},
   async runTransaction(callback){options.transactionCalls?.push(Date.now());if(options.beforeTransaction)await options.beforeTransaction();return runTransaction(db,transaction=>callback({
    async get(documentRef){const snapshot=await transaction.get(documentRef);return {exists:snapshot.exists(),data:()=>snapshot.data()}},
    update(documentRef,data){mutationLog.push({type:'update',path:documentRef.path});transaction.update(documentRef,Object.fromEntries(Object.entries(data)))},
    set(documentRef,data,options){mutationLog.push({type:'set',path:documentRef.path});transaction.set(documentRef,Object.fromEntries(Object.entries(data)),options)},
    delete(documentRef){mutationLog.push({type:'delete',path:documentRef.path});transaction.delete(documentRef)}
   }))}
  };
 }
 function createRunner(db,localOrder){
  const mutations=[],messages=[],errors=[];
  const context={
   Set,Promise,orders:[localOrder],db:compatDb(db,mutations),seatSnapshotRecord:adminOperations.seatSnapshotRecord,classifyCurrentSeatOrderMismatch:adminOperations.classifySeatOrderMismatch,displayIdentity:adminOperations.displayIdentity,
   firebase:{auth:()=>({currentUser:{uid:'admin-inline'}}),firestore:{FieldValue:{serverTimestamp}}},
   createAutoReadyCoordinator:adminOperations.createAutoReadyCoordinator,
   completeTakeoutTransaction:adminOperations.completeTakeoutTransaction,
   orderSeatIds:value=>Array.isArray(value?.seat?.tables)?value.seat.tables:value?.seat?.id?[value.seat.id]:[],
   orderBusinessDayKey:value=>value.businessDay||null,seoulBusinessDayKey:()=> '2026-08-05',adminOrderNumberLabel:value=>value.customerNumber||value.id,
   stopNewOrderRepeat(){},showAdminMessage(message,isError){messages.push({message,isError})},openForceCompleteModal(){messages.push({message:'force-complete-modal',isError:false})},setTimeout(){},hasUnacceptedOrders:()=>false,startNewOrderRepeat(){},callCustomer(){},
   console:{error(...args){errors.push(args.map(value=>value?.message||String(value)).join(' '))}}
  };
  assert.strictEqual(context.createAutoReadyCoordinator,adminOperations.createAutoReadyCoordinator,'fixture uses the production auto-ready export');
  vm.createContext(context);vm.runInContext(`${releaseSource}\nconst statusUpdateLocks=new Set();\n${setStatusSource}`,context);
  const coordinator=vm.runInContext('autoReadyCoordinator',context);
  assert.equal(coordinator.timers.size,0,'fixture initialization creates no auto-ready timer');
  assert.equal(coordinator.locks.size,0,'fixture initialization creates no auto-ready lock');
  activeAutoReadyCoordinators.push(coordinator);
  return {run:(status)=>context.setStatus(localOrder.id,status,null),mutations,messages,errors};
 }

 test('A. pending dine-in acceptance updates only the order and linked held seats',async()=>{
  const value=order('dine-a',undefined,{seat:{tables:['a-1','a-2']}});await seed({orders:[value],seats:[seat('a-1',value.id),seat('a-2',value.id),seat('other','other-order')]});
  const runner=createRunner(adminDb(),value);assert.equal(await runner.run('accepted'),true,runner.errors.join('\n'));
  assert.equal((await read(adminDb(),'orders',value.id)).status,'accepted');assert.equal((await read(adminDb(),'seats','a-1')).status,'occupied');assert.equal((await read(adminDb(),'seats','a-2')).status,'occupied');assert.equal((await read(adminDb(),'seats','other')).status,'held');
  assert.deepEqual(runner.mutations.map(x=>x.path).sort(),['orders/dine-a','seats/a-1','seats/a-2']);
 });

 test('B. pending takeout acceptance writes no seat and maintains public display',async()=>{
  const value=order('takeout-b',undefined,{orderType:'takeout',seat:null});await seed({orders:[value],seats:[seat('unrelated','other')]});
  const runner=createRunner(adminDb(),value);assert.equal(await runner.run('accepted'),true,runner.errors.join('\n'));
  assert.equal((await read(adminDb(),'orders',value.id)).status,'accepted');assert.equal((await read(adminDb(),'seats','unrelated')).status,'held');assert.equal((await read(adminDb(),'publicOrderDisplays',value.id)).displayStatus,'cooking');
  assert.deepEqual(runner.mutations.map(x=>x.path).sort(),['orders/takeout-b','publicOrderDisplays/takeout-b']);
 });

 test('C-D. completion releases every linked occupied seat and no other order seat',async()=>{
  const value=order('dine-c','accepted',{seat:{tables:['c-1','c-2']}});await seed({orders:[value],seats:[seat('c-1',value.id,'occupied'),seat('c-2',value.id,'occupied'),seat('other','other-order','occupied')]});
  const runner=createRunner(adminDb(),value);assert.equal(await runner.run('completed'),true,runner.errors.join('\n'));
  assert.equal((await read(adminDb(),'orders',value.id)).status,'completed');assert.equal((await read(adminDb(),'seats','c-1')).status,'empty');assert.equal((await read(adminDb(),'seats','c-2')).status,'empty');assert.equal((await read(adminDb(),'seats','other')).status,'occupied');
  assert.deepEqual(runner.mutations.map(x=>x.path).sort(),['orders/dine-c','seats/c-1','seats/c-2']);
 });

 for(const [label,status,seatOrder,includeSeat] of [['E reserved','reserved','dine-fail',true],['F held','held','dine-fail',true],['G other orderId','occupied','other-order',true],['H missing',null,null,false]]){
  test(`${label}. invalid completion aborts all writes`,async()=>{
   const value=order('dine-fail','accepted');await seed({orders:[value],seats:includeSeat?[seat('dine-fail-seat',seatOrder,status)]:[]});
   const runner=createRunner(adminDb(),value);assert.equal(await runner.run('completed'),false);assert.equal((await read(adminDb(),'orders',value.id)).status,'accepted');
   if(includeSeat)assert.equal((await read(adminDb(),'seats','dine-fail-seat')).status,status);
  });
 }

 test('I. two admins accepting concurrently produce one success and no duplicate writes',async()=>{
  const value=order('concurrent-i');await seed({orders:[value],seats:[seat('concurrent-i-seat',value.id)]});
  const first=createRunner(adminDb(),value),second=createRunner(environment.authenticatedContext('admin-two',{admin:true}).firestore(),value);
  const results=await Promise.all([first.run('accepted'),second.run('accepted')]);assert.deepEqual(results.sort(),[false,true]);
  assert.equal((await read(adminDb(),'orders',value.id)).status,'accepted');assert.equal((await read(adminDb(),'seats','concurrent-i-seat')).status,'occupied');
 });

 test('J. two admins completing concurrently produce one success and one final release',async()=>{
  const value=order('concurrent-j','accepted');await seed({orders:[value],seats:[seat('concurrent-j-seat',value.id,'occupied')]});
  const first=createRunner(adminDb(),value),second=createRunner(environment.authenticatedContext('admin-two',{admin:true}).firestore(),value);
  const results=await Promise.all([first.run('completed'),second.run('completed')]);assert.deepEqual(results.sort(),[false,true]);
  assert.equal((await read(adminDb(),'orders',value.id)).status,'completed');assert.equal((await read(adminDb(),'seats','concurrent-j-seat')).status,'empty');
 });

 test('K-M. current rules reject ordinary writes and allow administrator writes',async()=>{
  await seed({orders:[order('rules-order')],seats:[seat('rules-seat','rules-order')]});
  await assertFails(updateDoc(ref(userDb(),'orders','rules-order'),{status:'accepted'}));
  await assertFails(updateDoc(ref(userDb(),'seats','rules-seat'),{status:'occupied'}));
  await assertSucceeds(updateDoc(ref(adminDb(),'orders','rules-order'),{status:'accepted'}));
  await assertSucceeds(updateDoc(ref(adminDb(),'seats','rules-seat'),{status:'occupied'}));
 });

 test('N. cancelled and unknown UI states expose no transaction entry point',()=>{
  const paymentStart=adminSource.indexOf('function isPendingOrder('),paymentEnd=adminSource.indexOf('function centralOrderRow(',paymentStart),context={esc:String,adminOrderNumberLabel:()=> '1',orderSeatIds:adminOperations.orderSeatIds,seatDocuments:{seat:{status:'occupied',orderId:'safe'}},classifySeatOrderMismatch:adminOperations.classifySeatOrderMismatch,forceConfirmationValue:adminOperations.forceConfirmationValue};
  vm.createContext(context);vm.runInContext(adminSource.slice(paymentStart,paymentEnd),context);
  for(const status of ['cancelled',undefined,null,'','unknown_status']){
   assert.doesNotMatch(context.centralPaymentAction({id:'safe',status}),/<button|data-action|data-status/);assert.doesNotMatch(context.centralSeatAction({id:'safe',status,orderType:'dinein'}),/<button/);
  }
 });

 async function runProductionForce(db,value,options={}){
  return adminOperations.forceCompleteTransaction({db:compatDb(db,options.mutations||[],options),orderId:value.id,expectedStatus:value.status,expectedConfirmation:adminOperations.forceConfirmationValue(value),serverTimestamp});
 }
 test('O. production force transaction completes payment_pending and writes only force metadata on the order',async()=>{
  const value=order('force-1032','payment_pending',{seat:{tables:['force-seat']}}),originalSeat=seat('force-seat','other-order','occupied');await seed({orders:[value],seats:[originalSeat]});
  await assertFails(updateDoc(ref(userDb(),'orders',value.id),{status:'completed'}));
  const mutations=[];const result=await runProductionForce(adminDb(),value,{mutations});const saved=await read(adminDb(),'orders',value.id);
  assert.equal(saved.status,'completed');assert.equal(saved.adminForceCompleted,true);assert.equal(saved.adminForceCompleteReason,'seat_state_mismatch');assert.ok(saved.adminForceCompletedAt);assert.ok(saved.updatedAt);
  assert.deepEqual(mutations.map(item=>item.path),[`orders/${value.id}`]);assert.equal(result.orderWrites,1);assert.equal(result.seatWrites,0);assert.equal(result.paymentCalls,0);assert.deepEqual(await read(adminDb(),'seats','force-seat'),originalSeat);
 });
 for(const status of ['new','accepted','paid','cooking','ready'])test(`P. production force policy allows ${status}`,async()=>{
  const value=order(`force-${status}`,status,{seat:{tables:[`seat-${status}`]}});await seed({orders:[value],seats:[seat(`seat-${status}`,'other','occupied')]});
  const result=await runProductionForce(adminDb(),value);assert.equal(result.orderWrites,1);assert.equal((await read(adminDb(),'orders',value.id)).status,'completed');
 });
 for(const status of ['completed','cancelled',null,'','unknown'])test(`Q. production force policy rejects ${String(status)} with zero writes`,async()=>{
  const value=order(`reject-${String(status)}`,status,{seat:{tables:['reject-seat']}});await seed({orders:[value],seats:[seat('reject-seat','other','occupied')]});
  const mutations=[];await assert.rejects(runProductionForce(adminDb(),value,{mutations}),error=>['order/ineligible','order/stale-state'].includes(error.code));
  assert.equal(mutations.length,0);assert.equal((await read(adminDb(),'orders',value.id)).status,status);assert.equal((await read(adminDb(),'seats','reject-seat')).status,'occupied');
 });
 test('Q. production force rejects a missing status and a deleted order with zero writes',async()=>{
  const missing=order('missing-status','accepted',{seat:{tables:['missing-seat']}});delete missing.status;await seed({orders:[missing],seats:[seat('missing-seat','other','occupied')]});
  await assert.rejects(adminOperations.forceCompleteTransaction({db:compatDb(adminDb()),orderId:missing.id,expectedStatus:undefined,expectedConfirmation:adminOperations.forceConfirmationValue(missing),serverTimestamp}),{code:'order/ineligible'});
  const deleted=order('deleted-order','accepted');await assert.rejects(runProductionForce(adminDb(),deleted),{code:'order/not-found'});
 });
 test('R. linked held/occupied seats remain on the normal product path and expose no force eligibility',async()=>{
  for(const status of ['held','occupied']){const value=order(`normal-${status}`,status==='held'?'payment_pending':'accepted',{seat:{tables:[`normal-${status}-seat`]}}),seats={[`normal-${status}-seat`]:seat(`normal-${status}-seat`,value.id,status)};assert.equal(adminOperations.classifySeatOrderMismatch(value,seats).forceEligible,false)}
 });
 test('S. wrong confirmation and stale completed/cancelled server state commit zero writes',async()=>{
  const value=order('confirm-4321','accepted',{seat:{tables:['confirm-seat']}});await seed({orders:[value],seats:[seat('confirm-seat','other','occupied')]});
  await assert.rejects(adminOperations.forceCompleteTransaction({db:compatDb(adminDb()),orderId:value.id,expectedStatus:value.status,expectedConfirmation:'9999',serverTimestamp}),{code:'order/confirmation-changed'});
  await updateDoc(ref(adminDb(),'orders',value.id),{status:'completed'});await assert.rejects(runProductionForce(adminDb(),value),{code:'order/stale-state'});assert.equal((await read(adminDb(),'seats','confirm-seat')).status,'occupied');
  await updateDoc(ref(adminDb(),'orders',value.id),{status:'cancelled'});await assert.rejects(runProductionForce(adminDb(),value),{code:'order/stale-state'});assert.equal((await read(adminDb(),'orders',value.id)).adminForceCompleted,undefined);
 });
 test('T. concurrent force requests produce one successful transaction and no duplicate write',async()=>{
  const value=order('double-5566','accepted',{seat:{tables:['double-seat']}});await seed({orders:[value],seats:[seat('double-seat','other','occupied')]});
  const results=await Promise.allSettled([runProductionForce(adminDb(),value),runProductionForce(environment.authenticatedContext('admin-two',{admin:true}).firestore(),value)]);
  assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal((await read(adminDb(),'orders',value.id)).status,'completed');assert.equal((await read(adminDb(),'seats','double-seat')).status,'occupied');
 });

 async function releaseGroups(db,seats,now,options={}){
  const groups=adminOperations.expiredSeatGroups(seats,now),results=[];
  for(const group of groups)results.push(await adminOperations.releaseExpiredSeatGroupTransaction({db:compatDb(db,options.mutations||[],options),group,now,serverTimestamp}));
  return results;
 }
 const expirySeat=(id,orderId,status,occupiedAt)=>({...seat(id,orderId,status),occupiedAt});
 test('U. production expiry boundary is Timestamp-based at 2:59:59 / 3:00:00 / 3:00:01',async()=>{
  const now=Date.UTC(2026,7,5,9),cases=[[10799000,0],[10800000,1],[10801000,1]];
  for(const [elapsed,releases] of cases){await environment.clearFirestore();const value=expirySeat(`boundary-${elapsed}`,'boundary-order','occupied',Timestamp.fromMillis(now-elapsed));await seed({seats:[value]});const results=await releaseGroups(adminDb(),{[value.id]:value},now);assert.equal(results.reduce((sum,item)=>sum+item.released,0),releases);assert.equal((await read(adminDb(),'seats',value.id)).status,releases?'empty':'occupied')}
 });
 test('V. production expiry releases every fully expired seat in one order group and no other order',async()=>{
  const now=Date.UTC(2026,7,5,9),old=Timestamp.fromMillis(now-10801000),orderDoc=order('expiry-order','completed'),values=[expirySeat('expiry-1','expiry-order','occupied',old),expirySeat('expiry-2','expiry-order','occupied',old),expirySeat('other-order-seat','other-order','occupied',Timestamp.fromMillis(now-1000))];await seed({orders:[orderDoc],seats:values});
  const map=Object.fromEntries(values.map(value=>[value.id,value])),mutations=[],results=await releaseGroups(adminDb(),map,now,{mutations});assert.equal(results[0].released,2);assert.deepEqual(mutations.map(item=>item.path).sort(),['seats/expiry-1','seats/expiry-2']);assert.equal((await read(adminDb(),'orders',orderDoc.id)).status,'completed');assert.equal((await read(adminDb(),'seats','other-order-seat')).status,'occupied');
 });
 for(const [label,values] of [
  ['one young seat',[['old','occupied',10801000],['young','occupied',10799000]]],
  ['one held seat',[['old','occupied',10801000],['held','held',10801000]]],
  ['one reserved seat',[['old','occupied',10801000],['reserved','reserved',10801000]]],
  ['one empty seat',[['old','occupied',10801000],['empty','empty',10801000]]],
  ['one unknown seat',[['old','occupied',10801000],['unknown','unknown',10801000]]]
 ])test(`W. production expiry preserves whole group with ${label}`,async()=>{const now=Date.UTC(2026,7,5,9),seats=values.map(([id,status,elapsed])=>expirySeat(id,'protected-order',status,Timestamp.fromMillis(now-elapsed)));await seed({seats});assert.deepEqual(await releaseGroups(adminDb(),Object.fromEntries(seats.map(value=>[value.id,value])),now),[]);for(const value of seats)assert.equal((await read(adminDb(),'seats',value.id)).status,value.status)});
 test('X. missing, null, and invalid occupiedAt are retained for review with zero writes',async()=>{
  const now=Date.UTC(2026,7,5,9),values=[expirySeat('missing-time','review','occupied',undefined),expirySeat('null-time','review','occupied',null),expirySeat('invalid-time','review','occupied','invalid Timestamp')];delete values[0].occupiedAt;await seed({seats:values});assert.deepEqual(await releaseGroups(adminDb(),Object.fromEntries(values.map(value=>[value.id,value])),now),[]);for(const value of values)assert.equal((await read(adminDb(),'seats',value.id)).status,'occupied');
 });
 test('Y. transaction-time status/orderId/occupiedAt changes are stale and commit zero automatic writes',async()=>{
  const now=Date.UTC(2026,7,5,9),old=Timestamp.fromMillis(now-10801000);
  for(const [field,value] of [['status','held'],['orderId','other-order'],['occupiedAt',Timestamp.fromMillis(now-1000)]]){await environment.clearFirestore();const initial=expirySeat(`stale-${field}`,'stale-order','occupied',old);await seed({seats:[initial]});const group=adminOperations.expiredSeatGroups({[initial.id]:initial},now)[0],db=adminDb();await assert.rejects(adminOperations.releaseExpiredSeatGroupTransaction({db:compatDb(db,[],{beforeTransaction:()=>updateDoc(ref(db,'seats',initial.id),{[field]:value})}),group,now,serverTimestamp}),{code:'seat/stale-expiry'});assert.notEqual((await read(db,'seats',initial.id)).status,'empty')}
 });
 test('Z. overlapping triggers and two administrators allow one complete group release only',async()=>{
  const now=Date.UTC(2026,7,5,9),old=Timestamp.fromMillis(now-10801000),values=[expirySeat('race-1','race-order','occupied',old),expirySeat('race-2','race-order','occupied',old)];await seed({seats:values});const group=adminOperations.expiredSeatGroups(Object.fromEntries(values.map(value=>[value.id,value])),now)[0];
  const results=await Promise.allSettled([adminOperations.releaseExpiredSeatGroupTransaction({db:compatDb(adminDb()),group,now,serverTimestamp}),adminOperations.releaseExpiredSeatGroupTransaction({db:compatDb(environment.authenticatedContext('admin-two',{admin:true}).firestore()),group,now,serverTimestamp})]);assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal((await read(adminDb(),'seats','race-1')).status,'empty');assert.equal((await read(adminDb(),'seats','race-2')).status,'empty');
 });
}
