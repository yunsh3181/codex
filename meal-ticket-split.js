(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PJ_MEAL_TICKET_SPLIT=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const UNIT_WON=100;
 const MAX_SPLIT_COUNT=20;

 function calculate(totalAmount,splitCount){
  if(!Number.isSafeInteger(totalAmount)||totalAmount<=0||totalAmount%UNIT_WON!==0)return null;
  if(!Number.isSafeInteger(splitCount)||splitCount<1||splitCount>MAX_SPLIT_COUNT)return null;
  const totalUnits=totalAmount/UNIT_WON;
  if(splitCount>totalUnits)return null;
  const baseUnits=Math.floor(totalUnits/splitCount);
  const remainderUnits=totalUnits%splitCount;
  const basePayerCount=splitCount-remainderUnits;
  const amounts=Array.from({length:splitCount},(_,index)=>(baseUnits+(index>=basePayerCount?1:0))*UNIT_WON);
  return {amounts,totalAmount,splitCount,baseAmount:baseUnits*UNIT_WON,remainderUnits};
 }

 return {UNIT_WON,MAX_SPLIT_COUNT,calculate};
});
