(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PJAdminOperations=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const FORCE_COMPLETE_STATUSES=new Set(['payment_pending','new','accepted','paid','cooking','ready']);
 const OCCUPIED_EXPIRY_MS=3*60*60*1000;
 const ADMIN_SEAT_STATUSES=Object.freeze({empty:{label:'빈자리',actions:['occupy','reserve']},occupied:{label:'사용중',actions:['empty']},reserved:{label:'예약',actions:['occupy','empty']},held:{label:'주문중',actions:[]},unknown:{label:'확인 필요',actions:[]}});
 const ADMIN_SEAT_ACTIONS=Object.freeze({
  occupy:{label:'사용',target:'occupied',className:'occupy'},reserve:{label:'예약',target:'reserved',className:'reserve'},empty:{label:'빈자리',target:'empty',className:'empty'}
 });
 const ADMIN_SEAT_CONFIRMATIONS=Object.freeze({
  'empty:occupied':'이 좌석을 사용중으로 변경할까요?','empty:reserved':'이 좌석을 예약으로 변경할까요?','reserved:occupied':'예약 좌석의 이용을 시작하고 사용중으로 변경할까요?','occupied:empty':'사용중인 좌석을 빈자리로 변경할까요?','reserved:empty':'예약을 취소하고 빈자리로 변경할까요?'
 });

 function operationError(code,message){return Object.assign(new Error(message),{code})}
 function normalizeAdminSeatStatus(status){return status==null||status==='empty'?'empty':Object.prototype.hasOwnProperty.call(ADMIN_SEAT_STATUSES,status)&&status!=='unknown'?status:'unknown'}
 function getAdminSeatActions(status){const normalized=normalizeAdminSeatStatus(status);return ADMIN_SEAT_STATUSES[normalized].actions.map(key=>Object.freeze({key,...ADMIN_SEAT_ACTIONS[key],expected:normalized,confirmation:ADMIN_SEAT_CONFIRMATIONS[`${normalized}:${ADMIN_SEAT_ACTIONS[key].target}`]}))}
 function adminSeatTransitionPayload(target,serverTimestamp){
  const timestamp=serverTimestamp(),clearLease={heldBy:null,heldAt:null,heldUntil:null,partySize:null};
  if(target==='occupied')return {status:'occupied',occupiedAt:timestamp,reservedAt:null,reservedBy:null,...clearLease,updatedAt:timestamp};
  if(target==='reserved')return {status:'reserved',reservedAt:timestamp,reservedBy:'admin',occupiedAt:null,...clearLease,updatedAt:timestamp};
  return {status:'empty',orderId:null,orderNo:null,partySize:null,groupId:null,occupiedAt:null,heldBy:null,heldAt:null,heldUntil:null,cleaningAt:null,reservedAt:null,reservedBy:null,reservationName:null,reservationPartySize:null,reservationAt:null,reservationPhone:null,updatedAt:timestamp};
 }
 async function transitionAdminSeatState({db,seatId,expectedStatus,targetStatus,serverTimestamp,supportedSeatIds,validateTransition}){
  const expected=normalizeAdminSeatStatus(expectedStatus),target=normalizeAdminSeatStatus(targetStatus),allowed=getAdminSeatActions(expected).some(action=>action.target===target);
  if(!seatId||supportedSeatIds&&!supportedSeatIds.includes(seatId))throw operationError('seat/unsupported-id','지원하지 않는 좌석입니다.');
  if(!allowed||['held','unknown'].includes(expected))throw operationError('seat/invalid-transition','허용되지 않는 좌석 상태 변경입니다.');
  return db.runTransaction(async transaction=>{
   const ref=db.collection('seats').doc(seatId),snapshot=await transaction.get(ref);
   if(!snapshot.exists)throw operationError('seat/not-found','좌석 문서가 없습니다.');
   const current=snapshot.data(),serverStatus=normalizeAdminSeatStatus(current.status);
   if(serverStatus!==expected)throw operationError('seat/stale-state','다른 관리자가 좌석 상태를 변경했습니다. 최신 상태를 확인해 주세요.');
   if(current.orderId)throw operationError('seat/order-linked','주문과 연결된 좌석은 일반 상태 버튼으로 변경할 수 없습니다.');
   if(validateTransition&&!validateTransition({seatId,currentStatus:serverStatus,targetStatus:target,current}))throw operationError('seat/policy-blocked','현재 운영 정책에서는 좌석 상태를 변경할 수 없습니다.');
   transaction.set(ref,adminSeatTransitionPayload(target,serverTimestamp),{merge:true});
   return {seatId,from:expected,to:target,seatWrites:1,orderWrites:0,publicOrderDisplayWrites:0,paymentCalls:0};
  });
 }
 function timestampMillis(value){
  if(value==null)return null;
  if(typeof value.toMillis==='function'){const millis=value.toMillis();return Number.isFinite(millis)?millis:null}
  if(typeof value.toDate==='function'){const millis=value.toDate().getTime();return Number.isFinite(millis)?millis:null}
  if(Number.isFinite(value.seconds)){const millis=value.seconds*1000+(Number(value.nanoseconds)||0)/1e6;return Number.isFinite(millis)?millis:null}
  const millis=value instanceof Date?value.getTime():typeof value==='number'?value:NaN;
  return Number.isFinite(millis)?millis:null;
 }
 function validPreparationMinutes(value){return Number.isInteger(value)&&value>=5&&value<=60&&value%5===0}
 function sameTimestamp(left,right){const a=timestampMillis(left),b=timestampMillis(right);return a!==null&&b!==null&&a===b}
 const AUTO_READY_RETRY_MS=15000;
 const TRANSIENT_FIRESTORE_CODES=new Set(['unavailable','aborted','deadline-exceeded','resource-exhausted','internal','unknown']);
 const TERMINAL_AUTO_READY_CODES=new Set(['order/stale-state','order/stale-timer','order/not-found']);
 function firestoreErrorCode(error){return String(error?.code||'').replace(/^firestore\//,'')}
 function autoReadyIdentity(order){const due=timestampMillis(order?.readyDueAt),started=timestampMillis(order?.preparationStartedAt);return due===null||started===null?null:`${due}:${started}`}
 function autoReadyEligible(order){return order?.orderType==='takeout'&&order?.status==='cooking'&&order?.autoReadyEnabled===true&&autoReadyIdentity(order)!==null}
 function createAutoReadyCoordinator({execute,getCurrentOrder,setTimer=setTimeout,clearTimer=clearTimeout,now=Date.now,onPermanentError=()=>{},retryMs=AUTO_READY_RETRY_MS}){
  const timers=new Map(),locks=new Set(),reported=new Set(),completed=new Set();
  function cancel(id){const entry=timers.get(String(id));if(entry)clearTimer(entry.timer);timers.delete(String(id))}
  function currentMatches(id,identity){const current=getCurrentOrder(String(id));return autoReadyEligible(current)&&autoReadyIdentity(current)===identity?current:null}
  function schedule(order,delay){const id=String(order.id),identity=autoReadyIdentity(order);if(!identity||timers.has(id))return false;const timer=setTimer(()=>{const entry=timers.get(id);if(!entry||entry.identity!==identity)return false;timers.delete(id);return run(order,identity)},Math.max(0,Math.min(delay,2147483647)));timers.set(id,{timer,identity,delay:Math.max(0,delay)});return true}
  async function run(order,identity=autoReadyIdentity(order)){
   const id=String(order?.id||'');if(!id||locks.has(id)||!currentMatches(id,identity))return false;
   locks.add(id);
   try{await execute(order);reported.delete(`${id}:${identity}`);completed.add(`${id}:${identity}`);return true}
   catch(error){
    const code=firestoreErrorCode(error),current=currentMatches(id,identity);
    if(!current||TERMINAL_AUTO_READY_CODES.has(code))return false;
    if(code==='order/deadline-pending'){schedule(current,Math.max(0,timestampMillis(current.readyDueAt)-now()));return false}
    if(TRANSIENT_FIRESTORE_CODES.has(code)){schedule(current,Math.max(retryMs,AUTO_READY_RETRY_MS));return false}
    const reportKey=`${id}:${identity}`;if(!reported.has(reportKey)){reported.add(reportKey);onPermanentError(error,current)}return false;
   }finally{locks.delete(id)}
  }
  function reconcile(list){
   const eligible=new Map((list||[]).filter(autoReadyEligible).map(order=>[String(order.id),order]));
   timers.forEach((entry,id)=>{const order=eligible.get(id);if(!order||entry.identity!==autoReadyIdentity(order))cancel(id)});
   reported.forEach(key=>{const split=key.indexOf(':'),id=key.slice(0,split),identity=key.slice(split+1);if(!eligible.has(id)||autoReadyIdentity(eligible.get(id))!==identity)reported.delete(key)});
   completed.forEach(key=>{const split=key.indexOf(':'),id=key.slice(0,split),identity=key.slice(split+1);if(!eligible.has(id)||autoReadyIdentity(eligible.get(id))!==identity)completed.delete(key)});
   eligible.forEach((order,id)=>{const key=`${id}:${autoReadyIdentity(order)}`;if(!timers.has(id)&&!locks.has(id)&&!completed.has(key)&&!reported.has(key))schedule(order,Math.max(0,timestampMillis(order.readyDueAt)-now()))});
  }
  return {reconcile,run,cancel,timers,locks,reported,completed};
 }
 async function startTakeoutPreparationTransaction({db,orderId,preparationMinutes,serverTimestamp,timestampFromMillis,nowMillis=Date.now(),adminId='admin',resolveBusinessDay=order=>order.businessDay}){
  if(!orderId||!validPreparationMinutes(preparationMinutes)||!Number.isFinite(nowMillis)||typeof timestampFromMillis!=='function')throw operationError('order/invalid-preparation','조리시간은 5분부터 60분까지 5분 단위로 선택해 주세요.');
  return db.runTransaction(async transaction=>{
   const orderRef=db.collection('orders').doc(orderId),snapshot=await transaction.get(orderRef);
   if(!snapshot.exists)throw operationError('order/not-found','주문이 삭제되었습니다.');
   const order={id:orderId,...snapshot.data()};
   if(order.orderType!=='takeout')throw operationError('order/invalid-transition','포장 주문만 조리시간을 설정할 수 있습니다.');
   if(!['payment_pending','new'].includes(order.status))throw operationError('order/stale-state','다른 관리자가 이미 주문 상태를 변경했습니다. 최신 상태를 확인해 주세요.');
   const businessDay=resolveBusinessDay(order);
   if(!businessDay)throw operationError('order/missing-business-day','주문의 영업일을 확인할 수 없습니다.');
   const timestamp=serverTimestamp(),preparationStartedAt=timestampFromMillis(nowMillis),readyDueAt=timestampFromMillis(nowMillis+preparationMinutes*60*1000),displayRef=db.collection('publicOrderDisplays').doc(orderId);
   transaction.update(orderRef,{status:'cooking',preparationMinutes,preparationStartedAt,readyDueAt,autoReadyEnabled:true,updatedAt:timestamp});
   transaction.set(displayRef,{orderNumber:String(order.customerNumber||order.orderNo||orderId),displayStatus:'cooking',storeId:String(order.storeId||'pangyo2-techno-valley'),businessDay,preparationMinutes,preparationStartedAt,readyDueAt,autoReadyEnabled:true,updatedAt:timestamp},{merge:true});
   return {order,status:'cooking',preparationMinutes,readyDueAt,orderWrites:1,displayWrites:1,seatWrites:0,paymentCalls:0};
  });
 }
 async function autoCompleteTakeoutTransaction({db,orderId,expectedReadyDueAt,expectedPreparationStartedAt,nowMillis=Date.now(),serverTimestamp,adminId='admin',resolveBusinessDay=order=>order.businessDay}){
  if(!orderId||timestampMillis(expectedReadyDueAt)===null||!Number.isFinite(nowMillis))throw operationError('order/invalid-request','자동 완료 주문 정보가 올바르지 않습니다.');
  return db.runTransaction(async transaction=>{
   const orderRef=db.collection('orders').doc(orderId),snapshot=await transaction.get(orderRef);
   if(!snapshot.exists)throw operationError('order/not-found','주문이 삭제되었습니다.');
   const order={id:orderId,...snapshot.data()};
   if(order.orderType!=='takeout'||order.status!=='cooking'||order.autoReadyEnabled!==true)throw operationError('order/stale-state','자동 완료 대상 주문 상태가 변경되었습니다.');
   if(!sameTimestamp(order.readyDueAt,expectedReadyDueAt)||(expectedPreparationStartedAt!=null&&!sameTimestamp(order.preparationStartedAt,expectedPreparationStartedAt)))throw operationError('order/stale-timer','조리 완료 예정 시간이 변경되었습니다.');
   if(timestampMillis(order.readyDueAt)>nowMillis)throw operationError('order/deadline-pending','아직 조리 완료 예정 시간이 되지 않았습니다.');
   const businessDay=resolveBusinessDay(order);
   if(!businessDay)throw operationError('order/missing-business-day','주문의 영업일을 확인할 수 없습니다.');
   const timestamp=serverTimestamp(),displayRef=db.collection('publicOrderDisplays').doc(orderId);
   const preparationDisplay=validPreparationMinutes(order.preparationMinutes)&&timestampMillis(order.preparationStartedAt)!==null&&timestampMillis(order.readyDueAt)!==null?{preparationMinutes:order.preparationMinutes,preparationStartedAt:order.preparationStartedAt,readyDueAt:order.readyDueAt,autoReadyEnabled:false}:{};
   transaction.update(orderRef,{status:'ready',autoReadyEnabled:false,updatedAt:timestamp,completedAt:timestamp,completedBy:String(adminId||'admin')});
   transaction.set(displayRef,{orderNumber:String(order.customerNumber||order.orderNo||orderId),displayStatus:'ready',storeId:String(order.storeId||'pangyo2-techno-valley'),businessDay,...preparationDisplay,updatedAt:timestamp},{merge:true});
   return {order,status:'ready',orderWrites:1,displayWrites:1,seatWrites:0,paymentCalls:0};
  });
 }
 function orderSeatIds(order){
  const seat=order?.seat,tables=Array.isArray(seat?.tables)?seat.tables.filter(Boolean):[];
  if(tables.length)return Array.from(new Set(tables));
  return seat?.id?[seat.id]:[];
 }
 function seatSnapshotRecord(snapshot){return snapshot?.exists?{exists:true,...snapshot.data()}:{exists:false}}
 function classifySeatOrderMismatch(order,seats={}){
  const ids=orderSeatIds(order);
  if(order?.orderType!=='dinein'||!FORCE_COMPLETE_STATUSES.has(order?.status)||!ids.length)return {forceEligible:false,ids,reason:'ineligible'};
  const records=ids.map(id=>({id,exists:Object.prototype.hasOwnProperty.call(seats,id),...(seats[id]||{})}));
  const belongs=record=>record.exists&&String(record.orderId||'')===String(order.id);
  const allHeld=records.every(record=>belongs(record)&&record.status==='held');
  const allOccupied=records.every(record=>belongs(record)&&record.status==='occupied');
  if(allHeld||allOccupied)return {forceEligible:false,ids,records,reason:allHeld?'linked-held':'linked-occupied'};
  if(records.some(record=>belongs(record)&&!['held','occupied'].includes(record.status)))return {forceEligible:false,ids,records,reason:'linked-invalid-state'};
  const mismatched=records.filter(record=>!belongs(record));
  return {forceEligible:mismatched.length>0,ids,records,mismatched,reason:mismatched.length?'seat-order-mismatch':'mixed-linked-state'};
 }
 function forceConfirmationValue(order){
  const value=String(order?.customerNumber||order?.orderNo||'').trim();
  return value?value.slice(-Math.min(4,value.length)):'';
 }
 function seatReleasePayload(serverTimestamp){
  return {status:'empty',orderId:null,orderNo:null,partySize:null,groupId:null,occupiedAt:null,heldBy:null,heldAt:null,heldUntil:null,cleaningAt:null,updatedAt:serverTimestamp()};
 }
 function counterTakeoutOrderId(orderNumber,businessDay){return `counter_${businessDay}_${orderNumber}`}
 async function createCounterTakeoutTransaction({db,orderNumber,status,businessDay,storeId='pangyo2-techno-valley',serverTimestamp,adminId='admin'}){
  const number=String(orderNumber??'').trim();
  if(!/^[0-9]{4}$/.test(number)||!/^\d{4}-\d{2}-\d{2}$/.test(String(businessDay||''))||!['cooking','ready'].includes(status))throw operationError('counter/invalid-request','대면 포장 주문 정보가 올바르지 않습니다.');
  const orderId=counterTakeoutOrderId(number,businessDay);
  return db.runTransaction(async transaction=>{
   const orderRef=db.collection('orders').doc(orderId),displayRef=db.collection('publicOrderDisplays').doc(orderId),existing=await transaction.get(orderRef);
   if(existing.exists)throw operationError('counter/duplicate',`${number}번은 이미 고객 화면에 표시 중입니다.`);
   const timestamp=serverTimestamp(),completion=status==='ready'?{completedAt:timestamp,completedBy:String(adminId||'admin')}:{};
   transaction.set(orderRef,{channel:'admin',source:'admin_counter',schemaVersion:1,storeId,orderNo:number,customerNumber:number,orderType:'takeout',pickup:{mode:'now'},items:[],itemCount:0,normalAmount:0,discountAmount:0,totalAmount:0,total:0,payment:{method:'counter',methodName:'대면 결제'},status,createdAt:timestamp,updatedAt:timestamp,businessDay,...completion});
   transaction.set(displayRef,{orderNumber:number,displayStatus:status==='ready'?'ready':'cooking',storeId,businessDay,updatedAt:timestamp});
   return {orderId,status,orderWrites:1,displayWrites:1,seatWrites:0,paymentCalls:0};
  });
 }
 async function completeTakeoutTransaction({db,orderId,expectedStatus,serverTimestamp,adminId='admin',resolveBusinessDay=order=>order.businessDay}){
  if(!orderId)throw operationError('order/invalid-request','주문 정보가 없습니다.');
  return db.runTransaction(async transaction=>{
   const orderRef=db.collection('orders').doc(orderId),snapshot=await transaction.get(orderRef);
   if(!snapshot.exists)throw operationError('order/not-found','주문이 삭제되었습니다.');
   const order={id:orderId,...snapshot.data()};
   if(order.orderType!=='takeout')throw operationError('order/invalid-transition','포장 주문만 완료할 수 있습니다.');
   if(order.status!==expectedStatus||!['accepted','paid','cooking'].includes(order.status))throw operationError('order/stale-state','다른 관리자가 이미 주문 상태를 변경했습니다. 최신 상태를 확인해 주세요.');
   const businessDay=resolveBusinessDay(order);
   if(!businessDay)throw operationError('order/missing-business-day','주문의 영업일을 확인할 수 없습니다.');
   const timestamp=serverTimestamp(),displayRef=db.collection('publicOrderDisplays').doc(orderId);
   const preparationDisplay=validPreparationMinutes(order.preparationMinutes)&&timestampMillis(order.preparationStartedAt)!==null&&timestampMillis(order.readyDueAt)!==null?{preparationMinutes:order.preparationMinutes,preparationStartedAt:order.preparationStartedAt,readyDueAt:order.readyDueAt,autoReadyEnabled:false}:{};
   transaction.update(orderRef,{status:'ready',autoReadyEnabled:false,updatedAt:timestamp,completedAt:timestamp,completedBy:String(adminId||'admin')});
   transaction.set(displayRef,{orderNumber:String(order.customerNumber||order.orderNo||orderId),displayStatus:'ready',storeId:String(order.storeId||'pangyo2-techno-valley'),businessDay,...preparationDisplay,updatedAt:timestamp},{merge:true});
   return {order,status:'ready',orderWrites:1,displayWrites:1,seatWrites:0,paymentCalls:0};
  });
 }
 async function completeTakeoutPickupTransaction({db,orderId,expectedStatus,serverTimestamp,adminId='admin'}){
  if(!orderId)throw operationError('order/invalid-request','주문 정보가 없습니다.');
  return db.runTransaction(async transaction=>{
   const orderRef=db.collection('orders').doc(orderId),displayRef=db.collection('publicOrderDisplays').doc(orderId);
   const orderSnapshot=await transaction.get(orderRef),displaySnapshot=await transaction.get(displayRef);
   if(!orderSnapshot.exists)throw operationError('order/not-found','주문이 삭제되었습니다.');
   const order={id:orderId,...orderSnapshot.data()};
   if(order.orderType!=='takeout')throw operationError('order/invalid-transition','포장 주문만 픽업 완료할 수 있습니다.');
   if(expectedStatus!=='ready'||order.status!=='ready')throw operationError('order/stale-state','다른 관리자가 이미 주문 상태를 변경했습니다. 최신 상태를 확인해 주세요.');
   const timestamp=serverTimestamp();
   transaction.update(orderRef,{status:'completed',updatedAt:timestamp,pickedUpAt:timestamp,pickedUpBy:String(adminId||'admin')});
   transaction.delete(displayRef);
   return {order,status:'completed',displayMissing:!displaySnapshot.exists,orderWrites:1,displayDeletes:1,seatWrites:0,paymentCalls:0};
  });
 }
 async function forceCompleteTransaction({db,orderId,expectedStatus,expectedConfirmation,serverTimestamp}){
  if(!orderId||!expectedConfirmation)throw operationError('order/invalid-request','주문번호 확인 정보가 없습니다.');
  return db.runTransaction(async transaction=>{
   const orderRef=db.collection('orders').doc(orderId),orderSnapshot=await transaction.get(orderRef);
   if(!orderSnapshot.exists)throw operationError('order/not-found','주문이 삭제되었습니다.');
   const order={id:orderId,...orderSnapshot.data()};
   if(order.status!==expectedStatus)throw operationError('order/stale-state','다른 관리자가 주문 상태를 변경했습니다.');
   if(!FORCE_COMPLETE_STATUSES.has(order.status))throw operationError('order/ineligible','현재 상태에서는 강제완료할 수 없습니다.');
   if(forceConfirmationValue(order)!==expectedConfirmation)throw operationError('order/confirmation-changed','주문번호 확인 정보가 변경되었습니다.');
   const ids=orderSeatIds(order),snapshots=await Promise.all(ids.map(id=>transaction.get(db.collection('seats').doc(id))));
   const records=Object.fromEntries(snapshots.map((snapshot,index)=>[ids[index],seatSnapshotRecord(snapshot)]));
   if(!classifySeatOrderMismatch(order,records).forceEligible)throw operationError('seat/mismatch-resolved','좌석 불일치가 해소되었거나 안전 확인이 필요합니다.');
   transaction.update(orderRef,{status:'completed',updatedAt:serverTimestamp(),adminForceCompleted:true,adminForceCompletedAt:serverTimestamp(),adminForceCompleteReason:'seat_state_mismatch'});
   return {orderId,status:'completed',orderWrites:1,seatWrites:0,paymentCalls:0};
  });
 }
 function expiredSeatGroups(seats,now){
  const groups=new Map();
  Object.entries(seats||{}).forEach(([id,seat])=>{if(!seat.orderId&&seat.status!=='occupied')return;const key=seat.orderId?`order:${seat.orderId}`:`seat:${id}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push({id,...seat})});
  return Array.from(groups.values()).filter(group=>group.length&&group.every(seat=>{const millis=timestampMillis(seat.occupiedAt);return seat.status==='occupied'&&millis!==null&&millis<=now-OCCUPIED_EXPIRY_MS}));
 }
 async function releaseExpiredSeatGroupTransaction({db,group,now,serverTimestamp}){
  if(!Array.isArray(group)||!group.length)throw operationError('seat/invalid-expiry-group','자동 해제할 좌석 그룹이 없습니다.');
  return db.runTransaction(async transaction=>{
   const refs=group.map(seat=>db.collection('seats').doc(seat.id)),snapshots=await Promise.all(refs.map(ref=>transaction.get(ref)));
   snapshots.forEach((snapshot,index)=>{const current=snapshot.exists?snapshot.data():null,initial=group[index],millis=timestampMillis(current?.occupiedAt);if(!current||current.status!=='occupied'||String(current.orderId||'')!==String(initial.orderId||'')||millis!==timestampMillis(initial.occupiedAt)||millis===null||millis>now-OCCUPIED_EXPIRY_MS)throw operationError('seat/stale-expiry','좌석 상태가 변경되어 자동 해제를 건너뜁니다.')});
   refs.forEach(ref=>transaction.set(ref,seatReleasePayload(serverTimestamp),{merge:true}));
   return {released:refs.length,seatWrites:refs.length,orderWrites:0};
  });
 }
 return {FORCE_COMPLETE_STATUSES,OCCUPIED_EXPIRY_MS,ADMIN_SEAT_STATUSES,ADMIN_SEAT_ACTIONS,ADMIN_SEAT_CONFIRMATIONS,AUTO_READY_RETRY_MS,TRANSIENT_FIRESTORE_CODES,TERMINAL_AUTO_READY_CODES,normalizeAdminSeatStatus,getAdminSeatActions,transitionAdminSeatState,timestampMillis,validPreparationMinutes,sameTimestamp,firestoreErrorCode,autoReadyIdentity,autoReadyEligible,createAutoReadyCoordinator,startTakeoutPreparationTransaction,autoCompleteTakeoutTransaction,orderSeatIds,seatSnapshotRecord,classifySeatOrderMismatch,forceConfirmationValue,seatReleasePayload,counterTakeoutOrderId,createCounterTakeoutTransaction,completeTakeoutTransaction,completeTakeoutPickupTransaction,forceCompleteTransaction,expiredSeatGroups,releaseExpiredSeatGroupTransaction};
});
