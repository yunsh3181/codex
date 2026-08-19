(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PJ_SEAT_CAPACITY_POLICY=api
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const ZONE_LIMITS=Object.freeze({annex:12,outdoor:16});
 const VALID_STATUSES=new Set(['empty','held','occupied','reserved']);
 function tableCapacity(table){const base=Number(table?.seats);if(!Number.isInteger(base)||base<1)return null;return (table.zone==='annex'||table.zone==='outdoor')&&base===4?5:base}
 function normalizeStatus(doc){return VALID_STATUSES.has(doc?.status)?doc.status:'unknown'}
 function validTimestamp(value){if(!value)return false;if(value instanceof Date)return !Number.isNaN(value.getTime());if(typeof value?.toDate==='function'){const date=value.toDate();return date instanceof Date&&!Number.isNaN(date.getTime())}return false}
 function currentParty(table){const doc=table?.doc,status=normalizeStatus(doc);if(status==='empty')return 0;const value=Number(doc?.partySize);if(Number.isInteger(value)&&value>0)return value;if(status==='occupied'&&doc?.orderId==null&&validTimestamp(doc?.occupiedAt))return tableCapacity(table);return null}
 function findCombination(tables,partySize){const available=tables.filter(table=>normalizeStatus(table.doc)==='empty');let best=null;for(let mask=1;mask<(1<<available.length);mask++){const selected=available.filter((_,index)=>mask&(1<<index)),capacity=selected.reduce((sum,table)=>sum+tableCapacity(table),0);if(capacity>=partySize&&(!best||selected.length<best.selected.length||(selected.length===best.selected.length&&capacity<best.capacity)))best={selected,capacity}}return best?{tableIds:best.selected.map(table=>table.id),capacity:best.capacity}:null}
 function evaluateZone({zone,partySize,tables}){
  if(!Number.isInteger(partySize)||partySize<1||!Array.isArray(tables)||!tables.length)return {status:'review',reason:'invalid-data',canSeat:false,tableIds:[]};
  const normalized=tables.map(table=>({...table,zone,doc:table.doc||{status:'empty'}}));
  if(normalized.some(table=>tableCapacity(table)===null||normalizeStatus(table.doc)==='unknown'))return {status:'review',reason:'invalid-data',canSeat:false,tableIds:[]};
  const occupied=normalized.reduce((sum,table)=>{const value=currentParty(table);return value===null?NaN:sum+value},0);
  if(!Number.isFinite(occupied))return {status:'review',reason:'invalid-party-size',canSeat:false,tableIds:[]};
  const limit=ZONE_LIMITS[zone]||Infinity;
  if(occupied+partySize>limit)return {status:'full',reason:'zone-capacity',canSeat:false,occupied,remaining:Math.max(0,limit-occupied),tableIds:[]};
  const combination=findCombination(normalized,partySize);
  if(!combination)return {status:'full',reason:'table-combination',canSeat:false,occupied,remaining:Math.max(0,limit-occupied),tableIds:[]};
  return {status:'available',reason:'available',canSeat:true,occupied,remaining:Math.max(0,limit-occupied-partySize),...combination}
 }
 function evaluateSelection({zone,partySize,tables,selectedTableIds}){
  const selected=new Set(selectedTableIds||[]);
  if(!selected.size)return {status:'full',reason:'table-combination',canSeat:false,tableIds:[]};
  const prepared=tables.map(table=>selected.has(table.id)?{...table,doc:{...(table.doc||{}),status:'empty',partySize:null}}:table);
  const result=evaluateZone({zone,partySize,tables:prepared});
  const chosenCapacity=prepared.filter(table=>selected.has(table.id)).reduce((sum,table)=>sum+(tableCapacity({...table,zone})||0),0);
  if(!result.canSeat||chosenCapacity<partySize)return {...result,status:'full',reason:result.canSeat?'table-combination':result.reason,canSeat:false,tableIds:[]};
  return {...result,tableIds:[...selected],capacity:chosenCapacity}
 }
 return Object.freeze({ZONE_LIMITS,tableCapacity,normalizeStatus,evaluateZone,evaluateSelection})
});
