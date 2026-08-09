const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {deleteDoc,doc,getDoc,runTransaction,serverTimestamp,setDoc}=require('firebase/firestore');
const {copyDefault}=require('../seat-layout');

const PROJECT_ID='demo-admin-seat-layout';
if(!process.env.FIRESTORE_EMULATOR_HOST){test('admin seat layout rules (run with npm run test:rules)',{skip:true},()=>{})}else{
 let environment;
 test.before(async()=>{environment=await initializeTestEnvironment({projectId:PROJECT_ID,firestore:{rules:fs.readFileSync(path.join(__dirname,'..','firestore.rules'),'utf8')}})});
 test.beforeEach(async()=>environment.clearFirestore());
 test.after(async()=>environment.cleanup());
 const admin=uid=>environment.authenticatedContext(uid,{admin:true}).firestore();
 const user=()=>environment.authenticatedContext('user',{}).firestore();
 const guest=()=>environment.unauthenticatedContext().firestore();
 const ref=db=>doc(db,'adminSettings','seatLayout');
 const payload=(uid,positions=copyDefault(),revision=1,extra={})=>({positions,revision,updatedAt:serverTimestamp(),updatedBy:uid,...extra});

 test('admin-only layout reads and strict valid creation',async()=>{
  await assertFails(getDoc(ref(guest())));await assertFails(getDoc(ref(user())));
  await assertFails(setDoc(ref(user()),payload('user')));
  await assertSucceeds(setDoc(ref(admin('admin-a')),payload('admin-a')));
  assert.equal((await assertSucceeds(getDoc(ref(admin('admin-b'))))).data().revision,1);
  await assertFails(deleteDoc(ref(admin('admin-a'))));
 });

 test('invalid IDs, fields, slots, duplicates, and revisions are rejected without partial writes',async()=>{
  const db=admin('admin-a'),base=copyDefault();
  const missing={...base};delete missing['room-3'];
  const duplicate={...base,'room-3':13};
  const outOfRange={...base,'room-3':18};
  for(const data of [payload('admin-a',missing),payload('admin-a',{...base,'unknown-seat':17}),payload('admin-a',duplicate),payload('admin-a',outOfRange),payload('admin-a',base,2),payload('admin-a',base,1,{extra:true})])await assertFails(setDoc(ref(db),data));
  assert.equal((await getDoc(ref(db))).exists(),false);
 });

 test('concurrent administrator saves allow one revision winner and reject one stale transaction',async()=>{
  const seed=admin('seed');await setDoc(ref(seed),payload('seed'));
  const nextA={...copyDefault(),'papa-2':10,'annex-4':0};
  const nextB={...copyDefault(),'papa-bar4':11,'room-3':1};
  const save=(uid,positions)=>{const db=admin(uid),target=ref(db);return runTransaction(db,async transaction=>{const snapshot=await transaction.get(target);if(snapshot.data().revision!==1)throw new Error('STALE');transaction.set(target,payload(uid,positions,2))})};
  const results=await Promise.allSettled([save('admin-a',nextA),save('admin-b',nextB)]);
  assert.equal(results.filter(result=>result.status==='fulfilled').length,1);assert.equal(results.filter(result=>result.status==='rejected').length,1);
  const final=(await getDoc(ref(admin('reader')))).data();assert.equal(final.revision,2);assert.ok(['admin-a','admin-b'].includes(final.updatedBy));
 });
}
