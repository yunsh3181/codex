(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PJ_KIOSK_PAGE_VOICE=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const SILENT_STEPS=new Set(['idle','testDone']);

 function routeFor(context={}){
  const step=context.step;
  if(!step||SILENT_STEPS.has(step))return null;
  if(context.overlay==='waitlist')return {id:'overlay:waitlist',key:'waitlistPhone'};
  if(context.overlay==='disposables')return {id:'overlay:disposables',key:'disposables'};
  const simple={language:'language',home:'home',type:'orderType',timing:'timing',reserve:'reserveTime',party:'party',area:'area',table:'table',promo:'benefit',setChoice:'set',size:'size',mode:'crust',pizzaOptions:'crust',crust:'crust',accompaniment:'accompaniment',review:'review'};
  if(simple[step])return {id:`step:${step}`,key:simple[step]};
  if(step==='pizza')return {id:`step:pizza:${context.secondPizza?'second':'first'}`,key:context.secondPizza?'secondPizza':'pizza'};
  if(step==='topping')return {id:`step:topping:${context.toppingSelection?'select':'prompt'}`,key:context.toppingSelection?'toppingSelect':'toppingPrompt'};
  if(step==='side')return {id:`step:side:${context.includedSide?'included':'extra'}`,key:context.includedSide?'includedSide':'extraSide'};
  if(step==='drink')return {id:`step:drink:${context.includedDrink?'included':'extra'}`,key:context.includedDrink?'includedDrink':'extraDrink'};
  if(step==='phone')return {id:`step:phone:${context.foreign?'foreign':'ko'}`,key:context.foreign?'customerName':'phone'};
  if(step==='payment')return {id:`step:payment:${context.paymentMethod?'submit':'method'}`,key:context.paymentMethod?'submit':'payment'};
  if(step==='done')return {id:`step:done:${context.completionToken||'current'}`,key:completionKey(context),vars:completionVars(context)};
  return null;
 }

 function completionKey(context){
  const reservation=context.orderTiming==='reserve';
  const foreign=Boolean(context.foreign);
  if(!reservation)return foreign?'completeForeign':'completeNormal';
  const prepaid=context.reservationPaymentType==='prepaid';
  if(foreign)return prepaid?'completeReservationForeignPrepaid':'completeReservationForeignPostpaid';
  return prepaid?'completeReservationPrepaid':'completeReservationPostpaid';
 }
 function completionVars(context){return {orderNo:context.orderNo||'',customerName:context.customerName||''}}

 function createKioskPageVoiceController(options={}){
  const synth=options.synth;
  const createUtterance=options.createUtterance;
  const translate=options.translate||((key)=>key);
  const language=options.language||(()=> 'ko');
  const localeTags=options.localeTags||{};
  const schedule=options.schedule||((fn)=>Promise.resolve().then(fn));
  let unlocked=false,generation=0,currentContext=null,lastIdentity=null,lastBaseIdentity=null,lastOverlayIdentity=null;

  function cancel(){generation+=1;try{synth?.cancel?.()}catch(_error){}}
  function speakRoute(route,context){
   if(!unlocked||!route||!synth||typeof synth.speak!=='function'||typeof createUtterance!=='function')return;
   const token=++generation;
   try{synth.cancel?.()}catch(_error){}
   schedule(()=>{
    if(!unlocked||token!==generation||routeFor(currentContext)?.id!==route.id)return;
    try{
     const lang=language();
     const text=translate(`voice.${route.key}`,route.vars||{});
     if(!text)return;
     const utterance=createUtterance(text,{lang:localeTags[lang]||lang});
     if(token===generation&&utterance)synth.speak(utterance)
    }catch(_error){}
   })
  }
  function update(context={}){
   currentContext={...context};
   const route=routeFor(currentContext);
   if(!route){lastIdentity=null;lastBaseIdentity=null;lastOverlayIdentity=null;cancel();return}
   const identity=`${language()}:${route.id}`;
   if(currentContext.overlay){
    if(identity===lastOverlayIdentity)return;
    lastOverlayIdentity=identity;
    lastIdentity=identity;
    speakRoute(route,currentContext);
    return
   }
   lastOverlayIdentity=null;
   if(identity===lastBaseIdentity){lastIdentity=identity;return}
   lastBaseIdentity=identity;
   lastIdentity=identity;
   speakRoute(route,currentContext)
  }
  function unlock(){if(unlocked)return false;unlocked=true;const route=routeFor(currentContext);if(route)speakRoute(route,currentContext);return true}
  function announce(key,vars={}){
   if(!unlocked)return false;
   cancel();
   const token=generation;
   schedule(()=>{
    if(token!==generation)return;
    try{
     const lang=language(),text=translate(`voice.${key}`,vars);
     const utterance=text&&createUtterance?.(text,{lang:localeTags[lang]||lang});
     if(token===generation&&utterance)synth?.speak?.(utterance)
    }catch(_error){}
   });
   return true
  }
  function reset(){currentContext=null;lastIdentity=null;lastBaseIdentity=null;lastOverlayIdentity=null;cancel()}
  return {update,unlock,announce,cancel,reset,isUnlocked:()=>unlocked,currentIdentity:()=>lastIdentity}
 }
 return {createKioskPageVoiceController,routeFor,completionKey};
});
