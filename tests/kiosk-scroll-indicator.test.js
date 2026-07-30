const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createController,MIN_THUMB_HEIGHT}=require('../kiosk-scroll-indicator');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/device-kiosk21.css'),'utf8');

class EventTarget {
 constructor(){this.listeners=new Map()}
 addEventListener(type,listener){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(listener)}
 removeEventListener(type,listener){this.listeners.get(type)?.delete(listener)}
 dispatch(type){this.listeners.get(type)?.forEach(listener=>listener({type}))}
}

function fixture({layout='kiosk21',scrollHeight=2000,clientHeight=1000,trackHeight=800,scrollTop=0,modal=false}={}){
 const scroller=Object.assign(new EventTarget(),{scrollHeight,clientHeight,scrollTop});
 const track={hidden:true,get clientHeight(){return this.hidden?0:trackHeight}};
 const thumb={style:{}};
 const modalNode={};
 const document={
  documentElement:{dataset:{layout}},
  fonts:{ready:Promise.resolve()},
  querySelector(selector){
   if(selector==='#main.app')return scroller;
   if(selector.startsWith('#modal'))return modal?modalNode:null;
   return null
  },
  getElementById(id){
   return {main:scroller,kioskScrollIndicator:track,kioskScrollIndicatorThumb:thumb,modal:modalNode}[id]||null
  }
 };
 const frames=[];
 const view=Object.assign(new EventTarget(),{
  requestAnimationFrame(callback){frames.push(callback);return frames.length},
  cancelAnimationFrame(id){frames[id-1]=null}
 });
 const resizeInstances=[],mutationInstances=[];
 class Observer {
  constructor(callback,collection){this.callback=callback;this.targets=[];this.disconnected=false;collection.push(this)}
  observe(target){this.targets.push(target)}
  disconnect(){this.disconnected=true}
 }
 class ResizeObserver extends Observer{constructor(callback){super(callback,resizeInstances)}}
 class MutationObserver extends Observer{constructor(callback){super(callback,mutationInstances)}}
 const controller=createController({window:view,document,scroller,track,thumb,ResizeObserver,MutationObserver});
 const flush=()=>{const pending=frames.splice(0);pending.forEach(callback=>callback?.())};
 return {controller,view,document,scroller,track,thumb,frames,flush,resizeInstances,mutationInstances};
}

test('indicator DOM is static, unique, decorative, and keeps cache busting',()=>{
 assert.equal((html.match(/id="kioskScrollIndicator"/g)||[]).length,1);
 assert.equal((html.match(/id="kioskScrollIndicatorThumb"/g)||[]).length,1);
 assert.match(html,/id="kioskScrollIndicator"[^>]*aria-hidden="true"[^>]*hidden/);
 assert.match(html,/kiosk-scroll-indicator\.js\?v=kiosk-scroll-indicator-v1\.2\.11/);
 assert.match(html,/device-kiosk21\.css\?v=home-banner-layout/);
});

test('indicator styles are kiosk-only, visible, non-interactive, and do not affect horizontal layout',()=>{
 assert.match(css,/html\[data-layout="kiosk21"\] \.kiosk-scroll-indicator \{/);
 assert.match(css,/width: 20px/);
 assert.match(css,/pointer-events: none/);
 assert.match(css,/background: #e5e7eb/);
 assert.match(css,/\.kiosk-scroll-indicator-thumb \{[\s\S]*?min-width: 16px;[\s\S]*?min-height: 96px;[\s\S]*?background: #d71920/);
 assert.doesNotMatch(css,/html\[data-layout="(?:phone|tablet)"\] \.kiosk-scroll-indicator/);
 assert.match(css,/html\[data-layout="kiosk21"\] #main\.app \{[\s\S]*?overflow-x: hidden/);
});

test('non-kiosk and non-overflow layouts stay hidden',()=>{
 const phone=fixture({layout:'phone'});phone.controller.initialize();phone.flush();
 assert.equal(phone.track.hidden,true);
 const short=fixture({scrollHeight:1001,clientHeight:1000});short.controller.initialize();short.flush();
 assert.equal(short.track.hidden,true);
});

test('thumb tracks top, middle, and bottom with a 96px minimum and finite transforms',()=>{
 const f=fixture();f.controller.initialize();f.flush();
 assert.equal(f.track.hidden,false);
 assert.equal(f.thumb.style.height,'400px');
 assert.equal(f.thumb.style.transform,'translate3d(0, 0px, 0)');
 f.scroller.scrollTop=500;f.scroller.dispatch('scroll');f.flush();
 assert.equal(f.thumb.style.transform,'translate3d(0, 200px, 0)');
 f.scroller.scrollTop=1000;f.scroller.dispatch('scroll');f.flush();
 assert.equal(f.thumb.style.transform,'translate3d(0, 400px, 0)');
 const long=fixture({scrollHeight:100000,clientHeight:1000,trackHeight:500,scrollTop:Infinity});
 long.controller.initialize();long.flush();
 assert.equal(long.thumb.style.height,`${MIN_THUMB_HEIGHT}px`);
 assert.doesNotMatch(long.thumb.style.transform,/NaN|Infinity/);
});

test('thumb never exceeds the track',()=>{
 const f=fixture({scrollHeight:200,clientHeight:100,trackHeight:80});
 f.controller.initialize();f.flush();
 assert.equal(f.thumb.style.height,'80px');
 assert.equal(f.thumb.style.transform,'translate3d(0, 0px, 0)');
});

test('resize, content changes, and render scheduling are frame-coalesced',()=>{
 const f=fixture();f.controller.initialize();f.flush();
 f.view.dispatch('resize');
 f.resizeInstances[0].callback();
 f.mutationInstances[0].callback();
 f.controller.schedule();
 assert.equal(f.frames.length,1);
 f.flush();
 assert.equal(f.track.hidden,false);
});

test('initialization is idempotent and observers and listeners are registered once',()=>{
 const f=fixture();
 f.controller.initialize();f.controller.initialize();
 assert.equal(f.scroller.listeners.get('scroll').size,1);
 assert.equal(f.view.listeners.get('resize').size,1);
 assert.equal(f.view.listeners.get('orientationchange').size,1);
 assert.equal(f.resizeInstances.length,1);
 assert.equal(f.mutationInstances.length,1);
 f.controller.destroy();
 assert.equal(f.scroller.listeners.get('scroll').size,0);
 assert.equal(f.resizeInstances[0].disconnected,true);
 assert.equal(f.mutationInstances[0].disconnected,true);
});

test('modal hides the body indicator without changing the scroller position',()=>{
 const f=fixture({modal:true,scrollTop:500});
 f.controller.initialize();f.flush();
 assert.equal(f.track.hidden,true);
 assert.equal(f.scroller.scrollTop,500);
});

test('screen rendering and scroll reset schedule an indicator update',()=>{
 assert.match(html,/if\(stepChanged\)\{\s*main\.scrollTop=0;/);
 assert.match(html,/lastRenderedStep=state\.step;\s*window\.PJ_KIOSK_SCROLL_INDICATOR\?\.schedule\(\);/);
});
