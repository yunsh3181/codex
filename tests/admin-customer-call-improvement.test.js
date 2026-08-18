const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const digitSource=source.match(/const KOREAN_DIGIT_SPEECH[\s\S]*?\n}/)?.[0];
const voiceSource=source.slice(source.indexOf('let speechQueue=Promise.resolve();'),source.indexOf('let announcementQueue=Promise.resolve();'));
assert.ok(digitSource&&voiceSource,'production number and voice functions are available');

const numberContext={String,Number,Object};vm.createContext(numberContext);vm.runInContext(digitSource,numberContext);
const numbers=[[0,'영'],[1,'일'],[9,'구'],[10,'십'],[11,'십일'],[20,'이십'],[99,'구십구'],[100,'백'],[101,'백일'],[110,'백십'],[111,'백십일'],[999,'구백구십구'],[1000,'천'],[1001,'천일'],[1010,'천십'],[1100,'천백'],[3181,'삼천백팔십일'],[4324,'사천삼백이십사'],[9009,'구천구'],[9090,'구천구십'],[9999,'구천구백구십구']];
for(const [input,expected] of numbers)assert.strictEqual(numberContext.spokenKoreanOrderNumber(input),expected,`${input} speaks naturally`);
for(const invalid of [null,undefined,'',NaN,Infinity,-1,10000,'12.3','abc'])assert.strictEqual(numberContext.spokenKoreanOrderNumber(invalid),'');

function runtime(initialVoices=[],stored=null){
 let voices=initialVoices.slice(),now=0,nextTimer=1,cancelCount=0,speakCount=0,active=0,maxActive=0;const actions=[];
 const timers=new Map(),storage=new Map(stored?[['pjAdminCustomerCallVoice',JSON.stringify(stored)]]:[]),spoken=[];
 const elements=new Map();
 class Element{constructor(){this.value='';this.textContent='';this.disabled=false;this.children=[];this.listeners={}}replaceChildren(){this.children=[]}append(child){this.children.push(child);if(child.selected)this.value=child.value}addEventListener(type,fn){(this.listeners[type]??=[]).push(fn)}dispatch(type){for(const fn of this.listeners[type]||[])fn({target:this})}}
 for(const id of ['adminVoiceSelect','adminVoiceCurrent','adminVoiceStatus','adminVoicePreview'])elements.set(id,new Element());
 const synthListeners=new Set();
 const synth={getVoices:()=>voices,addEventListener(type,fn){if(type==='voiceschanged')synthListeners.add(fn)},removeEventListener(type,fn){if(type==='voiceschanged')synthListeners.delete(fn)},dispatch(){for(const fn of [...synthListeners])fn()},cancel(){actions.push('cancel');cancelCount++;active=0},speak(utterance){actions.push('speak');speakCount++;active++;maxActive=Math.max(maxActive,active);spoken.push(utterance);queueMicrotask(()=>{active--;utterance.onend?.()})}};
 const context={String,Number,Object,Map,Set,Promise,console:{info(){},warn(){},error(){}},document:{getElementById:id=>elements.get(id),createElement:()=>({})},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},window:{speechSynthesis:synth},soundEnabled:true,settings:{voice:true},playPreset:async()=>{},wait:async()=>{},PJSpeech:{createSpeechUtterance(text,{lang='ko-KR'}={}){return {text,lang,rate:.92,pitch:1.05,volume:1,voice:null}}},spokenOrderNumber:value=>String(value).replace(/^[PD](?=\d)/i,''),setTimeout(fn,delay){const id=nextTimer++;timers.set(id,{fn,at:now+delay});return id},clearTimeout:id=>timers.delete(id)};
 vm.createContext(context);vm.runInContext(`${digitSource}\n${voiceSource}`,context);
 async function advance(ms){const end=now+ms;while(true){const due=[...timers].filter(([,timer])=>timer.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;timers.delete(due[0]);now=due[1].at;due[1].fn();await Promise.resolve()}now=end;await Promise.resolve()}
 return {context,elements,synth,spoken,storage,actions,advance,setVoices(value){voices=value.slice()},stats:()=>({cancelCount,speakCount,maxActive,listeners:synthListeners.size,timers:timers.size})}
}
const ko=(name,localService=true)=>({name,lang:'ko-KR',localService});
for(const [voices,expected] of [
 [[ko('Microsoft SunHi'),ko('Microsoft Heami')],'Microsoft SunHi'],
 [[ko('Microsoft Heami'),ko('Microsoft Seoyeon')],'Microsoft Heami'],
 [[ko('Microsoft Seoyeon'),ko('Generic Korean')],'Microsoft Seoyeon'],
 [[{name:'SunHi English',lang:'en-US'},ko('Microsoft Heami')],'Microsoft Heami']
]){const app=runtime(voices);assert.strictEqual(app.context.selectAdminKoreanVoice(voices).name,expected)}

