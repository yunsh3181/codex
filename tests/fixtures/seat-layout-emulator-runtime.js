(()=>{
 const path=require('node:path'),moduleRoot='__WORKSPACE_NODE_MODULES__';
 const {initializeTestEnvironment}=require(path.join(moduleRoot,'@firebase/rules-unit-testing'));
 const firestore=require(path.join(moduleRoot,'firebase/firestore'));
 window.PJSeatLayout=require('__WORKSPACE_SEAT_LAYOUT__');
 const uid=new URL(location.href).searchParams.get('uid')||'admin-ui';
 let transactionSetCount=0;
 const ready=initializeTestEnvironment({projectId:'demo-admin-seat-layout'}).then(environment=>({environment,raw:environment.authenticatedContext(uid,{admin:true}).firestore()}));
 const wrapSnapshot=snapshot=>({exists:snapshot.exists(),data:()=>snapshot.data(),id:snapshot.id,docs:snapshot.docs?.map(wrapSnapshot),forEach(callback){snapshot.forEach(item=>callback(wrapSnapshot(item)))}});
 const makeRef=(segments,rawPromise)=>({segments,onSnapshot(success,error){let unsubscribe=()=>{};rawPromise.then(raw=>{unsubscribe=firestore.onSnapshot(firestore.doc(raw,...segments),snapshot=>success(wrapSnapshot(snapshot)),error)}).catch(error);return()=>unsubscribe()},set(data,options){return rawPromise.then(raw=>firestore.setDoc(firestore.doc(raw,...segments),data,options))}});
 const db={collection(name){return {doc(id){return makeRef([name,id],ready.then(value=>value.raw))},onSnapshot(success,error){let unsubscribe=()=>{};ready.then(({raw})=>{unsubscribe=firestore.onSnapshot(firestore.collection(raw,name),snapshot=>success(wrapSnapshot(snapshot)),error)}).catch(error);return()=>unsubscribe()}}},async runTransaction(callback){const {raw}=await ready;return firestore.runTransaction(raw,transaction=>callback({get(ref){return transaction.get(firestore.doc(raw,...ref.segments)).then(wrapSnapshot)},set(ref,data){transactionSetCount+=1;transaction.set(firestore.doc(raw,...ref.segments),data)}}))}};
 window.db=db;
 window.firebase={auth(){return {currentUser:{uid},onAuthStateChanged(callback){ready.then(()=>callback({uid,getIdTokenResult:async()=>({claims:{admin:true}})}));return()=>{}},signOut:async()=>{}}},firestore:{FieldValue:{serverTimestamp:firestore.serverTimestamp},Timestamp:{fromDate:firestore.Timestamp.fromDate}}};
 window.__seatLayoutEmulator={uid,get transactionSetCount(){return transactionSetCount},ready:ready.then(()=>true),async close(){const {environment}=await ready;await environment.cleanup()}};
})();
