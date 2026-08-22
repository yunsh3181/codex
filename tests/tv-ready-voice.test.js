const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const speechSource=fs.readFileSync(path.resolve(__dirname,'../speech.js'),'utf8');
const source=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv.js'),'utf8');
const PJWaitingTvLocale=require('../waiting-tv/waiting-tv-locales.js');
const spoken=[];
let soundPlays=0;
const subscriptions={};

class Utterance{
 constructor(text){this.text=text}
}

const element=()=>({innerHTML:'',textContent:'',className:'',classList:{toggle(){}},addEventListener(){}});
const context={
 console,
 Map,
 Promise,
 PJWaitingTvLocale,
 SpeechSynthesisUtterance:Utterance,
 document:{getElementById:()=>element()},
 navigator:{onLine:true},
 localStorage:{getItem:()=> 'true',setItem(){},removeItem(){}},
 window:{
  speechSynthesis:{
   getVoices:()=>[{lang:'ko-KR',name:'Korean'}],
   addEventListener(){},
   speak(utterance){
    spoken.push(utterance.text);
    queueMicrotask(()=>utterance.onend());
   }
  },
  addEventListener(){},
  setTimeout(callback,delay){if(delay===500)callback();return 1},
  AudioContext:class{constructor(){this.currentTime=0;this.destination={};this.state='suspended'}resume(){this.state='running';return Promise.resolve()}createOscillator(){return {frequency:{},connect(){},start(){soundPlays++},stop(){}}}createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}close(){this.state='closed';return Promise.resolve()}}
 },
 db:{collection(name){
  assert.ok(['publicOrderDisplays','manualCustomerCalls'].includes(name));
  return {onSnapshot(options,next){subscriptions[name]=typeof options==='function'?options:next;return ()=>{}}};
 }}
};
context.window.SpeechSynthesisUtterance=Utterance;
vm.runInNewContext(speechSource,context);
context.PJSpeech=context.window.PJSpeech;
vm.runInNewContext(source,context);

const tvNow=Date.now();
const doc=(id,orderNumber,displayStatus,updatedAt=tvNow)=>({
 id,
 data:()=>({orderNumber,displayStatus,updatedAt:{toMillis:()=>updatedAt}})
});
const emit=(...docs)=>subscriptions.publicOrderDisplays({docs});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
 emit(doc('existing-ready','1111','ready'),doc('new-order','2222','cooking'));
 await flush();
 assert.deepStrictEqual(spoken,[],'initial snapshot never speaks existing ready orders');
 await context.unlockCompletionSound();

 emit(doc('existing-ready','1111','ready'),doc('new-order','2222','ready'));
 await flush();
 assert.deepStrictEqual(spoken,[],'takeout completion does not use TTS');
 assert.strictEqual(soundPlays,2,'cooking to ready plays one two-tone completion sound');

 emit(doc('existing-ready','1111','ready'),doc('new-order','2222','ready'));
 await flush();
 assert.strictEqual(soundPlays,2,'duplicate ready snapshot does not repeat sound');

 emit(
  doc('existing-ready','1111','ready'),
  doc('new-order','2222','ready'),
  doc('third','P3333','cooking'),
  doc('fourth','4444','cooking')
 );
 emit(
  doc('existing-ready','1111','ready'),
  doc('new-order','2222','ready'),
  doc('third','P3333','ready'),
  doc('fourth','4444','ready')
 );
 await flush();
 await flush();
 assert.deepStrictEqual(spoken,[],'simultaneous completion transitions remain sound-only');
 assert.strictEqual(soundPlays,6,'simultaneous transitions play once per order');

 emit(doc('brand-new-ready','5555','ready'));
 await flush();
 assert.strictEqual(soundPlays,8,'a ready order added after initial subscription plays once');
 emit();emit(doc('brand-new-ready','5555','ready'));await flush();
 assert.strictEqual(soundPlays,8,'a temporarily excluded completion event does not replay when it reappears');

 const manualDoc=(id,orderNumber,displayStatus,announceVersion)=>({
  id,data:()=>({orderNumber,displayStatus,announceVersion,updatedAt:{toMillis:()=>Date.now()}})
 });
 subscriptions.manualCustomerCalls({docs:[manualDoc('existing','6666','ready',1)]});
 await flush();
 assert.strictEqual(spoken.length,0,'existing legacy manual ready calls are silent on TV reload');
 subscriptions.manualCustomerCalls({docs:[
  manualDoc('existing','6666','ready',1),
  manualDoc('direct','7777','ready',1)
 ]});
 await flush();
 assert.strictEqual(spoken.length,0,'customer monitor never performs TTS for a new direct-ready manual call');
 subscriptions.manualCustomerCalls({docs:[
  manualDoc('existing','6666','ready',1),
  manualDoc('direct','7777','ready',1)
 ]});
 await flush();
 assert.strictEqual(spoken.length,0,'duplicate manual snapshots stay silent');

 console.log('TV ready voice transition and duplicate-prevention checks passed');
})().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
