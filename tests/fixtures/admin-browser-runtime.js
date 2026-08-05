(function(){
 const businessDay=(()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));const date=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day,12));if(+parts.hour<9)date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)})();
 const methods=['카드','현금','제로페이','식권대장'];
 const seats=['outdoor-1','annex-2','room-1','papa-bar4'];
 let records=Array.from({length:32},(_,index)=>{
  const sequence=index+1,takeout=index%3===0,reservation=index%4===1||sequence===32,split=index%4===3;
  return {id:`fixture-${String(sequence).padStart(2,'0')}`,businessDay,createdAtClient:new Date(Date.now()-(32-sequence)*60000).toISOString(),status:index%5===0?'cooking':index%4===0?'accepted':'completed',orderType:takeout?'takeout':'dinein',customerNumber:String(1000+sequence),phone:`010-8888-${String(1000+sequence)}`,partySize:takeout?null:index%4+1,seat:takeout?null:{id:seats[index%4]},pickup:reservation?{mode:'reserve',time:'18:30'}:{mode:'now'},payment:{method:split?'meal_ticket':methods[index%4],methodName:split?'식권대장':methods[index%4],splitCount:split?2:undefined},normalAmount:35000+index*2100,discountAmount:index%3===0?3000:0,total:32000+index*2100,disposables:index%2===0,benefit:{labels:index%3===0?['UP&UP','4인 세트']:['포장 20%']},items:[{id:'P001',name:'존스 페이버릿',qty:index%2+1,price:25900,total:25900*(index%2+1),size:'L',crust:'치즈롤',toppings:{T001:1},sides:{S001:1},drinks:{D001:1}}],memo:reservation?'창가 자리 요청':''};
 });
 const listeners=new Map();
 const docs=list=>list.map(item=>({id:item.id,ref:{id:item.id},data:()=>({...item})}));
 const emitOrders=()=>listeners.get('orders')?.({docs:docs(records),docChanges:()=>records.map(item=>({type:'added',doc:{id:item.id,data:()=>({...item})}})),forEach(callback){docs(records).forEach(callback)}});
 const emptySnapshot={docs:[],docChanges:()=>[],forEach(){}};
 const seatRecords=[['papa-2','empty'],['papa-bar4','occupied'],['outdoor-1','held'],['outdoor-2','empty'],['outdoor-3','occupied'],['outdoor-4','empty'],['annex-1','occupied'],['annex-2','reserved'],['annex-3','held'],['annex-4','empty'],['room-1','empty'],['room-2','occupied'],['room-3','empty']];
 const seatSnapshot={docs:seatRecords.map(([id,status])=>({id,data:()=>({status,orderNo:status==='empty'?null:'1032'})})),docChanges:()=>[],forEach(callback){this.docs.forEach(callback)}};
 const collection=name=>({onSnapshot(success){listeners.set(name,success);queueMicrotask(()=>success(name==='orders'?{docs:docs(records),docChanges:()=>records.map(item=>({type:'added',doc:{id:item.id,data:()=>({...item})}})),forEach(callback){docs(records).forEach(callback)}}:name==='seats'?seatSnapshot:emptySnapshot));return()=>listeners.delete(name)},async get(){return emptySnapshot},doc(id){return {id,collection,onSnapshot(success){queueMicrotask(()=>success({exists:false,id,data:()=>({})}));return()=>{}},async get(){return {exists:false,data:()=>({})}},async set(){},async update(){},async delete(){}}}});
 const db={collection,batch(){return {update(){},set(){},delete(){},async commit(){}}},async runTransaction(callback){return callback({async get(){return {exists:false,data:()=>({})}},set(){},update(){}})}};
 const authObject={currentUser:null,onAuthStateChanged(callback){const user={getIdTokenResult:async()=>({claims:{admin:true}}),getIdToken:async()=> 'fixture-token'};this.currentUser=user;queueMicrotask(()=>callback(user));return()=>{}},signInWithEmailAndPassword:async()=>({user:this.currentUser}),signOut:async()=>{}};
 function auth(){return authObject}auth.onAuthStateChanged=authObject.onAuthStateChanged.bind(authObject);
 window.firebase={initializeApp(){},firestore:()=>db,auth};
 window.firebase.firestore.FieldValue={serverTimestamp:()=>new Date(),delete:()=>null};
 window.firebase.firestore.Timestamp={now:()=>new Date()};
 window.PJAdminVisualFixture={emit:emitOrders,remove(id){records=records.filter(order=>order.id!==id);emitOrders()},get records(){return records.map(order=>({...order}))}};
 window.__PJ_FIXTURE_DB__=db;
 window.__PJ_FIXTURE_AUTH__=authObject;
 Object.defineProperty(window,'db',{value:db,writable:false});
})();
