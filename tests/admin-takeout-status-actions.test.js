const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const actionSource=admin.match(/function adminOrderActions\(order\)\{[\s\S]*?\n\}/)?.[0];
assert.ok(actionSource,'admin order action renderer exists');
const actionContext={esc:value=>String(value??'')};
vm.createContext(actionContext);
vm.runInContext(actionSource,actionContext);

const markup=(status,orderType='takeout',extra={})=>actionContext.adminOrderActions({id:'o1',status,orderType,customerNumber:'P1234',language:'en',...extra});
const statusNameSource=admin.match(/function adminStatusName\(order\)\{[^\n]+/)?.[0]||'';
assert.ok(statusNameSource&&!statusNameSource.includes('포장완료'),'accepted takeout orders are no longer labeled as already complete');
for(const status of ['payment_pending','new']){
 const html=markup(status);
 assert.match(html,/data-status="accepted">접수<\/button>/,`${status} offers one accept action`);
 assert.doesNotMatch(html,/data-status="completed"/,`${status} cannot complete directly`);
 assert.doesNotMatch(html,/data-action="call-customer"/,`${status} is not callable before acceptance`);
}
for(const orderType of ['takeout','dinein'])for(const status of ['paid','accepted','cooking']){
 const html=markup(status,orderType);
 assert.match(html,/data-status="completed">조리완료<\/button>/,`${orderType} ${status} offers cooking completion`);
 assert.match(html,/data-action="call-customer"/,`${orderType} ${status} remains callable`);
 assert.match(html,/data-order-language="en"/,`${orderType} ${status} preserves the order language on the call button`);
}
assert.doesNotMatch(markup('completed'),/data-action="set-status"/, 'completed orders have no further status action');
assert.match(markup('completed'),/data-action="call-customer"/, 'completed orders keep the existing repeatable call action');

const setStatusSource=admin.match(/async function setStatus\(id,status,button\)\{[\s\S]*?\n}\n\norderList\?\.addEventListener/)?.[0].replace(/\n\norderList\?\.addEventListener[\s\S]*/,'');
const statusBlock=`const statusUpdateLocks=new Set();\n${setStatusSource||''}`;
assert.ok(statusBlock,'status update implementation exists');
async function exerciseStatus(order,status,{holdCommit=false}={}){
 const writes=[],seatWrites=[];
 let commits=0,releaseCommit;
 const commitGate=holdCommit?new Promise(resolve=>{releaseCommit=resolve}):Promise.resolve();
 const batch={
  update(ref,data){writes.push({ref,data})},
  set(ref,data,options){seatWrites.push({ref,data,options})},
  async commit(){commits++;await commitGate}
 };
 const context={
  Set,orders:[order],db:{batch:()=>batch,collection:name=>({doc:id=>({name,id})})},
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>({server:true})}}},
  orderSeatIds:value=>value.seatIds||[],stopNewOrderRepeat(){},showAdminMessage(){},setTimeout(){},
  hasUnacceptedOrders:()=>false,startNewOrderRepeat(){},playPreset(){},enqueueSpeech(){},spokenOrderNumber:value=>String(value).replace(/^[PD]/,''),
  console
 };
 vm.createContext(context);
 vm.runInContext(statusBlock,context);
 const first=context.setStatus(order.id,status,null);
 const duplicate=holdCommit?context.setStatus(order.id,status,null):null;
 if(holdCommit)releaseCommit();
 const results=holdCommit?await Promise.all([first,duplicate]):[await first];
 return {writes,seatWrites,commits,results};
}

(async()=>{
 const acceptedTakeout=await exerciseStatus({id:'t1',status:'payment_pending',orderType:'takeout',seatIds:[]},'accepted',{holdCommit:true});
 assert.strictEqual(acceptedTakeout.commits,1,'double-clicked takeout acceptance commits once');
 assert.deepStrictEqual(acceptedTakeout.results,[true,false]);
 assert.strictEqual(acceptedTakeout.writes[0].data.status,'accepted','takeout acceptance never writes completed');
 assert.strictEqual(acceptedTakeout.seatWrites.length,0,'takeout acceptance does not touch seats');

 const completedTakeout=await exerciseStatus({id:'t2',status:'accepted',orderType:'takeout',seatIds:[]},'completed',{holdCommit:true});
 assert.strictEqual(completedTakeout.commits,1,'double-clicked takeout completion commits once');
 assert.strictEqual(completedTakeout.writes[0].data.status,'completed');
 assert.strictEqual(completedTakeout.seatWrites.length,0,'takeout completion does not touch seats');

 const acceptedDineIn=await exerciseStatus({id:'d1',status:'payment_pending',orderType:'dinein',seatIds:['s1']},'accepted');
 assert.strictEqual(acceptedDineIn.seatWrites.length,1,'dine-in acceptance marks its seat occupied');
 assert.strictEqual(acceptedDineIn.seatWrites[0].data.status,'occupied');
 const completedDineIn=await exerciseStatus({id:'d2',status:'accepted',orderType:'dinein',seatIds:['s2']},'completed');
 assert.strictEqual(completedDineIn.seatWrites.length,1,'dine-in completion releases its seat');
 assert.strictEqual(completedDineIn.seatWrites[0].data.status,'empty');

 assert.ok(admin.includes("event.preventDefault();\n event.stopPropagation();"),'delegated actions stop the original click before rerender');
 assert.ok(admin.includes("if(action==='call-customer'){\n  callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage);\n  return;"),'customer calls return without invoking setStatus');
 console.log('admin takeout acceptance, cooking completion, call isolation, seat protection, and duplicate locks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
