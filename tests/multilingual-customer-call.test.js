const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');

const languageHelper=html.match(/function mobileOrderLanguage\(\)[\s\S]*?\n}/)?.[0];
assert.ok(languageHelper,'mobile order language normalizer exists');
for(const [input,expected] of [['ko','ko'],['en','en'],['es','es'],['ja','ko'],['zh','ko'],['vi','ko'],[undefined,'ko'],['fr','ko']]){
 const context={window:{PJ_I18N:{currentLanguage:()=>input}}};
 vm.createContext(context);
 vm.runInContext(languageHelper,context);
 assert.strictEqual(context.mobileOrderLanguage(),expected,`${String(input)} normalizes to ${expected}`);
}
assert.ok(/orderNo:displayOrderNo\(\),customerNumber:displayOrderNo\(\),phone:mobilePhoneFull\(\),\n  language:mobileOrderLanguage\(\),/.test(html),'normalized language is included without changing the existing order-number fields');

assert.ok(rules.includes("'phoneLast4','language','orderType'"),'language is an allowed order field');
assert.ok(rules.includes("!request.resource.data.keys().hasAny(['language'])"),'orders without language remain compatible');
assert.ok(rules.includes("request.resource.data.language in ['ko','en','es']"),'only supported short language codes are accepted when present');

const helperSource=admin.match(/function customerCallLanguage[\s\S]*?\nfunction enqueueCustomerCall[^\n]*/)?.[0];
assert.ok(helperSource,'customer call speech helpers exist');
const spoken=[];
const voices=[{lang:'en-GB',name:'English'},{lang:'es-MX',name:'Spanish'},{lang:'ko-KR',name:'Korean'}];
function Utterance(text){this.text=text}
const context={String,Promise,SpeechSynthesisUtterance:Utterance,soundEnabled:true,settings:{voice:true},speechQueue:Promise.resolve(),window:{speechSynthesis:{getVoices:()=>voices,speak(utterance){spoken.push(utterance);utterance.onend()}}}};
vm.createContext(context);
vm.runInContext(helperSource,context);
for(const [language,expected] of [['ko','ko'],['ko-KR','ko'],['en','en'],['en-US','en'],['es','es'],['es-ES','es'],[undefined,'ko'],['ja','ko']])assert.strictEqual(context.customerCallLanguage(language),expected);
const cases=[
 ['12','ko','12번 고객님, 주문하신 메뉴가 준비되었습니다.','ko-KR','ko-KR'],
 ['34','en','Customer number 34, your order is ready.','en-US','en-GB'],
 ['56','es','Cliente número 56, su pedido está listo.','es-ES','es-MX'],
 ['78',undefined,'78번 고객님, 주문하신 메뉴가 준비되었습니다.','ko-KR','ko-KR']
];
(async()=>{
 for(const [number,language,text,lang,voiceLang] of cases){
  await context.speakCustomerCall(number,language);
  const utterance=spoken.at(-1);
  assert.strictEqual(utterance.text,text);
  assert.strictEqual(utterance.lang,lang);
  assert.strictEqual(utterance.voice.lang,voiceLang);
  assert.deepStrictEqual([utterance.rate,utterance.pitch,utterance.volume],[1,1,1]);
 }
 assert.ok(admin.includes("order.customerNumber||order.orderNo||''"),'customerNumber remains ahead of orderNo');
 assert.ok(admin.includes("callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage)"),'call button passes the stored order language');
 assert.ok(!helperSource.includes('female'),'customer call does not force a gendered voice');
 console.log('multilingual order language, compatible rules, and customer call speech passed');
})().catch(error=>{console.error(error);process.exitCode=1});
