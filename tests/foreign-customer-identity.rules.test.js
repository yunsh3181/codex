'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc,serverTimestamp}=require('firebase/firestore');
const root=path.resolve(__dirname,'..'),PROJECT_ID='demo-foreign-customer-identity';
if(!process.env.FIRESTORE_EMULATOR_HOST)test('foreign customer identity rules',{skip:true},()=>{});else{
 let environment,customer,admin;
 test.before(async()=>{environment=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.join(root,'firestore.rules'),'utf8')}});customer=environment.unauthenticatedContext().firestore();admin=environment.authenticatedContext('identity-admin',{admin:true}).firestore()});
 test.beforeEach(async()=>environment.clearFirestore());test.after(async()=>environment.cleanup());
 const base=()=>({channel:'mobile',deviceId:'mobile-01',appVersion:'DEV',schemaVersion:2,aggregationVersion:1,storeId:'pangyo2-techno-valley',storeName:'판교2테크노밸리점',orderNo:'P0001',customerNumber:'P0001',language:'en',customerIdentityType:'name',customerDisplayName:'Alex',orderType:'takeout',partySize:null,seat:null,pickup:{mode:'now'},disposables:false,items:[{id:'P001',qty:1,total:10000}],itemCount:1,normalAmount:10000,discountAmount:0,totalAmount:10000,total:10000,benefit:'normal',payment:{method:'card'},status:'payment_pending',recommendationEvents:[],createdAt:serverTimestamp(),createdAtClient:new Date().toISOString(),source:'mobile-kiosk'});
 test('foreign name order is accepted without phone fields',async()=>{await assertSucceeds(setDoc(doc(customer,'orders','foreign-valid'),base()));const saved=(await getDoc(doc(admin,'orders','foreign-valid'))).data();assert.equal(saved.customerDisplayName,'Alex');assert.equal(saved.phone,undefined)});
 test('foreign empty, mismatched language, phone fields, and unknown identity are denied',async()=>{for(const override of [{customerDisplayName:''},{language:'ko'},{phone:'01012345678'},{customerIdentityType:'nickname'}])await assertFails(setDoc(doc(customer,'orders',`invalid-${Math.random()}`),{...base(),...override}))});
 test('Korean phone_last4 remains compatible and rejects a name',async()=>{const korean={...base(),language:'ko',customerIdentityType:'phone_last4',phone:'01012345678',phoneMasked:'010-****-5678',phoneLast4:'5678'};delete korean.customerDisplayName;await assertSucceeds(setDoc(doc(customer,'orders','korean-valid'),korean));await assertFails(setDoc(doc(customer,'orders','korean-name'),{...korean,customerDisplayName:'홍길동'}))});
 test('public display identity must match its source order',async()=>{await assertSucceeds(setDoc(doc(customer,'orders','foreign-display'),base()));const display={orderNumber:'P0001',customerIdentityType:'name',customerDisplayName:'Alex',language:'en',displayStatus:'cooking',storeId:'pangyo2-techno-valley',businessDay:'2026-08-19',updatedAt:serverTimestamp()};await assertSucceeds(setDoc(doc(admin,'publicOrderDisplays','foreign-display'),display));await assertFails(setDoc(doc(admin,'publicOrderDisplays','foreign-display'),{...display,customerDisplayName:'Other'}))});
}
