(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){root.PJ_DEVICE=api;root.deviceContext=api.createDeviceContext()}
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const DeviceToken=Object.freeze({PHONE:'phone',TABLET:'tablet',KIOSK21:'kiosk21',DEFAULT:'default'});
 const ViewportToken=Object.freeze({PHONE:'phone',TABLET_PORTRAIT:'tabletPortrait',KIOSK_PORTRAIT:'kioskPortrait',DEFAULT:'default'});
 const OrientationToken=Object.freeze({PORTRAIT:'portrait',LANDSCAPE:'landscape',SQUARE:'square'});
 const LayoutToken=Object.freeze({DEFAULT:'default',PHONE:'phone',TABLET:'tablet'});

 function classifyOrientation(width,height){
  if(width===height)return OrientationToken.SQUARE;
  return width<height?OrientationToken.PORTRAIT:OrientationToken.LANDSCAPE;
 }

 function classifyViewport(width,height){
  const w=Number(width)||0,h=Number(height)||0;
  if(w<=560)return ViewportToken.PHONE;
  if(classifyOrientation(w,h)!==OrientationToken.PORTRAIT)return ViewportToken.DEFAULT;
  if(w<=1024)return ViewportToken.TABLET_PORTRAIT;
  return ViewportToken.KIOSK_PORTRAIT;
 }

 function viewportSize(source){
  const view=source||((typeof window!=='undefined')?window:null);
  return {width:Number(view?.innerWidth)||0,height:Number(view?.innerHeight)||0};
 }

 function classifyLayout(viewport,orientation){
  if(orientation!==OrientationToken.PORTRAIT)return LayoutToken.DEFAULT;
  if(viewport===ViewportToken.PHONE)return LayoutToken.PHONE;
  if(viewport===ViewportToken.TABLET_PORTRAIT)return LayoutToken.TABLET;
  return LayoutToken.DEFAULT;
 }

 class DeviceManager{
  constructor(options={}){
   this.deviceType=Object.values(DeviceToken).includes(options.deviceType)?options.deviceType:DeviceToken.DEFAULT;
   this.viewportSource=options.viewportSource;
  }

  current(){
   const {width,height}=viewportSize(this.viewportSource);
   const viewport=classifyViewport(width,height);
   const orientation=classifyOrientation(width,height);
   return Object.freeze({
    deviceType:this.deviceType,
    viewport,
    orientation,
    layout:classifyLayout(viewport,orientation),
    width,
    height
   });
  }
 }

 function createDeviceContext(options){
  const manager=new DeviceManager(options);
  return Object.freeze({
   get current(){return manager.current()},
   get deviceType(){return manager.current().deviceType},
   get viewport(){return manager.current().viewport},
   get orientation(){return manager.current().orientation},
   get layout(){return manager.current().layout}
  });
 }

 return Object.freeze({DeviceToken,ViewportToken,OrientationToken,LayoutToken,DeviceManager,createDeviceContext,classifyViewport,classifyOrientation,classifyLayout});
});
