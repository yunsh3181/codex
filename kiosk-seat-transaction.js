(function(root,factory){
 const api=factory(root.PJ_SEAT_CAPACITY_POLICY||(typeof require==='function'?require('./seat-capacity-policy'):null));
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PJ_KIOSK_SEAT_TRANSACTION=api
})(typeof globalThis!=='undefined'?globalThis:this,function(capacityPolicy){
 'use strict';
 async function commitSeatOrder({db,zone,selectedTableIds,partySize,seatClientId,tableDefinitions,orderRef,payload,serverTimestamp,validateBeforeWrite}){
  const selected=[...new Set(selectedTableIds||[])],definitions=tableDefinitions||[];
  if(!selected.length)throw Object.assign(new Error('SEAT_SELECTION_EMPTY'),{code:'SEAT_SELECTION_EMPTY'});
  const zoneIds=['annex','outdoor'].includes(zone)?definitions.map(table=>table.id):selected;
  const zoneRefs=zoneIds.map(id=>db.collection('seats').doc(id));
  return db.runTransaction(async transaction=>{
   const snapshots=await Promise.all(zoneRefs.map(ref=>transaction.get(ref)));
   if(validateBeforeWrite)await validateBeforeWrite();
   const byId=Object.fromEntries(snapshots.map((snapshot,index)=>[zoneIds[index],snapshot]));
   const selectedSnapshots=selected.map(id=>byId[id]);
   if(selectedSnapshots.some(snapshot=>!snapshot?.exists)){const error=new Error('SEAT_STALE');error.code='SEAT_STALE';throw error}
   if(selectedSnapshots.some(snapshot=>snapshot.data().status==='reserved')){const error=new Error('SEAT_RESERVED');error.code='SEAT_RESERVED';throw error}
   if(selectedSnapshots.some(snapshot=>{const data=snapshot.data();return data.status!=='held'||data.heldBy!==seatClientId||Boolean(data.orderId)})){const error=new Error('SEAT_STALE');error.code='SEAT_STALE';throw error}
   if(['annex','outdoor'].includes(zone)){
    const tables=definitions.map(table=>({...table,zone,doc:byId[table.id]?.exists?byId[table.id].data():{status:'empty'}}));
    const capacity=capacityPolicy.evaluateSelection({zone,partySize:Number(partySize),tables,selectedTableIds:selected});
    if(!capacity.canSeat){const error=new Error('ZONE_CAPACITY_STALE');error.code='ZONE_CAPACITY_STALE';throw error}
   }
   transaction.set(orderRef,payload);
   selected.forEach(id=>transaction.set(db.collection('seats').doc(id),{status:'held',heldBy:null,heldUntil:null,partySize:Number(partySize),orderNo:payload.orderNo,orderId:orderRef.id,updatedAt:serverTimestamp()},{merge:true}));
   return {orderId:orderRef.id,orderWrites:1,seatWrites:selected.length}
  })
 }
 return Object.freeze({commitSeatOrder})
});