const preferred=ko('Microsoft SunHi',false),saved=ko('My Korean Voice');
let app=runtime([preferred,saved],{name:saved.name,lang:saved.lang});
assert.strictEqual(app.context.selectAdminKoreanVoice([preferred,saved]).name,saved.name,'stored voice restores');
app=runtime([preferred],{name:saved.name,lang:saved.lang});
assert.strictEqual(app.context.selectAdminKoreanVoice([preferred]).name,preferred.name,'missing stored voice recovers');
assert.strictEqual(app.context.uniqueAdminVoices([ko('Same',false),ko('Same',true)]).length,1,'name/lang duplicates collapse');

(async()=>{
 app=runtime([]);
 assert.strictEqual(app.stats().listeners,1,'only permanent voiceschanged listener exists initially');
 const pending=app.context.prepareAdminCustomerCallVoice();
 assert.strictEqual(app.stats().listeners,2,'one temporary preparation listener is attached');
 assert.strictEqual(app.context.prepareAdminCustomerCallVoice(),pending,'concurrent callers share one preparation promise');
 app.setVoices([preferred]);app.synth.dispatch();
 assert.strictEqual((await pending).name,preferred.name);
 assert.strictEqual(app.stats().listeners,1,'temporary listener is cleaned');
 app.synth.dispatch();app.synth.dispatch();
 assert.strictEqual(app.elements.get('adminVoiceSelect').children.length,1,'repeated events do not duplicate options');

 const fallback=runtime([]),fallbackCall=fallback.context.speakCustomerCall('3181','ko');
 await fallback.advance(1400);await fallbackCall;assert.strictEqual(fallback.spoken[0].voice,null,'1.4 second deadline uses browser default');
 assert.strictEqual(fallback.stats().listeners,1);await fallback.advance(1600);assert.strictEqual(fallback.stats().timers,0,'preparation and bounded page-load timers are cleaned');

 const selector=runtime([preferred,saved]);
 selector.elements.get('adminVoiceSelect').value=selector.context.adminVoiceKey(saved);selector.elements.get('adminVoiceSelect').dispatch('change');
 assert.deepStrictEqual(JSON.parse(selector.storage.get('pjAdminCustomerCallVoice')),{name:saved.name,lang:saved.lang});
 const reload=runtime([preferred,saved],JSON.parse(selector.storage.get('pjAdminCustomerCallVoice')));
 assert.strictEqual(reload.context.selectAdminKoreanVoice([preferred,saved]).name,saved.name,'reload restores selection');

 const calls=runtime([saved],{name:saved.name,lang:saved.lang});
 await calls.context.speakCustomerCall('9999','ko');
 await calls.context.speakCustomerCall('3181','ko');
 await calls.context.speakCustomerCall('4324','ko');
 assert.deepStrictEqual(calls.spoken.map(item=>item.text),['구천구백구십구 번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터에서 받아가 주세요.','삼천백팔십일 번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터에서 받아가 주세요.','사천삼백이십사 번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터에서 받아가 주세요.']);
 calls.elements.get('adminVoicePreview').dispatch('click');await new Promise(resolve=>setImmediate(resolve));
 const utterances=calls.spoken;assert.ok(utterances.length>=4,'preview executes production customer-call path');
 for(const utterance of utterances){assert.strictEqual(utterance.voice.name,saved.name);assert.deepStrictEqual([utterance.rate,utterance.pitch,utterance.volume],[.94,1.08,1])}
 assert.strictEqual(calls.stats().cancelCount,0,'customer calls never cancel an active sentence');
 const rapid=[calls.context.enqueueCustomerCall('3181','ko'),calls.context.enqueueCustomerCall('4324','ko')];await Promise.all(rapid);
 assert.strictEqual(calls.stats().maxActive,1,'rapid calls never overlap');
 assert.match(calls.elements.get('adminVoiceCurrent').textContent,/My Korean Voice · ko-KR · 기기/);

 const one=runtime([saved]);assert.match(one.elements.get('adminVoiceStatus').textContent,/한국어 음성이 1개뿐입니다/);
 const none=runtime([{name:'English',lang:'en-US'}]);assert.match(none.elements.get('adminVoiceStatus').textContent,/한국어 음성을 찾을 수 없음/);
 console.log('admin production voice runtime and complete natural-number checks passed');
})().catch(error=>{console.error(error);process.exitCode=1});
