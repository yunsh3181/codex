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
for(const [customerNumber,language] of [['P1234','en'],['D5678','es'],['P9012','ko'],['P3456',undefined]]){
 const html=markup('accepted',customerNumber.startsWith('P')?'takeout':'dinein',{customerNumber,language});
 assert.match(html,new RegExp(`data-order-no="${customerNumber}"`),`${customerNumber} keeps its customer number on the call button`);
 assert.match(html,new RegExp(`data-order-language="${language||''}"`),`${customerNumber} keeps its order language on the call button`);
}
assert.doesNotMatch(markup('completed'),/data-action="set-status"/, 'completed orders have no further status action');
assert.match(markup('completed'),/data-action="call-customer"/, 'completed orders keep the existing repeatable call action');

const setStatusSource=admin.match(/async function setStatus\(id,status,button\)\{[\s\S]*?\n}\n\ndocument\.getElementById\('ordersPanel'\)/)?.[0].replace(/\n\ndocument\.getElementById\('ordersPanel'\)[\s\S]*/,'');
const seatReleaseSource=admin.match(/function seatReleasePayload\(\)\{[\s\S]*?\n\}/)?.[0];
const statusBlock=`${seatReleaseSource||''}\nconst statusUpdateLocks=new Set();\n${setStatusSource||''}`;
assert.ok(statusBlock,'status update implementation exists');
async function exerciseStatus(order,status,{holdCommit=false,rejectCommit=false}={}){
 const writes=[],seatWrites=[],displayWrites=[],displayDeletes=[],customerCalls=[],loggedErrors=[];
 let commits=0,releaseCommit,commitSucceeded=false;
 const commitGate=holdCommit?new Promise(resolve=>{releaseCommit=resolve}):Promise.resolve();
 const batch={
  update(ref,data){writes.push({ref,data})},
  set(ref,data,options){(ref.name==='publicOrderDisplays'?displayWrites:seatWrites).push({ref,data,options})},
  delete(ref){displayDeletes.push(ref)},
  async commit(){commits++;await commitGate;if(rejectCommit)throw Object.assign(new Error('commit failed'),{code:'unavailable'});commitSucceeded=true}
 };
 const context={
  Set,orders:[order],db:{batch:()=>batch,collection:name=>({doc:id=>({name,id})})},
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>({server:true})}}},
  orderSeatIds:value=>value.seatIds||[],adminOrderNumberLabel:value=>value.customerNumber||value.orderNo||'#1',stopNewOrderRepeat(){},showAdminMessage(){},setTimeout(){},
  hasUnacceptedOrders:()=>false,startNewOrderRepeat(){},
  callCustomer(orderNo,language){customerCalls.push({orderNo,language,commitSucceeded})},
  console:{error(...args){loggedErrors.push(args)}}
 };
 vm.createContext(context);
 vm.runInContext(statusBlock,context);
 const first=context.setStatus(order.id,status,null);
 const duplicate=holdCommit?context.setStatus(order.id,status,null):null;
 if(holdCommit)releaseCommit();
 const results=holdCommit?await Promise.all([first,duplicate]):[await first];
 return {writes,seatWrites,displayWrites,displayDeletes,customerCalls,loggedErrors,commits,results};
}

(async()=>{
 const acceptedTakeout=await exerciseStatus({id:'t1',status:'payment_pending',orderType:'takeout',seatIds:[]},'accepted',{holdCommit:true});
 assert.strictEqual(acceptedTakeout.commits,1,'double-clicked takeout acceptance commits once');
 assert.deepStrictEqual(acceptedTakeout.results,[true,false]);
 assert.strictEqual(acceptedTakeout.writes[0].data.status,'accepted','takeout acceptance never writes completed');
 assert.strictEqual(acceptedTakeout.seatWrites.length,0,'takeout acceptance does not touch seats');

 const readyTakeout=await exerciseStatus({id:'t2',status:'cooking',orderType:'takeout',seatIds:[],customerNumber:'P1234',language:'en'},'ready',{holdCommit:true});
 assert.strictEqual(readyTakeout.commits,1,'double-clicked takeout ready transition commits once');
 assert.strictEqual(readyTakeout.writes[0].data.status,'ready');
 assert.strictEqual(readyTakeout.seatWrites.length,0,'takeout ready transition does not touch seats');
 assert.deepStrictEqual(readyTakeout.customerCalls,[{orderNo:'P1234',language:'en',commitSucceeded:true}],'ready transition calls once, after commit, in the order language');

 const acceptedDineIn=await exerciseStatus({id:'d1',status:'payment_pending',orderType:'dinein',seatIds:['s1']},'accepted');
 assert.strictEqual(acceptedDineIn.seatWrites.length,1,'dine-in acceptance marks its seat occupied');
 assert.strictEqual(acceptedDineIn.seatWrites[0].data.status,'occupied');
 const completedDineIn=await exerciseStatus({id:'d2',status:'accepted',orderType:'dinein',seatIds:['s2'],customerNumber:'D5678',language:'es'},'completed');
 assert.strictEqual(completedDineIn.seatWrites.length,1,'dine-in completion releases its seat');
 assert.strictEqual(completedDineIn.seatWrites[0].data.status,'empty');
 assert.deepStrictEqual(completedDineIn.customerCalls,[{orderNo:'D5678',language:'es',commitSucceeded:true}],'dine-in completion calls after releasing its seat in the same commit');

 const failedCompletion=await exerciseStatus({id:'f1',status:'cooking',orderType:'takeout',seatIds:[],customerNumber:'P9012',language:'ja'},'ready',{rejectCommit:true});
 assert.deepStrictEqual(failedCompletion.results,[false],'failed completion reports failure');
 assert.strictEqual(failedCompletion.customerCalls.length,0,'failed completion does not play or queue a customer call');
 assert.strictEqual(failedCompletion.loggedErrors.length,1,'failed completion preserves the existing error report');

 assert.ok(admin.includes("event.preventDefault();\n event.stopPropagation();"),'delegated actions stop the original click before rerender');
 assert.ok(admin.includes("if(action==='call-customer'){\n  callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage);\n  return;"),'customer calls return without invoking setStatus');
 console.log('admin takeout acceptance, cooking completion, call isolation, seat protection, and duplicate locks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
