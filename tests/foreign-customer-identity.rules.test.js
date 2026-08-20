'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,setDoc,updateDoc,serverTimestamp,runTransaction}=require('firebase/firestore');
const root=path.resolve(__dirname,'..'),PROJECT_ID='demo-foreign-customer-identity';
if(!process.env.FIRESTORE_EMULATOR_HOST)test('foreign customer identity rules',{skip:true},()=>{});else{
 let environment,customer,admin;
 test.before(async()=>{environment=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}});customer=environment.unauthenticatedContext().firestore();admin=environment.authenticatedContext('identity-admin',{admin:true}).firestore()});
 test.beforeEach(async()=>environment.clearFirestore());test.after(async()=>environment.cleanup());
 const base=()=>({channel:'mobile',deviceId:'mobile-01',appVersion:'DEV',schemaVersion:2,aggregationVersion:1,storeId:'pangyo2-techno-valley',storeName:'판교2테크노밸리점',orderNo:'P0000',customerNumber:'P0000',language:'en',customerIdentityType:'name',customerDisplayName:'Alex',orderType:'takeout',partySize:null,seat:null,pickup:{mode:'now'},disposables:false,items:[{id:'P001',qty:1,total:10000}],itemCount:1,normalAmount:10000,discountAmount:0,totalAmount:10000,total:10000,benefit:'normal',payment:{method:'card'},status:'payment_pending',recommendationEvents:[],createdAt:serverTimestamp(),createdAtClient:new Date().toISOString(),source:'mobile-kiosk'});
 const businessDay=new Date().toISOString().slice(0,10),businessDate=new Date(`${businessDay}T00:00:00.000Z`),counterId=`pangyo2-techno-valley_${businessDay}_P`;
 const createForeign=async(id,name='Alex')=>{let last;for(let attempt=0;attempt<3;attempt++)try{return await runTransaction(customer,async tx=>{const counter=doc(customer,'orderNumberCounters',counterId),snapshot=await tx.get(counter),sequence=(snapshot.exists()?snapshot.data().currentSequence:0)+1,orderNo=`P${String(sequence).padStart(4,'0')}`,payload={...base(),customerDisplayName:name,orderNo,customerNumber:orderNo,businessDay,dailySequence:sequence};tx.set(counter,{storeId:'pangyo2-techno-valley',businessDate,orderPrefix:'P',currentSequence:sequence,updatedAt:serverTimestamp()});tx.set(doc(customer,'orderNumberAllocations',`${counterId}_${sequence}`),{storeId:'pangyo2-techno-valley',businessDate,orderPrefix:'P',sequence,orderNo,orderDocumentId:id,createdAt:serverTimestamp()});tx.set(doc(customer,'orders',id),payload);return orderNo})}catch(error){last=error;if(error.code!=='permission-denied')throw error}throw last};
 test('foreign name order is accepted without phone fields',async()=>{assert.equal(await assertSucceeds(createForeign('foreign-valid')),'P0001');const saved=(await getDoc(doc(admin,'orders','foreign-valid'))).data();assert.equal(saved.customerDisplayName,'Alex');assert.equal(saved.phone,undefined)});
 test('concurrent foreign orders receive distinct numeric order numbers',async()=>{const values=await Promise.all([createForeign('foreign-a','Alex'),createForeign('foreign-b','Sam')]);assert.equal(new Set(values).size,2);assert.ok(values.every(value=>/^P\d{4}$/.test(value)&&value!=='P'))});
 test('six sequential foreign orders never produce a bare or duplicate prefix',async()=>{const values=[];for(let index=0;index<6;index++)values.push(await createForeign(`foreign-six-${index}`,`Alex ${index}`));assert.equal(new Set(values).size,6);assert.ok(values.every(value=>/^P\d{4}$/.test(value)&&value!=='P'))});
 test('foreign empty, mismatched language, phone fields, and unknown identity are denied',async()=>{for(const override of [{customerDisplayName:''},{language:'ko'},{phone:'01012345678'},{customerIdentityType:'nickname'}])await assertFails(setDoc(doc(customer,'orders',`invalid-${Math.random()}`),{...base(),...override}))});
 test('Korean phone_last4 remains compatible and rejects a name',async()=>{const korean={...base(),language:'ko',customerIdentityType:'phone_last4',phone:'01012345678',phoneMasked:'010-****-5678',phoneLast4:'5678'};delete korean.customerDisplayName;await assertSucceeds(setDoc(doc(customer,'orders','korean-valid'),korean));await assertFails(setDoc(doc(customer,'orders','korean-name'),{...korean,customerDisplayName:'홍길동'}))});
 test('public display identity must match its source order',async()=>{const orderNo=await createForeign('foreign-display');const display={orderNumber:orderNo,customerIdentityType:'name',customerDisplayName:'Alex',language:'en',displayStatus:'cooking',storeId:'pangyo2-techno-valley',businessDay,updatedAt:serverTimestamp()};await assertSucceeds(setDoc(doc(admin,'publicOrderDisplays','foreign-display'),display));await assertFails(setDoc(doc(admin,'publicOrderDisplays','foreign-display'),{...display,customerDisplayName:'Other'}))});
 test('counter exposure and partial allocation writes are denied',async()=>{
  await createForeign('security-order');
  await assertFails(getDocs(collection(customer,'orderNumberCounters')));
  await assertFails(getDoc(doc(customer,'orderNumberCounters',`other-store_${businessDay}_P`)));
  await assertFails(getDoc(doc(customer,'orderNumberCounters',`pangyo2-techno-valley_${businessDay}_X`)));
  await environment.withSecurityRulesDisabled(async context=>setDoc(doc(context.firestore(),'orderNumberCounters','pangyo2-techno-valley_2000-01-01_P'),{storeId:'pangyo2-techno-valley',businessDate:new Date('2000-01-01T00:00:00Z'),orderPrefix:'P',currentSequence:1,updatedAt:new Date()}));
  await assertFails(getDoc(doc(customer,'orderNumberCounters','pangyo2-techno-valley_2000-01-01_P')));
  await assertFails(updateDoc(doc(customer,'orderNumberCounters',counterId),{currentSequence:3,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(customer,'orderNumberAllocations',`${counterId}_99`),{storeId:'pangyo2-techno-valley',businessDate,orderPrefix:'P',sequence:99,orderNo:'P0099',orderDocumentId:'missing',createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(customer,'orders','missing-allocation'),{...base(),orderNo:'P0099',customerNumber:'P0099',businessDay,dailySequence:99}));
  await assertFails(getDoc(doc(customer,'orderNumberAllocations',`${counterId}_1`)));
  await assertSucceeds(getDoc(doc(admin,'orderNumberAllocations',`${counterId}_1`)));
  assert.equal((await getDoc(doc(admin,'orderNumberCounters',counterId))).data().currentSequence,1);
 });
}
