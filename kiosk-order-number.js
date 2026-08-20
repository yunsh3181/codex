(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PJ_KIOSK_ORDER_NUMBER=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function businessDayKey(now=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  const date=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)-(Number(parts.hour)<9?1:0)));
  return date.toISOString().slice(0,10);
 }
 function counterId(storeId,day,prefix){return `${String(storeId).replace(/[^A-Za-z0-9_-]/g,'_')}_${day}_${prefix}`}
 function format(prefix,sequence){if(!['P','D'].includes(prefix)||!Number.isInteger(sequence)||sequence<1||sequence>9999)throw Object.assign(new Error('ORDER_NUMBER_SEQUENCE_INVALID'),{code:'ORDER_NUMBER_SEQUENCE_INVALID'});return prefix+String(sequence).padStart(4,'0')}
 async function allocateInTransaction({db,transaction,orderRef,payload,timestampFromMillis,now=new Date()}){
  const prefix=payload.orderType==='takeout'?'P':'D',day=businessDayKey(now),id=counterId(payload.storeId,day,prefix),ref=db.collection('orderNumberCounters').doc(id);
  const snapshot=await transaction.get(ref),previous=snapshot.exists?Number(snapshot.data().currentSequence):0,sequence=previous+1,orderNo=format(prefix,sequence),businessDate=timestampFromMillis(Date.parse(`${day}T00:00:00.000Z`)),allocationRef=db.collection('orderNumberAllocations').doc(`${id}_${sequence}`);
  const allocated={...payload,orderNo,customerNumber:orderNo,businessDay:day,dailySequence:sequence};
  transaction.set(ref,{storeId:payload.storeId,businessDate,orderPrefix:prefix,currentSequence:sequence,updatedAt:payload.createdAt});
  transaction.set(allocationRef,{storeId:payload.storeId,businessDate,orderPrefix:prefix,sequence,orderNo,orderDocumentId:orderRef.id,createdAt:payload.createdAt});
  return allocated;
 }
 async function withAllocationConflictRetry(execute,maxAttempts=3){
  let lastError;
  for(let attempt=1;attempt<=maxAttempts;attempt++)try{return await execute()}catch(error){lastError=error;if(error?.code!=='permission-denied'||attempt===maxAttempts)throw error}
  throw lastError;
 }
 return Object.freeze({businessDayKey,counterId,format,allocateInTransaction,withAllocationConflictRetry});
});
