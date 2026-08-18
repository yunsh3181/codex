(()=>{
 const path=require('node:path'),moduleRoot='__WORKSPACE_NODE_MODULES__';
 const {initializeTestEnvironment}=require(path.join(moduleRoot,'@firebase/rules-unit-testing'));
 const firestore=require(path.join(moduleRoot,'firebase/firestore'));
 const projectId='demo-admin-takeout-completion',uid=new URL(location.href).searchParams.get('uid')||'admin-ui';
 let attempts=0,commits=0,writtenPaths=[];
 const ready=initializeTestEnvironment({projectId}).then(environment=>({environment,raw:environment.authenticatedContext(uid,{admin:true}).firestore()}));
 const db=window.__PJ_FIXTURE_DB__,original=db.runTransaction.bind(db);
 window.firebase.firestore.FieldValue.serverTimestamp=firestore.serverTimestamp;
 window.firebase.firestore.Timestamp.fromMillis=firestore.Timestamp.fromMillis;
 db.runTransaction=async callback=>{
  attempts+=1;const {raw}=await ready,pending=[];
  const result=await firestore.runTransaction(raw,async transaction=>callback({
   async get(ref){const snapshot=await transaction.get(firestore.doc(raw,ref.name,ref.id));return {exists:snapshot.exists(),data:()=>snapshot.data()}},
   set(ref,data,options){pending.push([ref.name,ref.id]);transaction.set(firestore.doc(raw,ref.name,ref.id),data,options)},
   update(ref,data){pending.push([ref.name,ref.id]);transaction.update(firestore.doc(raw,ref.name,ref.id),data)},
   delete(ref){pending.push([ref.name,ref.id]);transaction.delete(firestore.doc(raw,ref.name,ref.id))}
  }));
  commits+=1;writtenPaths=pending.map(([name,id])=>`${name}/${id}`);
  for(const [name,id] of pending){if(name!=='orders')continue;const snapshot=await firestore.getDoc(firestore.doc(raw,name,id));if(snapshot.exists()){window.PJAdminVisualFixture.remove(id);window.PJAdminVisualFixture.add({id,...snapshot.data()})}}
  return result;
 };
 window.__takeoutEmulator={ready:ready.then(()=>true),get attempts(){return attempts},get commits(){return commits},get writtenPaths(){return [...writtenPaths]},original,async read(name,id){const {raw}=await ready,snapshot=await firestore.getDoc(firestore.doc(raw,name,id));return snapshot.exists()?snapshot.data():null},async close(){const {environment}=await ready;await environment.cleanup()}};
})();
