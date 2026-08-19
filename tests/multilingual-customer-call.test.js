const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const rules=fs.readFileSync(path.join(root,'firestore.rules'),'utf8');
const customerIdentity=require('../customer-identity');

const languageHelper=html.match(/function mobileOrderLanguage\(\)[\s\S]*?\n}/)?.[0];
assert.ok(languageHelper,'mobile order language normalizer exists');
const orderLanguageCases=[['ko','ko'],['ko-KR','ko'],['en','en'],['en-US','en'],['es','es'],['es-ES','es'],['ja','ja'],['ja-JP','ja'],['zh','zh'],['zh-CN','zh'],['zh-Hans','zh'],['zh-Hans-CN','zh'],['vi','vi'],['vi-VN','vi'],['zh-TW','ko'],['zh-HK','ko'],['zh-Hant','ko'],['zh-Hant-TW','ko'],[undefined,'ko'],['','ko'],['fr','ko'],['de','ko'],['unknown','ko']];
for(const [input,expected] of orderLanguageCases){
 const context={window:{PJ_I18N:{currentLanguage:()=>input}}};
 vm.createContext(context);
 vm.runInContext(languageHelper,context);
 assert.strictEqual(context.mobileOrderLanguage(),expected,`${String(input)} normalizes to ${expected}`);
}
assert.ok(html.includes('orderNo:orderNumber,customerNumber:orderNumber')&&html.includes('language,...identity'),'normalized language and customer identity are included without using the document ID');

const payloadHelper=html.match(/function buildMobileOrderPayload\(\)[\s\S]*?\n}/)?.[0];
assert.ok(payloadHelper,'mobile order payload builder exists');
function buildPayloadForLanguage(language){
 const context={
  window:{PJ_I18N:{currentLanguage:()=>language},PJCustomerIdentity:customerIdentity},String,Date,
  state:{left:null,right:null,cartItems:[],orderType:'takeout',partySize:null,selectedTables:[],diningArea:null,reserveTime:null,orderTiming:'now',promo:null,paymentMethod:'card',splitCount:1,phone:'12345678',customerDisplayName:'Alex',orderNo:null},
  po:()=>null,currentOrderTotal:()=>0,cartTotal:()=>0,currentHasItems:()=>false,
  displayOrderNo:()=>`P${context.state.phone.slice(-4)}`,mobilePhoneFull:()=>`010${context.state.phone}`,mobileMaskedPhone:()=>`010-****-${context.state.phone.slice(-4)}`,last4:()=>context.state.phone.slice(-4),
  localStorage:{getItem:()=>null},reviewTotals:()=>({normal:0,discount:0}),paymentName:()=>'',isSplitPayment:()=>false,splitParts:()=>[],
  firebase:{firestore:{FieldValue:{serverTimestamp:()=>({serverTimestamp:true})}}}
 };
 vm.createContext(context);
 context.mobileCustomerIdentity=()=>customerIdentity.identityFor({language,phoneLast4:'5678',name:'Alex'});
 context.generatedForeignOrderNo=()=> 'P0001';
 vm.runInContext(`${languageHelper}\n${payloadHelper}`,context);
 return context.buildMobileOrderPayload();
}
for(const [input,expected] of [['ko','ko'],['en','en'],['es','es'],['ja','ja'],['ja-JP','ja'],['zh','zh'],['zh-CN','zh'],['vi','vi'],['vi-VN','vi']])assert.strictEqual(buildPayloadForLanguage(input).language,expected,`${input} payload stores ${expected}`);

assert.ok(rules.includes("'phoneLast4','language','customerIdentityType','customerDisplayName','orderType'"),'language and customer identity are allowed order fields');
assert.ok(rules.includes("!request.resource.data.keys().hasAny(['language'])"),'orders without language remain compatible');
const allowedRuleLanguages=rules.match(/request\.resource\.data\.language in \[([^\]]+)]/)?.[1].match(/[a-z]+/g)||[];
assert.deepStrictEqual(allowedRuleLanguages,['ko','en','es','ja','zh','vi'],'only supported short language codes are accepted when present');
for(const language of ['ko','en','es','ja','zh','vi'])assert.ok(allowedRuleLanguages.includes(language),`${language} is accepted by order rules`);
for(const language of ['ja-JP','zh-CN','unknown'])assert.ok(!allowedRuleLanguages.includes(language),`${language} is rejected as a direct stored value`);

