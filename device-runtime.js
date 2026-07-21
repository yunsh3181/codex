(function(root,factory){
 const api=factory(root,typeof module==='object'&&module.exports?require('./device-manager.js'):root?.PJ_DEVICE);
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){
  root.PJ_DEVICE_RUNTIME=api;
  if(root.document&&root.PJ_DEVICE)api.initialize();
 }
})(typeof globalThis!=='undefined'?globalThis:this,function(root,deviceApi){
 const DATA_KEYS=Object.freeze(['device','viewport','orientation','layout']);
 const STYLE_KEYS=Object.freeze({
  device:'--device-type',viewport:'--device-viewport',orientation:'--device-orientation',layout:'--device-layout',
  width:'--viewport-width',height:'--viewport-height'
 });

 class DeviceRuntime{
  constructor(options={}){
   this.view=options.view||root;
   this.document=options.document||this.view?.document;
   this.target=options.target||this.document?.documentElement;
   this.manager=options.manager||new deviceApi.DeviceManager({viewportSource:this.view});
   this.frame=null;
   this.active=false;
   this.onResize=this.schedule.bind(this);
   this.onOrientationChange=this.schedule.bind(this);
  }

  apply(){
   if(!this.target)return null;
   const current=this.manager.current();
   const values={device:current.deviceType,viewport:current.viewport,orientation:current.orientation,layout:deviceApi.LayoutToken.DEFAULT};
   DATA_KEYS.forEach(key=>this.target.setAttribute(`data-${key}`,values[key]));
   Object.entries(values).forEach(([key,value])=>this.target.style.setProperty(STYLE_KEYS[key],value));
   this.target.style.setProperty(STYLE_KEYS.width,`${current.width}px`);
   this.target.style.setProperty(STYLE_KEYS.height,`${current.height}px`);
   return current;
  }

  schedule(){
   if(this.frame!==null)return;
   this.frame=this.view.requestAnimationFrame(()=>{
    this.frame=null;
    this.apply();
   });
  }

  initialize(){
   if(this.active)return this;
   this.active=true;
   this.apply();
   this.view.addEventListener('resize',this.onResize);
   this.view.addEventListener('orientationchange',this.onOrientationChange);
   return this;
  }

  destroy(){
   if(!this.active)return;
   this.active=false;
   this.view.removeEventListener('resize',this.onResize);
   this.view.removeEventListener('orientationchange',this.onOrientationChange);
   if(this.frame!==null){
    this.view.cancelAnimationFrame(this.frame);
    this.frame=null;
   }
  }
 }

 let runtime=null;
 function initialize(options){
  if(runtime?.active)return runtime;
  runtime=new DeviceRuntime(options).initialize();
  return runtime;
 }
 function destroy(){
  runtime?.destroy();
  runtime=null;
 }

 return Object.freeze({DeviceRuntime,initialize,destroy});
});
