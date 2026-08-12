const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,deleteDoc,runTransaction,serverTimestamp,setDoc,updateDoc,Timestamp}=require('firebase/firestore');
const operations=require('../admin-operations.js');

const PROJECT_ID='demo-admin-takeout-completion';
const emulatorAvailable=Boolean(process.env.FIRESTORE_EMULATOR_HOST);
if(!emulatorAvailable){test('admin takeout production transactions and rules matrix',{skip:true},()=>{});}else{
 let environment;const databases=new Map();
 test.before(async()=>{environment=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.resolve(__dirname,'../firestore.rules'),'utf8')}})});
 test.beforeEach(async()=>environment.clearFirestore());
 test.after(async()=>environment.cleanup());
 const database=(key,factory)=>{if(!databases.has(key))databases.set(key,factory().firestore());return databases.get(key)};
 const adminDb=(uid='admin-one')=>database(`admin:${uid}`,()=>environment.authenticatedContext(uid,{admin:true}));
 const userDb=()=>database('user',()=>environment.authenticatedContext('ordinary-user',{}));
 const anonymousDb=()=>database('anonymous',()=>environment.unauthenticatedContext());
 const kioskDb=()=>database('kiosk',()=>environment.authenticatedContext('kiosk-one',{role:'kiosk',storeId:'pangyo2-techno-valley',kioskId:'kiosk-01'}));
 const ref=(db,name,id)=>doc(db,name,id);
 const read=async(db,name,id)=>{const snap=await getDoc(ref(db,name,id));return snap.exists()?snap.data():null};
 function compatDb(db,mutations=[],transform=(path,data)=>data){return {collection:name=>({doc:id=>ref(db,name,id)}),runTransaction:callback=>runTransaction(db,transaction=>callback({get:documentRef=>transaction.get(documentRef).then(snapshot=>({exists:snapshot.exists(),data:()=>snapshot.data()})),set(documentRef,data,options){mutations.push({type:'set',path:documentRef.path});transaction.set(documentRef,transform(documentRef.path,data),options)},update(documentRef,data){mutations.push({type:'update',path:documentRef.path});transaction.update(documentRef,transform(documentRef.path,data))},delete(documentRef){mutations.push({type:'delete',path:documentRef.path});transaction.delete(documentRef)}}))};}
 const counterPayload=(status='cooking',overrides={})=>{const ready=status==='ready';return {channel:'admin',source:'admin_counter',schemaVersion:1,storeId:'pangyo2-techno-valley',orderNo:'4242',customerNumber:'4242',orderType:'takeout',pickup:{mode:'now'},items:[],itemCount:0,normalAmount:0,discountAmount:0,totalAmount:0,total:0,payment:{method:'counter',methodName:'대면 결제'},status,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),businessDay:'2026-08-08',...(ready?{completedAt:serverTimestamp(),completedBy:'admin-one'}:{}),...overrides};};
 const kioskPayload=()=>({channel:'mobile',deviceId:'mobile-01',appVersion:'1.2.24',schemaVersion:1,aggregationVersion:1,storeId:'pangyo2-techno-valley',storeName:'판교2테크노밸리점',orderNo:'P4242',customerNumber:'P4242',phone:'01012345678',phoneMasked:'010-****-5678',phoneLast4:'5678',orderType:'takeout',partySize:null,seat:null,pickup:{mode:'now'},disposables:false,items:[{id:'P001',name:'테스트',qty:1,price:10000,total:10000}],itemCount:1,normalAmount:10000,discountAmount:0,totalAmount:10000,total:10000,benefit:{labels:[]},payment:{method:'card',methodName:'카드'},status:'payment_pending',recommendationEvents:[],createdAt:serverTimestamp(),createdAtClient:'2026-08-08T01:00:00.000Z',source:'mobile'});
 const takeout=(id,status)=>({id,status,orderType:'takeout',customerNumber:id.slice(-4),businessDay:'2026-08-08',storeId:'pangyo2-techno-valley',total:15000});
 const seedTakeout=async value=>{const number=/^[0-9]{4}$/.test(value.customerNumber)?value.customerNumber:'8888',payload={...kioskPayload(),orderNo:`P${number}`,customerNumber:`P${number}`};await setDoc(ref(kioskDb(),'orders',value.id),payload);if(value.status!=='payment_pending')await updateDoc(ref(adminDb(),'orders',value.id),{status:value.status,businessDay:'2026-08-08'});await setDoc(ref(adminDb(),'publicOrderDisplays',value.id),{orderNumber:number,displayStatus:'cooking',storeId:'pangyo2-techno-valley',businessDay:'2026-08-08',updatedAt:serverTimestamp()})};
 const createCounter=(db,number,status,adminId='admin-one',mutations=[])=>operations.createCounterTakeoutTransaction({db:compatDb(db,mutations),orderNumber:number,status,businessDay:'2026-08-08',serverTimestamp,adminId});
 const createCounterChanged=(db,number,status,change,mutations=[])=>operations.createCounterTakeoutTransaction({db:compatDb(db,mutations,(path,data)=>change(path,{...data})),orderNumber:number,status,businessDay:'2026-08-08',serverTimestamp,adminId:'admin-one'});
 const complete=(db,value,mutations=[])=>operations.completeTakeoutTransaction({db:compatDb(db,mutations),orderId:value.id,expectedStatus:value.status,serverTimestamp,adminId:'admin-one'});
 const pickup=(db,value,mutations=[],adminId='admin-one')=>operations.completeTakeoutPickupTransaction({db:compatDb(db,mutations),orderId:value.id,expectedStatus:value.status,serverTimestamp,adminId});
 const startPreparation=(db,id,minutes,now,mutations=[])=>operations.startTakeoutPreparationTransaction({db:compatDb(db,mutations),orderId:id,preparationMinutes:minutes,nowMillis:now,serverTimestamp,timestampFromMillis:Timestamp.fromMillis,adminId:'admin-one',resolveBusinessDay:()=> '2026-08-08'});
 const autoComplete=(db,order,now,mutations=[])=>operations.autoCompleteTakeoutTransaction({db:compatDb(db,mutations),orderId:order.id,expectedReadyDueAt:order.readyDueAt,expectedPreparationStartedAt:order.preparationStartedAt,nowMillis:now,serverTimestamp,adminId:'admin-one',resolveBusinessDay:()=> '2026-08-08'});

 test('A-D. administrator valid creates and legacy rules remain allowed',async()=>{
  await assertSucceeds(createCounter(adminDb(),'4101','cooking'));
  await assertSucceeds(createCounter(adminDb(),'4102','ready'));
  await assertSucceeds(setDoc(ref(kioskDb(),'orders','kiosk-create'),kioskPayload()));
  await assertSucceeds(updateDoc(ref(adminDb(),'orders','kiosk-create'),{status:'accepted'}));
 });
 test('E-H. non-admin counter, completion, and public display writes are rejected',async()=>{
  await assertFails(setDoc(ref(userDb(),'orders','counter-user-cooking'),counterPayload('cooking')));
  await assertFails(setDoc(ref(userDb(),'orders','counter-user-ready'),counterPayload('ready')));
  await seedTakeout({...takeout('existing-takeout','cooking'),customerNumber:'4242'});
  await assertFails(updateDoc(ref(userDb(),'orders','existing-takeout'),{status:'ready'}));
  await assertFails(updateDoc(ref(userDb(),'publicOrderDisplays','existing-takeout'),{displayStatus:'ready',updatedAt:serverTimestamp()}));
 });
 test('I-Q. malformed production counter transaction payload matrix is rejected',async()=>{
  const cases=[
   ['source',{source:'other'}],['orderType',{orderType:'dinein'}],['status',{status:'accepted'}],['storeId',{storeId:'other-store'}],['businessDay',{businessDay:'2026/08/08'}],['orderNo',{orderNo:'42A2'}],['number mismatch',{customerNumber:'4243'}],
   ['pickup',{pickup:{mode:'reserve'}}],['items',{items:[{id:'fake'}]}],['itemCount',{itemCount:1}],['normalAmount',{normalAmount:1}],['discountAmount',{discountAmount:-1}],['total',{total:1}],['totalAmount',{totalAmount:1}],['payment',{payment:{method:'card',methodName:'카드'}}],
   ['cooking completion metadata',{completedAt:serverTimestamp(),completedBy:'admin-one'}],['createdAt',{createdAt:Timestamp.fromMillis(1)}],['updatedAt',{updatedAt:Timestamp.fromMillis(1)}],['extra',{unexpected:true}]
  ];
  let sequence=4200;for(const [label,override] of cases){sequence+=1;const mutations=[];await assert.rejects(createCounterChanged(adminDb(),String(sequence),'cooking',(path,data)=>path.startsWith('orders/')?{...data,...override}:data,mutations),label);assert.equal(await read(adminDb(),'orders',`counter_2026-08-08_${sequence}`),null);assert.equal(await read(adminDb(),'publicOrderDisplays',`counter_2026-08-08_${sequence}`),null)}
  await assert.rejects(createCounterChanged(adminDb(),'4301','ready',(path,data)=>{if(path.startsWith('orders/'))delete data.completedAt;return data}));
  await assert.rejects(createCounterChanged(adminDb(),'4302','ready',(path,data)=>{if(path.startsWith('orders/'))delete data.completedBy;return data}));
 });
 test('F-H. anonymous, ordinary, and kiosk identities cannot create admin counter orders',async()=>{
  for(const db of [anonymousDb(),userDb(),kioskDb()]){const mutations=[];await assert.rejects(createCounter(db,'4401','cooking','admin-one',mutations));assert.equal(await read(adminDb(),'orders','counter_2026-08-08_4401'),null);assert.equal(await read(adminDb(),'publicOrderDisplays','counter_2026-08-08_4401'),null)}
 });
 test('R-S. either rejected half aborts the complete production transaction',async()=>{
  await assert.rejects(createCounterChanged(adminDb(),'4501','cooking',(path,data)=>path.startsWith('orders/')?{...data,itemCount:1}:data));
  assert.equal(await read(adminDb(),'orders','counter_2026-08-08_4501'),null);assert.equal(await read(adminDb(),'publicOrderDisplays','counter_2026-08-08_4501'),null);
  await assert.rejects(createCounterChanged(adminDb(),'4502','cooking',(path,data)=>path.startsWith('publicOrderDisplays/')?{...data,orderNumber:'9999'}:data));
  assert.equal(await read(adminDb(),'orders','counter_2026-08-08_4502'),null);assert.equal(await read(adminDb(),'publicOrderDisplays','counter_2026-08-08_4502'),null);
 });
 test('U and X. concurrent identical counter intake creates one atomic order/display pair',async()=>{
  const firstMutations=[],secondMutations=[],results=await Promise.allSettled([createCounter(adminDb(),'5555','cooking','admin-one',firstMutations),createCounter(adminDb('admin-two'),'5555','cooking','admin-two',secondMutations)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);
  assert.ok(await read(adminDb(),'orders','counter_2026-08-08_5555'));assert.ok(await read(adminDb(),'publicOrderDisplays','counter_2026-08-08_5555'));
  assert.equal((await getDocs(collection(adminDb(),'orders'))).size,1);assert.equal((await getDocs(collection(adminDb(),'publicOrderDisplays'))).size,1);
 });
 test('direct ready counter intake is atomic and records completion with no seat/payment writes',async()=>{
  const mutations=[],result=await createCounter(adminDb(),'5656','ready','admin-one',mutations),order=await read(adminDb(),'orders',result.orderId),display=await read(adminDb(),'publicOrderDisplays',result.orderId);
  assert.equal(result.orderWrites,1);assert.equal(result.displayWrites,1);assert.equal(result.seatWrites,0);assert.equal(result.paymentCalls,0);
  assert.ok(order.completedAt);assert.equal(order.completedBy,'admin-one');assert.equal(order.status,'ready');assert.equal(display.displayStatus,'ready');
  assert.deepEqual(mutations.map(item=>item.path).sort(),[`orders/${result.orderId}`,`publicOrderDisplays/${result.orderId}`].sort());assert.equal((await getDocs(collection(adminDb(),'seats'))).size,0);
 });
 for(const status of ['accepted','paid','cooking'])test(`existing ${status} takeout completes atomically through production helper`,async()=>{
  const value=takeout(`takeout-${status}-4242`,status);await seedTakeout(value);
  const mutations=[],result=await complete(adminDb(),value,mutations),order=await read(adminDb(),'orders',value.id),display=await read(adminDb(),'publicOrderDisplays',value.id);
  assert.equal(result.orderWrites,1);assert.equal(result.displayWrites,1);assert.equal(result.seatWrites,0);assert.equal(result.paymentCalls,0);assert.equal(order.status,'ready');assert.ok(order.completedAt);assert.equal(display.displayStatus,'ready');
  assert.deepEqual(mutations.map(item=>item.path).sort(),[`orders/${value.id}`,`publicOrderDisplays/${value.id}`].sort());assert.equal((await getDocs(collection(adminDb(),'seats'))).size,0);
 });
 test('V. concurrent completion succeeds once and emits one final ready event',async()=>{
  const value=takeout('takeout-concurrent-7777','cooking');await seedTakeout(value);
  const results=await Promise.allSettled([complete(adminDb(),value),complete(adminDb('admin-two'),value)]);assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal((await read(adminDb(),'orders',value.id)).status,'ready');assert.equal((await read(adminDb(),'publicOrderDisplays',value.id)).displayStatus,'ready');
 });
 for(const status of ['completed','cancelled','ready'])test(`W-X. stale ${status} aborts without partial public write`,async()=>{
  const local={...takeout(`takeout-stale-${status}-8888`,'cooking'),customerNumber:'8888'},server={...local,status};await seedTakeout(server);
  const mutations=[];await assert.rejects(complete(adminDb(),local,mutations),{code:'order/stale-state'});assert.equal((await read(adminDb(),'orders',local.id)).status,status);assert.equal((await read(adminDb(),'publicOrderDisplays',local.id)).displayStatus,'cooking');assert.equal((await getDocs(collection(adminDb(),'seats'))).size,0);
 });
 test('ready takeout pickup completes atomically, preserves completion metadata, and deletes its display',async()=>{
  const value=takeout('takeout-pickup-4242','ready');await seedTakeout(value);
  const completedAt=Timestamp.fromMillis(123456);await updateDoc(ref(adminDb(),'orders',value.id),{completedAt,completedBy:'cook-admin'});
  const mutations=[],result=await pickup(adminDb(),value,mutations),order=await read(adminDb(),'orders',value.id);
  assert.equal(result.orderWrites,1);assert.equal(result.displayDeletes,1);assert.equal(result.seatWrites,0);assert.equal(result.paymentCalls,0);assert.equal(result.displayMissing,false);
  assert.equal(order.status,'completed');assert.equal(order.completedAt.toMillis(),completedAt.toMillis());assert.equal(order.completedBy,'cook-admin');assert.ok(order.pickedUpAt);assert.equal(order.pickedUpBy,'admin-one');
  assert.equal(await read(adminDb(),'publicOrderDisplays',value.id),null);assert.deepEqual(mutations.map(item=>item.path).sort(),[`orders/${value.id}`,`publicOrderDisplays/${value.id}`].sort());assert.equal((await getDocs(collection(adminDb(),'seats'))).size,0);
 });
 test('concurrent pickup succeeds once and leaves no partial display document',async()=>{
  const value=takeout('takeout-pickup-concurrent-7777','ready');await seedTakeout(value);
  const results=await Promise.allSettled([pickup(adminDb(),value),pickup(adminDb('admin-two'),value,[],'admin-two')]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);assert.equal((await read(adminDb(),'orders',value.id)).status,'completed');assert.equal(await read(adminDb(),'publicOrderDisplays',value.id),null);
 });
 for(const status of ['completed','cancelled','cooking'])test(`pickup stale ${status} aborts without order/display writes`,async()=>{
  const local=takeout(`takeout-pickup-stale-${status}-8888`,'ready');await seedTakeout({...local,status});
  const mutations=[];await assert.rejects(pickup(adminDb(),local,mutations),{code:'order/stale-state'});assert.equal((await read(adminDb(),'orders',local.id)).status,status);assert.ok(await read(adminDb(),'publicOrderDisplays',local.id));assert.equal((await getDocs(collection(adminDb(),'seats'))).size,0);
 });
 test('missing public display is reported while pickup still succeeds safely',async()=>{
  const value=takeout('takeout-pickup-missing-9999','ready');await seedTakeout(value);await environment.withSecurityRulesDisabled(context=>deleteDoc(ref(context.firestore(),'publicOrderDisplays',value.id)));
  const result=await pickup(adminDb(),value);assert.equal(result.displayMissing,true);assert.equal((await read(adminDb(),'orders',value.id)).status,'completed');assert.equal(await read(adminDb(),'publicOrderDisplays',value.id),null);
 });
 test('non-admin cannot complete a ready pickup or delete its public display',async()=>{
  const value=takeout('takeout-pickup-user-6161','ready');await seedTakeout(value);
  await assertFails(updateDoc(ref(userDb(),'orders',value.id),{status:'completed',pickedUpAt:serverTimestamp(),pickedUpBy:'ordinary-user'}));
  await assertFails(deleteDoc(ref(userDb(),'publicOrderDisplays',value.id)));assert.equal((await read(adminDb(),'orders',value.id)).status,'ready');assert.ok(await read(adminDb(),'publicOrderDisplays',value.id));
 });
 test('prep A-B. payment_pending and new takeout orders start cooking with an exact deadline',async()=>{
  const now=1770000000000;
  for(const [index,status] of ['payment_pending','new'].entries()){
   const id=`prep-start-${status}`;await seedTakeout(takeout(id,status));
   const mutations=[],result=await startPreparation(adminDb(),id,15,now,mutations),order=await read(adminDb(),'orders',id);
   assert.equal(result.orderWrites,1);assert.equal(result.displayWrites,1);assert.equal(result.seatWrites,0);assert.equal(result.paymentCalls,0);assert.equal(order.status,'cooking');assert.equal(order.preparationMinutes,15);assert.ok(order.preparationStartedAt);assert.equal(order.readyDueAt.toMillis(),now+15*60000);assert.equal(order.autoReadyEnabled,true);assert.equal((await getDocs(collection(adminDb(),'seats'))).size,0);assert.equal(index>=0,true);
  }
 });
 test('prep C-D. dine-in and invalid preparation values commit zero writes',async()=>{
  assert.equal(operations.validPreparationMinutes(5),true);assert.equal(operations.validPreparationMinutes(60),true);
  for(const value of [0,-5,6,61,'15',null,NaN]){const mutations=[];await assert.rejects(startPreparation(adminDb(),'missing',value,1770000000000,mutations),{code:'order/invalid-preparation'});assert.equal(mutations.length,0)}
  const id='prep-dinein';await seedTakeout(takeout(id,'payment_pending'));await updateDoc(ref(adminDb(),'orders',id),{orderType:'dinein'});const mutations=[];await assert.rejects(startPreparation(adminDb(),id,15,1770000000000,mutations),{code:'order/invalid-transition'});assert.equal(mutations.length,0);
 });
 test('prep F. concurrent administrators establish only one deadline',async()=>{
  const id='prep-concurrent';await seedTakeout(takeout(id,'payment_pending'));const results=await Promise.allSettled([startPreparation(adminDb(),id,10,1770000000000),startPreparation(adminDb('admin-two'),id,25,1770000000000)]),order=await read(adminDb(),'orders',id);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);assert.equal(order.status,'cooking');assert.ok([10,25].includes(order.preparationMinutes));
 });
 test('auto G-I. deadline before, at, and after follows the production transaction boundary',async()=>{
  const due=1770000900000;
  for(const [suffix,now,success] of [['before',due-1,false],['at',due,true],['after',due+1,true]]){
   const id=`auto-${suffix}`;await seedTakeout(takeout(id,'cooking'));await updateDoc(ref(adminDb(),'orders',id),{autoReadyEnabled:true,readyDueAt:Timestamp.fromMillis(due),preparationStartedAt:Timestamp.fromMillis(due-900000)});const order=await read(adminDb(),'orders',id),mutations=[];
   if(success){const result=await autoComplete(adminDb(),{id,...order},now,mutations);assert.equal(result.orderWrites,1);assert.equal(result.displayWrites,1);assert.equal((await read(adminDb(),'orders',id)).status,'ready');assert.equal((await read(adminDb(),'publicOrderDisplays',id)).displayStatus,'ready')}else{await assert.rejects(autoComplete(adminDb(),{id,...order},now,mutations),{code:'order/deadline-pending'});assert.equal(mutations.length,0)}
  }
 });
 test('auto J-N. races, stale states/timers, catch-up, and repeated snapshots complete once',async()=>{
  const due=1770000900000,start=Timestamp.fromMillis(due-900000),id='auto-race';await seedTakeout(takeout(id,'cooking'));await updateDoc(ref(adminDb(),'orders',id),{autoReadyEnabled:true,readyDueAt:Timestamp.fromMillis(due),preparationStartedAt:start});const order={id,...await read(adminDb(),'orders',id)};
  const race=await Promise.allSettled([autoComplete(adminDb(),order,due),complete(adminDb(),takeout(id,'cooking'))]);assert.equal(race.filter(result=>result.status==='fulfilled').length,1);assert.equal((await read(adminDb(),'orders',id)).status,'ready');assert.equal((await read(adminDb(),'publicOrderDisplays',id)).displayStatus,'ready');
  for(const status of ['ready','completed','cancelled']){const staleId=`auto-stale-${status}`;await seedTakeout(takeout(staleId,status));const mutations=[];await assert.rejects(operations.autoCompleteTakeoutTransaction({db:compatDb(adminDb(),mutations),orderId:staleId,expectedReadyDueAt:Timestamp.fromMillis(due),nowMillis:due,serverTimestamp}),{code:'order/stale-state'});assert.equal(mutations.length,0)}
  const changedId='auto-changed-deadline';await seedTakeout(takeout(changedId,'cooking'));await updateDoc(ref(adminDb(),'orders',changedId),{autoReadyEnabled:true,readyDueAt:Timestamp.fromMillis(due+60000),preparationStartedAt:start});const changedMutations=[];await assert.rejects(operations.autoCompleteTakeoutTransaction({db:compatDb(adminDb(),changedMutations),orderId:changedId,expectedReadyDueAt:Timestamp.fromMillis(due),expectedPreparationStartedAt:start,nowMillis:due+60000,serverTimestamp}),{code:'order/stale-timer'});assert.equal(changedMutations.length,0);
  const catchupId='auto-catchup';await seedTakeout(takeout(catchupId,'cooking'));await updateDoc(ref(adminDb(),'orders',catchupId),{autoReadyEnabled:true,readyDueAt:Timestamp.fromMillis(due),preparationStartedAt:start});const catchup={id:catchupId,...await read(adminDb(),'orders',catchupId)},repeated=await Promise.allSettled([autoComplete(adminDb(),catchup,due+5000),autoComplete(adminDb('admin-two'),catchup,due+5000),autoComplete(adminDb(),catchup,due+5000)]);assert.equal(repeated.filter(result=>result.status==='fulfilled').length,1);assert.equal((await read(adminDb(),'orders',catchupId)).status,'ready');assert.equal((await getDocs(collection(adminDb(),'publicOrderDisplays'))).docs.filter(doc=>doc.id===catchupId).length,1);
 });
 test('auto recovery A-B. transient failure retries once through the production completion helper',async()=>{
  const due=1770000900000,start=Timestamp.fromMillis(due-900000),id='auto-transient-recovery';await seedTakeout(takeout(id,'cooking'));await updateDoc(ref(adminDb(),'orders',id),{autoReadyEnabled:true,readyDueAt:Timestamp.fromMillis(due),preparationStartedAt:start});let current={id,...await read(adminDb(),'orders',id)},attempts=0,nextTimer=1;const timers=new Map(),mutations=[];
  const coordinator=operations.createAutoReadyCoordinator({getCurrentOrder:()=>current,now:()=>due+1,setTimer:(callback,delay)=>{const timer=nextTimer++;timers.set(timer,{callback,delay});return timer},clearTimer:timer=>timers.delete(timer),execute:async order=>{attempts++;if(attempts===1)throw Object.assign(new Error('temporary outage'),{code:'unavailable'});const result=await autoComplete(adminDb(),order,due+1,mutations);current={...current,status:'ready',autoReadyEnabled:false};return result}});
  coordinator.reconcile([current]);const fire=async()=>{const [timer,entry]=[...timers][0];timers.delete(timer);await entry.callback()};await fire();assert.equal(attempts,1);assert.equal(timers.size,1);assert.equal([...timers.values()][0].delay,15000);coordinator.reconcile([current]);assert.equal(timers.size,1);await fire();
  const saved=await read(adminDb(),'orders',id),display=await read(adminDb(),'publicOrderDisplays',id);assert.equal(attempts,2);assert.equal(saved.status,'ready');assert.equal(display.displayStatus,'ready');assert.deepEqual(mutations.map(item=>item.path).sort(),[`orders/${id}`,`publicOrderDisplays/${id}`].sort());assert.equal((await getDocs(collection(adminDb(),'seats'))).size,0);
 });
}