const digitHelperSource=admin.match(/const KOREAN_DIGIT_SPEECH[\s\S]*?\n}/)?.[0];
const helperSource=`${digitHelperSource}\n${admin.match(/function customerCallLanguage[\s\S]*?\nfunction enqueueCustomerCall[^\n]*/)?.[0]}`;
assert.ok(helperSource,'customer call speech helpers exist');
const spoken=[];
const voices=[{lang:'en-GB',name:'English'},{lang:'es-MX',name:'Spanish'},{lang:'ko-KR',name:'Korean'},{lang:'ja-JP',name:'Japanese'},{lang:'zh-CN',name:'Chinese'},{lang:'vi-VN',name:'Vietnamese'}];
function Utterance(text){this.text=text}
const context={String,Number,Object,Promise,console:{info(){}},adminKoreanVoice:null,ADMIN_CALL_SPEECH_SETTINGS:{rate:.94,pitch:1.08,volume:1},prepareAdminCustomerCallVoice:async()=>voices.find(voice=>voice.lang==='ko-KR'),PJSpeech:{createSpeechUtterance(text,{lang='ko-KR'}={}){const utterance=new Utterance(text);utterance.lang=lang;utterance.rate=.92;utterance.pitch=1.05;utterance.volume=1;utterance.voice=voices.find(candidate=>candidate.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));return utterance}},spokenOrderNumber:value=>String(value).replace(/^[PD](?=\d{4}$)/,''),soundEnabled:true,settings:{voice:true},speechQueue:Promise.resolve(),window:{speechSynthesis:{getVoices:()=>voices,cancel(){},speak(utterance){spoken.push(utterance);utterance.onend()}}}};
vm.createContext(context);
vm.runInContext(helperSource,context);
for(const [language,expected] of [['ko','ko'],['ko-KR','ko'],['en','en'],['en-US','en'],['es','es'],['es-ES','es'],['ja','ja'],['ja-JP','ja'],['JA-jp','ja'],['zh','zh'],['zh-CN','zh'],['zh-Hans','zh'],['zh-Hans-CN','zh'],['ZH_hans_cn','zh'],['vi','vi'],['vi-VN','vi'],[undefined,'ko'],[null,'ko'],['','ko'],['fr','ko'],['de','ko'],['unknown','ko'],['zh-TW','ko'],['zh-HK','ko'],['zh-Hant','ko'],['zh-Hant-TW','ko']])assert.strictEqual(context.customerCallLanguage(language),expected);
const cases=[
 ['P1234','en','Customer number 1234, your order is ready. Please come to the counter.','en-US','en-GB'],
 ['D5678','es','Cliente número 5678, su pedido está listo. Por favor, acérquese al mostrador.','es-ES','es-MX'],
 ['P9012','ko','구천십이 번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터에서 받아가 주세요.','ko-KR','ko-KR'],
 ['P3456',undefined,'삼천사백오십육 번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터에서 받아가 주세요.','ko-KR','ko-KR'],
 ['P1234','ja','お客様番号1234番、ご注文の商品ができあがりました。カウンターまでお越しください。','ja-JP','ja-JP'],
 ['D2345','ja-JP','お客様番号2345番、ご注文の商品ができあがりました。カウンターまでお越しください。','ja-JP','ja-JP'],
 ['P3456','zh','号码为3456的顾客，您的餐品已经准备好了，请到柜台取餐。','zh-CN','zh-CN'],
 ['D4567','zh-CN','号码为4567的顾客，您的餐品已经准备好了，请到柜台取餐。','zh-CN','zh-CN'],
 ['D4568','vi','Khách hàng số 4568, món ăn của quý khách đã sẵn sàng. Vui lòng nhận tại quầy.','vi-VN','vi-VN'],
 ['D7890','zh-TW','칠천팔백구십 번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터에서 받아가 주세요.','ko-KR','ko-KR']
];
(async()=>{
 for(const [number,language,text,lang,voiceLang] of cases){
  await context.speakCustomerCall(number,language);
  const utterance=spoken.at(-1);
  assert.strictEqual(utterance.text,text);
  assert.strictEqual(utterance.lang,lang);
  assert.strictEqual(utterance.voice.lang,voiceLang);
  assert.deepStrictEqual([utterance.rate,utterance.pitch,utterance.volume],[.94,1.08,1]);
 }
 assert.ok(admin.includes("order.customerNumber||order.orderNo||''"),'customerNumber remains ahead of orderNo');
 assert.ok(admin.includes('data-order-language="${esc(order.language||\'\')}"'),'call button preserves the Firestore order language');
 assert.ok(admin.includes("callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage,button.dataset.customerName,button.dataset.customerIdentityType)"),'call button passes the stored language and identity');
 assert.ok(admin.includes('function callCustomer(orderNo,language,customerDisplayName,identityType){return enqueueCustomerCall(orderNo,language,customerDisplayName,identityType)}'),'manual calls use the shared FIFO queue');
assert.ok(admin.includes('if(status===\'ready\')enqueueAutomaticTakeoutCall(committedOrder)'),'successful ready transaction uses the automatic-call guard');
 assert.ok(!admin.includes('고객님 주문 조리가 완료되었습니다.'),'the Korean-only completion announcement is removed');
 assert.ok(!helperSource.includes('female'),'customer call does not force a gendered voice');
 console.log('multilingual order language, compatible rules, and customer call speech passed');
})().catch(error=>{console.error(error);process.exitCode=1});
