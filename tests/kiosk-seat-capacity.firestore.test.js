'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {collection,doc,getDoc,getDocs,runTransaction,serverTimestamp,setDoc,Timestamp}=require('firebase/firestore');
const {commitSeatOrder}=require('../kiosk-seat-transaction');
const waitlistPhoneKeypad=require('../waitlist-phone-keypad');
const root=path.resolve(__dirname,'..'),PROJECT_ID='demo-kiosk-zone-capacity';
if(!process.env.FIRESTORE_EMULATOR_HOST)test('kiosk seat capacity transaction matrix',{skip:true},()=>{});else{
 let env,clientDb,adminDb,sequence=0;
 test.before(async()=>{env=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}});clientDb=env.unauthenticatedContext().firestore();adminDb=env.authenticatedContext('matrix-admin',{admin:true}).firestore()});
 test.beforeEach(async()=>{await env.clearFirestore();sequence=0});test.after(async()=>env.cleanup());
 const db=()=>clientDb;
 const tableDefs={annex:[['annex-1',2],['annex-2',4],['annex-3',4],['annex-4',2]],outdoor:[['outdoor-1',4],['outdoor-2',4],['outdoor-3',4],['outdoor-4',4]]};
 const definitions=zone=>tableDefs[zone].map(([id,seats])=>({id,seats}));
 const held=(partySize=1,heldBy='client-a',extra={})=>({status:'held',heldBy,heldAt:Timestamp.now(),heldUntil:Timestamp.fromMillis(Date.now()+600000),partySize,orderId:null,...extra});
 const occupied=partySize=>({status:'occupied',heldBy:null,heldUntil:null,partySize,orderId:`old-${partySize}`});
 async function seed(zone,values){await Promise.all(definitions(zone).map(table=>setDoc(doc(adminDb,'seats',table.id),values[table.id]||{status:'empty',partySize:null,heldBy:null,heldUntil:null,orderId:null})))}
 const payload=()=>({channel:'mobile',deviceId:'mobile-01',appVersion:'DEV',schemaVersion:2,aggregationVersion:1,storeId:'pangyo2-techno-valley',storeName:'판교2테크노밸리점',orderNo:`D${String(++sequence).padStart(4,'0')}`,customerNumber:'D0001',phone:'01012345678',phoneMasked:'010-****-5678',phoneLast4:'5678',language:'ko',orderType:'dinein',partySize:1,seat:{zone:'annex',tables:['annex-1']},pickup:null,disposables:false,items:[{id:'P001',qty:1,total:10000}],itemCount:1,normalAmount:10000,discountAmount:0,totalAmount:10000,total:10000,benefit:'normal',payment:{method:'card'},status:'payment_pending',recommendationEvents:[],createdAt:serverTimestamp(),createdAtClient:new Date().toISOString(),source:'test'});
 function compat(raw,mutations){return {collection(name){return {doc(id){return doc(raw,name,id)}}},runTransaction(callback){return runTransaction(raw,transaction=>callback({get:ref=>transaction.get(ref).then(snapshot=>({exists:snapshot.exists(),data:()=>snapshot.data()})),set(ref,data,options){mutations.push(ref.path);transaction.set(ref,data,options)}}))}}}
 async function commit(zone,partySize,selected,client='client-a'){
  const raw=db(),mutations=[],value=payload();Object.assign(value,{partySize,seat:{zone,tables:selected}});const orderRef=doc(raw,'orders',`order-${sequence}-${Math.random().toString(36).slice(2)}`);
  try{const result=await commitSeatOrder({db:compat(raw,mutations),zone,selectedTableIds:selected,partySize,seatClientId:client,tableDefinitions:definitions(zone),orderRef,payload:value,serverTimestamp});return {ok:true,result,mutations,orderRef,raw}}catch(error){return {ok:false,error,mutations,orderRef,raw}}
 }
 const count=async(_raw,name)=>(await getDocs(collection(adminDb,name))).size;
 test('A-C bottle hard cap matrix is atomic',async()=>{
  await seed('annex',{'annex-1':held(2),'annex-2':occupied(5),'annex-3':occupied(5)});let result=await commit('annex',2,['annex-1']);assert.equal(result.ok,true);assert.equal(await count(result.raw,'orders'),1);assert.deepEqual(result.mutations.sort(),[result.orderRef.path,'seats/annex-1'].sort());
  for(const party of [3,4]){await env.clearFirestore();await seed('annex',{'annex-1':held(party),'annex-2':occupied(5),'annex-3':occupied(5)});result=await commit('annex',party,['annex-1']);assert.equal(result.ok,false);assert.equal(result.error.code,'ZONE_CAPACITY_STALE');assert.equal(result.mutations.length,0);assert.equal(await count(result.raw,'orders'),0)}
 });
 test('D-F outdoor boundary and impossible combinations reject partial writes',async()=>{
  await seed('outdoor',{'outdoor-1':occupied(5),'outdoor-2':occupied(5),'outdoor-3':occupied(5),'outdoor-4':held(1)});let result=await commit('outdoor',1,['outdoor-4']);assert.equal(result.ok,true);assert.equal((await getDoc(doc(result.raw,'seats','outdoor-4'))).data().partySize,1);assert.equal(16,15+1);
  await env.clearFirestore();await seed('outdoor',{'outdoor-1':occupied(5),'outdoor-2':occupied(5),'outdoor-3':occupied(5),'outdoor-4':held(2)});result=await commit('outdoor',2,['outdoor-4']);assert.equal(result.ok,false);assert.equal(result.mutations.length,0);
  await env.clearFirestore();await seed('annex',{'annex-1':held(4)});result=await commit('annex',4,['annex-1']);assert.equal(result.ok,false);assert.equal(result.error.code,'ZONE_CAPACITY_STALE');assert.equal(result.mutations.length,0)
 });
 test('G-H stale held occupied reserved and unknown snapshots write nothing',async()=>{
  for(const [status,value] of [['held',held(2,'other-client')],['occupied',occupied(2)],['reserved',{status:'reserved',partySize:2}],['unknown',{status:'broken',partySize:2}]]){await env.clearFirestore();await seed('annex',{'annex-1':value});const result=await commit('annex',2,['annex-1']);assert.equal(result.ok,false,status);assert.equal(result.error.code,status==='reserved'?'SEAT_RESERVED':'SEAT_STALE',status);assert.equal(result.mutations.length,0,status);assert.equal(await count(result.raw,'orders'),0,status)}
 });
 test('I concurrent orders produce one winner without partial allocation',async()=>{
  await seed('annex',{'annex-1':held(2)});const [a,b]=await Promise.all([commit('annex',2,['annex-1']),commit('annex',2,['annex-1'])]);assert.equal([a,b].filter(x=>x.ok).length,1);assert.equal([a,b].filter(x=>!x.ok).length,1);const raw=a.raw;assert.equal(await count(raw,'orders'),1);const seat=(await getDoc(doc(raw,'seats','annex-1'))).data();assert.ok(seat.orderId);assert.equal(seat.heldBy,null)
 });
 test('J linked heldBy/orderId is preserved and cannot be stolen',async()=>{
  const linked=held(2,'client-a',{orderId:'existing-order'});await seed('annex',{'annex-1':linked});const before=JSON.stringify((await getDoc(doc(db(),'seats','annex-1'))).data());const result=await commit('annex',2,['annex-1']);assert.equal(result.ok,false);assert.equal(result.mutations.length,0);assert.equal(JSON.stringify((await getDoc(doc(result.raw,'seats','annex-1'))).data()),before)
 });
 test('K waitlist keeps the existing schema and performs one guarded waitlist write only',async()=>{
  const raw=db();let locked=false,calls=0;async function register(phone){if(locked)return;const value=waitlistPhoneKeypad.payload({seatId:'annex-1',seatName:'1번 테이블',partySize:2,phone,createdAt:serverTimestamp(),createdAtClient:new Date().toISOString()});if(!value)return;locked=true;try{calls++;await setDoc(doc(collection(raw,'waitlist')),value)}finally{locked=false}}
  await register('0101234');assert.equal(calls,0);assert.equal(await count(raw,'waitlist'),0);
  await Promise.all([register('01012345678'),register('01012345678')]);assert.equal(calls,1);assert.equal(await count(raw,'waitlist'),1);assert.equal(await count(raw,'orders'),0);assert.equal(await count(raw,'seats'),0)
 });
}
