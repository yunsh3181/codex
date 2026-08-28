'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const i18nSource=fs.readFileSync(path.join(root,'i18n','index.js'),'utf8');

function sessionHarness(language,{tables=['A1'],firebaseOrderId=null}={}){
 const start=html.indexOf('let customerSessionEndInProgress=false;');
 const end=html.indexOf('function showSeatReservationConflict',start);
 const source=start>=0&&end>start?html.slice(start,end):'';
 assert.ok(source,'customer session helper source');
 const storage=new Map([['pj_kiosk_language',language]]);
 const calls={release:0,reset:0,render:0,voice:0,cleared:0};
 const context={
  state:{step:'payment',selectedTables:tables,firebaseOrderId},customerSessionEndInProgress:false,
  completionReturnTimer:91,clearTimeout(){calls.cleared+=1},
  isIdleResetProtected:()=>false,isKioskInactivityLayout:()=>true,defaultResetStep:()=> 'home',
  async releaseSeats(ids){calls.release+=1;assert.equal(JSON.stringify(ids),JSON.stringify(tables))},
  reset(step,options){calls.reset+=1;Object.assign(context.state,{step,selectedTables:[],firebaseOrderId:null});assert.equal(options.skipRelease,true)},
  render(){calls.render+=1},kioskPageVoice:{reset(){calls.voice+=1}},
  window:{PJ_I18N:{setLanguage(value,options){storage.set('current',value);if(options.persist)storage.set('pj_kiosk_language',value)}}},
  sessionStorage:{setItem(key,value){storage.set(key,value)}},console
 };
 vm.createContext(context);vm.runInContext(source,context);
 return {context,calls,storage}
}

for(const language of ['en','ja','zh','vi','es'])test(`customer session end resets ${language} to Korean promotions`,async()=>{
 const {context,calls,storage}=sessionHarness(language);
 await context.endCustomerSessionToStart();
 assert.equal(context.state.step,'idle');
 assert.equal(storage.get('current'),'ko');
 assert.equal(storage.get('pj_kiosk_language'),'ko');
 assert.equal(storage.get('pjLangSelected'),'1');
 assert.deepEqual(calls,{release:1,reset:1,render:1,voice:1,cleared:1});
});

test('submitted completion returns without releasing its already committed seats',async()=>{
 const {context,calls}=sessionHarness('es',{tables:['A1'],firebaseOrderId:'order-1'});
 context.state.step='done';
 await context.endCustomerSessionToStart();
 assert.equal(context.state.step,'idle');
 assert.equal(calls.release,0);
 assert.equal(calls.reset,1);
});

test('home and language are inactivity steps while idle and completion are excluded',()=>{
 const source=html.match(/function isOrderIdleStep\(\)\{[^\n]+\}/)?.[0];
 const context={state:{step:'home'}};vm.createContext(context);vm.runInContext(source,context);
 for(const step of ['home','language','payment']){context.state.step=step;assert.equal(context.isOrderIdleStep(),true,step)}
 for(const step of ['idle','done','testDone']){context.state.step=step;assert.equal(context.isOrderIdleStep(),false,step)}
});

test('kiosk boot ignores stale saved and query locales and persists Korean',()=>{
 const stored=new Map([['pj_kiosk_language','ja']]);
 const document={documentElement:{dataset:{layout:'kiosk21'},lang:'ja'},title:''};
 const context={window:{PJ_I18N_LOCALES:{ko:{meta:{htmlLang:'ko',title:'한국어'}}}},document,location:{search:'?lang=es'},URLSearchParams,localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},Set};
 vm.createContext(context);vm.runInContext(i18nSource,context);
 assert.equal(context.window.PJ_I18N.currentLanguage(),'ko');
 assert.equal(document.documentElement.lang,'ko');
 assert.equal(stored.get('pj_kiosk_language'),'ko');
});
