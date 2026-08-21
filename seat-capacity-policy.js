(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PJ_SEAT_CAPACITY_POLICY=api
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ZONE_LIMITS=Object.freeze({annex:12,outdoor:16});
 const VALID_STATUSES=new Set(['empty','held','occupied','reserved']);
 function tableCapacity(table){const base=Number(table?.seats);return Number.isInteger(base)&&base>0?base:null}
 function normalizeStatus(doc){return VALID_STATUSES.has(doc?.status)?doc.status:'unknown'}
 function validTimestamp(value){if(!value)return false;if(value instanceof Date)return !Number.isNaN(value.getTime());if(typeof value?.toDate==='function'){const date=value.toDate();return date instanceof Date&&!Number.isNaN(date.getTime())}return false}
 function currentParty(table){
  const doc=table?.doc,status=normalizeStatus(doc),capacity=tableCapacity(table);
  if(status==='empty')return 0;
  const value=Number(doc?.partySize??doc?.reservationPartySize);
  if(Number.isInteger(value)&&value>0)return !doc?.orderId&&value>capacity?null:value;
  if(status==='reserved'||status==='held'&&!doc?.orderId)return capacity;
  if(status==='occupied'&&doc?.orderId==null&&validTimestamp(doc?.occupiedAt))return capacity;
  return null
 }
 function findCombination(tables,partySize,requiredTableIds=[]){
  const required=new Set(requiredTableIds||[]),available=tables.filter(table=>normalizeStatus(table.doc)==='empty');
  if([...required].some(id=>!available.some(table=>table.id===id)))return null;
  let best=null;
  for(let mask=1;mask<(1<<available.length);mask++){
   const selected=available.filter((_,index)=>mask&(1<<index));
   if([...required].some(id=>!selected.some(table=>table.id===id)))continue;
   const capacity=selected.reduce((sum,table)=>sum+tableCapacity(table),0);
   if(capacity>=partySize&&(!best||selected.length<best.selected.length||(selected.length===best.selected.length&&capacity<best.capacity)))best={selected,capacity}
  }
  return best?{tableIds:best.selected.map(table=>table.id),capacity:best.capacity}:null
 }
 function occupiedParty(tables){
  const linked=new Map();let total=0;
  for(const table of tables){
   const value=currentParty(table);if(value===null)return null;if(value===0)continue;
   const orderId=table.doc?.orderId,declared=Number(table.doc?.partySize??table.doc?.reservationPartySize),hasDeclaredParty=Number.isInteger(declared)&&declared>0;
   if(orderId&&hasDeclaredParty){const previous=linked.get(orderId);if(previous&&previous.partySize!==value)return null;linked.set(orderId,{partySize:value,capacity:(previous?.capacity||0)+tableCapacity(table)})}else total+=value
  }
  if([...linked.values()].some(group=>group.partySize>group.capacity))return null;
  return total+[...linked.values()].reduce((sum,group)=>sum+group.partySize,0)
 }
 function evaluateZone({zone,partySize,tables,requiredTableIds=[]}){
  if(!Number.isInteger(partySize)||partySize<1||!Array.isArray(tables)||!tables.length)return {status:'review',reason:'invalid-data',canSeat:false,tableIds:[]};
  const normalized=tables.map(table=>({...table,zone,doc:table.doc||{status:'empty'}}));
  if(normalized.some(table=>tableCapacity(table)===null||normalizeStatus(table.doc)==='unknown'))return {status:'review',reason:'invalid-data',canSeat:false,tableIds:[]};
  const occupied=occupiedParty(normalized);
  if(occupied===null)return {status:'review',reason:'invalid-party-size',canSeat:false,tableIds:[]};
  const limit=ZONE_LIMITS[zone]||Infinity;
  if(occupied+partySize>limit)return {status:'full',reason:'zone-capacity',canSeat:false,occupied,remaining:Math.max(0,limit-occupied),tableIds:[]};
  const combination=findCombination(normalized,partySize,requiredTableIds);
  if(!combination)return {status:'full',reason:'table-combination',canSeat:false,occupied,remaining:Math.max(0,limit-occupied),tableIds:[]};
  return {status:'available',reason:'available',canSeat:true,occupied,remaining:Math.max(0,limit-occupied-partySize),...combination}
 }
 function evaluateSelection({zone,partySize,tables,selectedTableIds}){
  const selected=new Set(selectedTableIds||[]);
  if(!selected.size)return {status:'full',reason:'table-combination',canSeat:false,tableIds:[]};
  const prepared=tables.map(table=>selected.has(table.id)?{...table,doc:{...(table.doc||{}),status:'empty',partySize:null}}:table);
  const minimum=evaluateZone({zone,partySize,tables:prepared});
  const result=evaluateZone({zone,partySize,tables:prepared,requiredTableIds:[...selected]});
  const chosenCapacity=prepared.filter(table=>selected.has(table.id)).reduce((sum,table)=>sum+(tableCapacity({...table,zone})||0),0);
  if(!minimum.canSeat||!result.canSeat||chosenCapacity<partySize||selected.size!==minimum.tableIds.length||result.tableIds.length!==selected.size)return {...result,status:'full',reason:result.canSeat?'table-combination':result.reason,canSeat:false,tableIds:[]};
  return {...result,tableIds:[...selected],capacity:chosenCapacity}
 }
 return Object.freeze({ZONE_LIMITS,tableCapacity,normalizeStatus,findCombination,evaluateZone,evaluateSelection})
});
