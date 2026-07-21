const test=require('node:test');
const assert=require('node:assert/strict');
const runtimeApi=require('../device-runtime.js');
const {DeviceRuntime}=runtimeApi;

function fixture(width=390,height=844){
 const attributes=new Map(),properties=new Map(),listeners=new Map();
 const target={
  style:{setProperty(name,value){properties.set(name,value)}},
  setAttribute(name,value){attributes.set(name,value)}
 };
 const frames=[];
 const view={
  innerWidth:width,innerHeight:height,
  addEventListener(type,listener){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(listener)},
  removeEventListener(type,listener){listeners.get(type)?.delete(listener)},
  requestAnimationFrame(callback){frames.push(callback);return frames.length},
  cancelAnimationFrame(id){frames[id-1]=null}
 };
 const flush=()=>{const pending=frames.splice(0);pending.forEach(callback=>callback?.())};
 const dispatch=type=>listeners.get(type)?.forEach(listener=>listener());
 return {view,target,attributes,properties,listeners,flush,dispatch};
}

test('initial runtime applies data attributes and custom properties',()=>{
 const f=fixture();
 new DeviceRuntime({view:f.view,target:f.target}).initialize();
 assert.deepEqual(Object.fromEntries(f.attributes),{
  'data-device':'default','data-viewport':'phone','data-orientation':'portrait','data-layout':'default'
 });
 assert.deepEqual(Object.fromEntries(f.properties),{
  '--device-type':'default','--device-viewport':'phone','--device-orientation':'portrait','--device-layout':'default',
  '--viewport-width':'390px','--viewport-height':'844px'
 });
});

test('resize is frame-coalesced and refreshes the context',()=>{
 const f=fixture();
 new DeviceRuntime({view:f.view,target:f.target}).initialize();
 f.view.innerWidth=1280;f.view.innerHeight=720;
 f.dispatch('resize');f.dispatch('resize');
 assert.equal(f.attributes.get('data-viewport'),'phone');
 f.flush();
 assert.equal(f.attributes.get('data-viewport'),'default');
 assert.equal(f.attributes.get('data-orientation'),'landscape');
 assert.equal(f.properties.get('--viewport-width'),'1280px');
});

test('orientationchange refreshes orientation and keeps layout default',()=>{
 const f=fixture(820,1180);
 new DeviceRuntime({view:f.view,target:f.target}).initialize();
 f.view.innerWidth=1180;f.view.innerHeight=820;
 f.dispatch('orientationchange');f.flush();
 assert.equal(f.attributes.get('data-orientation'),'landscape');
 assert.equal(f.attributes.get('data-layout'),'default');
 assert.equal(f.properties.get('--device-layout'),'default');
});

test('repeated initialization does not duplicate listeners',()=>{
 const f=fixture(),runtime=new DeviceRuntime({view:f.view,target:f.target});
 runtime.initialize();runtime.initialize();
 assert.equal(f.listeners.get('resize').size,1);
 assert.equal(f.listeners.get('orientationchange').size,1);
});

test('module initialization reuses the active runtime',()=>{
 const f=fixture();
 const first=runtimeApi.initialize({view:f.view,target:f.target});
 const second=runtimeApi.initialize({view:f.view,target:f.target});
 assert.equal(second,first);
 assert.equal(f.listeners.get('resize').size,1);
 runtimeApi.destroy();
});

test('destroy removes listeners and cancels pending updates',()=>{
 const f=fixture(),runtime=new DeviceRuntime({view:f.view,target:f.target}).initialize();
 f.dispatch('resize');runtime.destroy();
 assert.equal(f.listeners.get('resize').size,0);
 assert.equal(f.listeners.get('orientationchange').size,0);
 f.view.innerWidth=1280;f.flush();
 assert.equal(f.attributes.get('data-viewport'),'phone');
});
