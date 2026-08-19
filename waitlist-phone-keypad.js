(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PJ_WAITLIST_PHONE_KEYPAD=api
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 function digits(value){return String(value??'').replace(/\D/g,'').slice(0,11)}
 function append(value,digit){const next=digits(value);return /^\d$/.test(String(digit))&&next.length<11?next+digit:next}
 function backspace(value){return digits(value).slice(0,-1)}
 function valid(value){return /^010\d{8}$/.test(String(value??'').replace(/\D/g,''))}
 function format(value){
  const valueDigits=digits(value);
  if(valueDigits.length<=3)return valueDigits;
  if(valueDigits.length<=7)return `${valueDigits.slice(0,3)}-${valueDigits.slice(3)}`;
  return `${valueDigits.slice(0,3)}-${valueDigits.slice(3,7)}-${valueDigits.slice(7)}`
 }
 function payload({seatId,seatName,partySize,phone,createdAt,createdAtClient}){
  const normalized=String(phone??'').replace(/\D/g,'');
  if(!valid(normalized))return null;
  return {seatId,seatName,partySize:Math.min(16,Math.max(1,Number(partySize)||1)),phoneLast4:normalized.slice(-4),phoneMasked:`010-****-${normalized.slice(-4)}`,status:'waiting',createdAt,createdAtClient}
 }
 return Object.freeze({digits,append,backspace,valid,format,payload})
});
