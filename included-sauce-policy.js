(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PJ_INCLUDED_SAUCE_POLICY=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';

 const EMPTY=Object.freeze({garlic:0,pickle:0,hotSauce:0,honeyMustard:0,tomato:0});
 const PIZZA_BY_SIZE=Object.freeze({
  R:Object.freeze({garlic:1,pickle:1,hotSauce:1}),
  L:Object.freeze({garlic:1,pickle:1,hotSauce:2}),
  F:Object.freeze({garlic:1,pickle:1,hotSauce:2})
 });
 const SIDE_SAUCES=Object.freeze({
  S007:Object.freeze({honeyMustard:1}),
  S008:Object.freeze({honeyMustard:1}),
  S011:Object.freeze({garlic:1,tomato:1}),
  S012:Object.freeze({garlic:1,tomato:1}),
  S013:Object.freeze({garlic:1,tomato:1})
 });

 function positiveInteger(value,fallback=0){
  const number=Number(value);
  return Number.isInteger(number)&&number>0?number:fallback;
 }
 function add(target,source,multiplier=1){
  for(const key of Object.keys(EMPTY))target[key]+=positiveInteger(source?.[key])*multiplier;
 }
 function addSideMap(target,map,multiplier){
  for(const [id,value] of Object.entries(map||{})){
   const quantity=positiveInteger(typeof value==='object'&&value!==null?value.quantity??value.qty:value);
   if(quantity)add(target,SIDE_SAUCES[id],quantity*multiplier);
  }
 }
 function calculate(orders,orderType){
  const totals={...EMPTY};
  for(const order of orders||[]){
   if(!order)continue;
   const parentQuantity=positiveInteger(order.qty,1);
   const hasPizza=Boolean(order.pizzaLeft||order.pizza||order.set);
   const size=String(order.size||'').toUpperCase();
   if(hasPizza&&PIZZA_BY_SIZE[size]){
    const pizzaSauces=orderType==='dinein'
     ?{garlic:PIZZA_BY_SIZE[size].garlic}
     :PIZZA_BY_SIZE[size];
    add(totals,pizzaSauces,parentQuantity);
   }
   addSideMap(totals,order.includedSides,parentQuantity);
   const paidSideMultiplier=order.extrasIndependent===false?parentQuantity:1;
   addSideMap(totals,order.sides,paidSideMultiplier);
  }
  return Object.freeze({
   ...totals,
   storeFree:orderType==='dinein'?Object.freeze(['pickle','hotSauce']):Object.freeze([])
  });
 }

 return Object.freeze({PIZZA_BY_SIZE,SIDE_SAUCES,calculate,positiveInteger});
});
