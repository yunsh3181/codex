(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){
  root.PJ_KIOSK_SCROLL_INDICATOR=api;
  if(root.document)api.init({window:root,document:root.document});
 }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const TOLERANCE=2;
 const MIN_THUMB_HEIGHT=96;
 let instance=null;

 const clamp=(value,min,max)=>Math.min(max,Math.max(min,Number.isFinite(value)?value:min));

 function createController(options={}){
  const view=options.window;
  const document=options.document;
  const scroller=options.scroller||document?.querySelector?.('#main.app');
  const track=options.track||document?.getElementById?.('kioskScrollIndicator');
  const thumb=options.thumb||document?.getElementById?.('kioskScrollIndicatorThumb');
  const ResizeObserverClass=options.ResizeObserver||view?.ResizeObserver;
  const MutationObserverClass=options.MutationObserver||view?.MutationObserver;
  if(!view||!document||!scroller||!track||!thumb)return null;

  let frame=null;
  let active=false;
  let resizeObserver=null;
  let mutationObserver=null;

  function isKiosk(){
   return document.documentElement?.dataset?.layout==='kiosk21';
  }

  function update(){
   frame=null;
   if(!isKiosk()){
    track.hidden=true;
    return;
   }
   const scrollHeight=Math.max(0,Number(scroller.scrollHeight)||0);
   const clientHeight=Math.max(0,Number(scroller.clientHeight)||0);
   const maxScrollTop=Math.max(0,scrollHeight-clientHeight);
   const modalOpen=Boolean(document.querySelector?.('#modal .backdrop, #modal .c-popup-backdrop'));
   if(modalOpen||scrollHeight<=clientHeight+TOLERANCE){
    track.hidden=true;
    return;
   }
   track.hidden=false;
   const trackHeight=Math.max(0,Number(track.clientHeight)||0);
   if(trackHeight<=0){
    track.hidden=true;
    return;
   }
   const proportionalHeight=trackHeight*(clientHeight/scrollHeight);
   const thumbHeight=clamp(Math.max(MIN_THUMB_HEIGHT,proportionalHeight),0,trackHeight);
   const travel=Math.max(0,trackHeight-thumbHeight);
   const scrollTop=clamp(Number(scroller.scrollTop)||0,0,maxScrollTop);
   const thumbTop=maxScrollTop===0?0:clamp((scrollTop/maxScrollTop)*travel,0,travel);
   thumb.style.height=`${thumbHeight}px`;
   thumb.style.transform=`translate3d(0, ${thumbTop}px, 0)`;
  }

  function schedule(){
   if(frame!==null)return;
   frame=view.requestAnimationFrame(update);
  }

  function initialize(){
   if(active)return controller;
   active=true;
   scroller.addEventListener('scroll',schedule,{passive:true});
   scroller.addEventListener('load',schedule,true);
   view.addEventListener('resize',schedule);
   view.addEventListener('orientationchange',schedule);
   if(ResizeObserverClass){
    resizeObserver=new ResizeObserverClass(schedule);
    resizeObserver.observe(scroller);
   }
   if(MutationObserverClass){
    mutationObserver=new MutationObserverClass(schedule);
    mutationObserver.observe(scroller,{childList:true,subtree:true,attributes:true});
    const modal=document.getElementById?.('modal');
    if(modal)mutationObserver.observe(modal,{childList:true,subtree:true});
   }
   document.fonts?.ready?.then(schedule).catch(()=>{});
   schedule();
   return controller;
  }

  function destroy(){
   if(!active)return;
   active=false;
   scroller.removeEventListener('scroll',schedule);
   scroller.removeEventListener('load',schedule,true);
   view.removeEventListener('resize',schedule);
   view.removeEventListener('orientationchange',schedule);
   resizeObserver?.disconnect();
   mutationObserver?.disconnect();
   resizeObserver=null;
   mutationObserver=null;
   if(frame!==null)view.cancelAnimationFrame(frame);
   frame=null;
   track.hidden=true;
  }

  const controller={initialize,destroy,schedule,update,isKiosk};
  return controller;
 }

 function init(options={}){
  if(instance)return instance.initialize();
  instance=createController(options);
  return instance?.initialize()||null;
 }

 function schedule(){
  instance?.schedule();
 }

 function destroy(){
  instance?.destroy();
  instance=null;
 }

 return Object.freeze({createController,init,schedule,destroy,TOLERANCE,MIN_THUMB_HEIGHT});
});
