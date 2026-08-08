(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PJAdminOperations=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const FORCE_COMPLETE_STATUSES=new Set(['payment_pending','new','accepted','paid','cooking','ready']);
 const OCCUPIED_EXPIRY_MS=3*60*60*1000;

 function operationError(code,message){return Object.assign(new Error(message),{code})}
 function timestampMillis(value){
  if(value==null)return null;
  if(typeof value.toMillis==='function'){const millis=value.toMillis();return Number.isFinite(millis)?millis:null}
  if(typeof value.toDate==='function'){const millis=value.toDate().getTime();return Number.isFinite(millis)?millis:null}
  if(Number.isFinite(value.seconds)){const millis=value.seconds*1000+(Number(value.nanoseconds)||0)/1e6;return Number.isFinite(millis)?millis:null}
  const millis=value instanceof Date?value.getTime():typeof value==='number'?value:NaN;
  return Number.isFinite(millis)?millis:null;
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
   transaction.update(orderRef,{status:'ready',updatedAt:timestamp,completedAt:timestamp,completedBy:String(adminId||'admin')});
   transaction.set(displayRef,{orderNumber:String(order.customerNumber||order.orderNo||orderId),displayStatus:'ready',storeId:String(order.storeId||'pangyo2-techno-valley'),businessDay,updatedAt:timestamp},{merge:true});
   return {order,status:'ready',orderWrites:1,displayWrites:1,seatWrites:0,paymentCalls:0};
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
 return {FORCE_COMPLETE_STATUSES,OCCUPIED_EXPIRY_MS,timestampMillis,orderSeatIds,seatSnapshotRecord,classifySeatOrderMismatch,forceConfirmationValue,seatReleasePayload,counterTakeoutOrderId,createCounterTakeoutTransaction,completeTakeoutTransaction,forceCompleteTransaction,expiredSeatGroups,releaseExpiredSeatGroupTransaction};
});
