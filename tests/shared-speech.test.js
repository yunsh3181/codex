const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'speech.js'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const tv=fs.readFileSync(path.join(root,'waiting-tv/waiting-tv.js'),'utf8');
const adminHtml=fs.readFileSync(path.join(root,'admin/index.html'),'utf8');
const tvHtml=fs.readFileSync(path.join(root,'waiting-tv/index.html'),'utf8');
let voices=[];
let voicesChanged;
class Utterance{constructor(text){this.text=text}}
const context={
 console:{info(){}},
 window:{
  SpeechSynthesisUtterance:Utterance,
  speechSynthesis:{
   getVoices:()=>voices,
   addEventListener(event,handler){if(event==='voiceschanged')voicesChanged=handler}
  }
 }
};
vm.runInNewContext(source,context);
const speech=context.window.PJSpeech;

assert.ok(voicesChanged,'asynchronously loaded browser voices are observed');
voices=[
 {name:'Microsoft InJoon Korean',lang:'ko-KR'},
 {name:'Microsoft Heami Korean',lang:'ko-KR'},
 {name:'Microsoft SunHi Korean',lang:'ko-KR'}
];
voicesChanged();
assert.strictEqual(speech.getPreferredKoreanVoice().name,'Microsoft SunHi Korean');
const adminUtterance=speech.createSpeechUtterance('관리자 안내');
const tvUtterance=speech.createSpeechUtterance('고객 TV 안내');
assert.strictEqual(adminUtterance.voice.name,tvUtterance.voice.name,'admin and TV select the same voice');
for(const utterance of [adminUtterance,tvUtterance]){
 assert.deepStrictEqual(
  [utterance.lang,utterance.rate,utterance.pitch,utterance.volume],
  ['ko-KR',.92,1.05,1]
 );
}

assert.ok(adminHtml.includes('../speech.js?v=1'));
assert.ok(tvHtml.includes('../speech.js?v=1'));
assert.ok(admin.includes('PJSpeech.createSpeechUtterance(text)'));
assert.ok(admin.includes('PJSpeech.createSpeechUtterance(speech.text,{lang:speech.lang})'));
assert.ok(tv.includes('PJSpeech.createSpeechUtterance(`${spokenOrderNumber(orderNumber)}번 고객님, 주문이 준비되었습니다.`)'));
assert.ok(!admin.includes('new SpeechSynthesisUtterance'));
assert.ok(!tv.includes('new SpeechSynthesisUtterance'));
console.log('shared speech voice priority and settings checks passed');
