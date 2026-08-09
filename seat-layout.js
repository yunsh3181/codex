(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.PJSeatLayout=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const SLOT_COUNT=18;
 const SEAT_IDS=Object.freeze(['papa-2','papa-bar4','outdoor-1','outdoor-2','outdoor-3','outdoor-4','annex-1','annex-2','annex-3','annex-4','room-1','room-2','room-3']);
 const DEFAULT_POSITIONS=Object.freeze({'papa-2':0,'papa-bar4':1,'outdoor-1':2,'outdoor-2':3,'outdoor-3':4,'outdoor-4':5,'annex-1':6,'annex-2':7,'annex-3':8,'annex-4':9,'room-1':12,'room-2':13,'room-3':14});
 function copyDefault(){return {...DEFAULT_POSITIONS}}
 function validatePositions(value){
  if(!value||typeof value!=='object'||Array.isArray(value))return {valid:false,reason:'배열 데이터 형식이 올바르지 않습니다.'};
  const keys=Object.keys(value);
  if(keys.length!==SEAT_IDS.length||keys.some(id=>!SEAT_IDS.includes(id))||SEAT_IDS.some(id=>!Object.prototype.hasOwnProperty.call(value,id)))return {valid:false,reason:'좌석 ID가 누락되었거나 허용되지 않은 좌석이 있습니다.'};
  const slots=SEAT_IDS.map(id=>value[id]);
  if(slots.some(slot=>!Number.isInteger(slot)||slot<0||slot>=SLOT_COUNT))return {valid:false,reason:'좌석 슬롯은 0부터 17까지의 정수여야 합니다.'};
  if(new Set(slots).size!==SEAT_IDS.length)return {valid:false,reason:'두 좌석이 같은 슬롯을 사용할 수 없습니다.'};
  return {valid:true,positions:Object.fromEntries(SEAT_IDS.map(id=>[id,value[id]]))};
 }
 function moveSeat(positions,seatId,targetSlot){
  const checked=validatePositions(positions);
  if(!checked.valid||!SEAT_IDS.includes(seatId)||!Number.isInteger(targetSlot)||targetSlot<0||targetSlot>=SLOT_COUNT)return null;
  const next={...checked.positions},source=next[seatId],other=SEAT_IDS.find(id=>next[id]===targetSlot);
  next[seatId]=targetSlot;if(other)next[other]=source;
  return next;
 }
 function slotEntries(positions){const checked=validatePositions(positions),bySlot=new Map();if(checked.valid)SEAT_IDS.forEach(id=>bySlot.set(checked.positions[id],id));return Array.from({length:SLOT_COUNT},(_,slot)=>({slot,seatId:bySlot.get(slot)||null}))}
 return {SLOT_COUNT,SEAT_IDS,DEFAULT_POSITIONS,copyDefault,validatePositions,moveSeat,slotEntries};
});
