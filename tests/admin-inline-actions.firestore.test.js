const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const test=require('node:test');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,runTransaction,serverTimestamp,setDoc,updateDoc}=require('firebase/firestore');

const PROJECT_ID='demo-admin-inline-actions';
const root=path.resolve(__dirname,'..');
const emulatorAvailable=Boolean(process.env.FIRESTORE_EMULATOR_HOST);

if(!emulatorAvailable){
 test('admin inline action Firestore transactions (run with temporary emulator)',{skip:true},()=>{});
}else{
 let environment;
 test.before(async()=>{environment=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}})});
 test.beforeEach(async()=>{await environment.clearFirestore()});
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
 const seatSnapshotSource=adminSource.match(/function seatSnapshotRecord\(snapshot\)\{[^\n]+\}/)?.[0];
 const mismatchSource=adminSource.match(/function classifySeatOrderMismatch\(order,seats=seatDocuments\)\{[\s\S]*?\n\}/)?.[0];
 const setStatusSource=adminSource.match(/async function setStatus\(id,status,button\)\{[\s\S]*?\n\}\n\nlet forceCompleteOrderId/)?.[0].replace(/\n\nlet forceCompleteOrderId[\s\S]*/,'');
 assert.ok(releaseSource&&setStatusSource,'production transaction source found');

 function compatDb(db,mutationLog){
  return {
   collection(name){return {doc(id){return ref(db,name,id)}}},
   runTransaction(callback){return runTransaction(db,transaction=>callback({
    get:documentRef=>transaction.get(documentRef),
    update(documentRef,data){mutationLog.push({type:'update',path:documentRef.path});transaction.update(documentRef,Object.fromEntries(Object.entries(data)))},
    set(documentRef,data,options){mutationLog.push({type:'set',path:documentRef.path});transaction.set(documentRef,Object.fromEntries(Object.entries(data)),options)},
    delete(documentRef){mutationLog.push({type:'delete',path:documentRef.path});transaction.delete(documentRef)}
   }))}
  };
 }
 function createRunner(db,localOrder){
  const mutations=[],messages=[],errors=[];
  const context={
   Set,Promise,orders:[localOrder],db:compatDb(db,mutations),
   firebase:{firestore:{FieldValue:{serverTimestamp}}},
   orderSeatIds:value=>Array.isArray(value?.seat?.tables)?value.seat.tables:value?.seat?.id?[value.seat.id]:[],
   orderBusinessDayKey:value=>value.businessDay||null,seoulBusinessDayKey:()=> '2026-08-05',adminOrderNumberLabel:value=>value.customerNumber||value.id,
   stopNewOrderRepeat(){},showAdminMessage(message,isError){messages.push({message,isError})},openForceCompleteModal(){messages.push({message:'force-complete-modal',isError:false})},setTimeout(){},hasUnacceptedOrders:()=>false,startNewOrderRepeat(){},callCustomer(){},
   console:{error(...args){errors.push(args.map(value=>value?.message||String(value)).join(' '))}}
  };
  vm.createContext(context);vm.runInContext(`${releaseSource}\nconst FORCE_COMPLETE_STATUSES=new Set(['payment_pending','new','accepted','paid','cooking','ready']);\n${seatSnapshotSource}\n${mismatchSource}\nconst statusUpdateLocks=new Set();\n${setStatusSource}`,context);
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
  const paymentStart=adminSource.indexOf('function isPendingOrder('),paymentEnd=adminSource.indexOf('function centralOrderRow(',paymentStart),context={esc:String,adminOrderNumberLabel:()=> '1',orderSeatIds:()=>['seat'],seatDocuments:{seat:{status:'occupied',orderId:'safe'}}};
  vm.createContext(context);vm.runInContext(adminSource.slice(paymentStart,paymentEnd),context);
  for(const status of ['cancelled',undefined,null,'','unknown_status']){
   assert.doesNotMatch(context.centralPaymentAction({id:'safe',status}),/<button|data-action|data-status/);assert.doesNotMatch(context.centralSeatAction({id:'safe',status,orderType:'dinein'}),/<button/);
  }
 });

 test('O-P. force completion is an administrator-only order write and preserves mismatched seats',async()=>{
  const value=order('force-order','accepted',{seat:{tables:['force-seat']}});await seed({orders:[value],seats:[seat('force-seat','other-order','occupied')]});
  await assertFails(updateDoc(ref(userDb(),'orders',value.id),{status:'completed'}));
  const db=adminDb();await assertSucceeds(runTransaction(db,async transaction=>{const orderRef=ref(db,'orders',value.id),snapshot=await transaction.get(orderRef);assert.equal(snapshot.data().status,'accepted');transaction.update(orderRef,{status:'completed',adminForceCompleted:true,adminForceCompleteReason:'seat_state_mismatch',updatedAt:serverTimestamp()})}));
  assert.equal((await read(adminDb(),'orders',value.id)).status,'completed');assert.equal((await read(adminDb(),'seats','force-seat')).orderId,'other-order');assert.equal((await read(adminDb(),'seats','force-seat')).status,'occupied');
 });

 test('Q-R. expired-seat release is administrator-only and never changes its order',async()=>{
  const value=order('expiry-order','accepted',{seat:{tables:['expiry-1','expiry-2']}});await seed({orders:[value],seats:[seat('expiry-1',value.id,'occupied'),seat('expiry-2',value.id,'occupied')]});
  await assertFails(updateDoc(ref(userDb(),'seats','expiry-1'),{status:'empty'}));
  const db=adminDb();await assertSucceeds(runTransaction(db,async transaction=>{const refs=['expiry-1','expiry-2'].map(id=>ref(db,'seats',id)),snapshots=await Promise.all(refs.map(seatRef=>transaction.get(seatRef)));snapshots.forEach(snapshot=>assert.equal(snapshot.data().status,'occupied'));refs.forEach(seatRef=>transaction.update(seatRef,{status:'empty',orderId:null,occupiedAt:null,updatedAt:serverTimestamp()}))}));
  assert.equal((await read(adminDb(),'orders',value.id)).status,'accepted');assert.equal((await read(adminDb(),'seats','expiry-1')).status,'empty');assert.equal((await read(adminDb(),'seats','expiry-2')).status,'empty');
 });
}
