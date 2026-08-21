const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createKioskPageVoiceController,routeFor,completionKey}=require('../kiosk-page-voice.js');

function harness(){
 const spoken=[],created=[],synth={cancelCount:0,cancel(){this.cancelCount++},speak(value){spoken.push(value)}};
 let lang='ko';
 const controller=createKioskPageVoiceController({synth,createUtterance:(text,options)=>{created.push({text,options});return {text,...options}},translate:(key,vars)=>key+JSON.stringify(vars),language:()=>lang,localeTags:{ko:'ko-KR',en:'en-US'}});
 return {controller,spoken,created,synth,setLanguage:value=>{lang=value},flush:()=>new Promise(resolve=>setImmediate(resolve))}
}

test('every kiosk page and logical subpage resolves to an explicit voice key',()=>{
 const cases=[['language','language'],['home','home'],['type','orderType'],['timing','timing'],['reserve','reserveTime'],['party','party'],['area','area'],['table','table'],['promo','benefit'],['setChoice','set'],['size','size'],['mode','crust'],['pizzaOptions','crust'],['pizza','pizza'],['crust','crust'],['topping','toppingPrompt'],['side','extraSide'],['drink','extraDrink'],['accompaniment','accompaniment'],['review','review'],['phone','phone'],['payment','payment']];
 for(const [step,key] of cases)assert.equal(routeFor({step}).key,key,step);
 assert.equal(routeFor({step:'pizza',secondPizza:true}).key,'secondPizza');
 assert.equal(routeFor({step:'topping',toppingSelection:true}).key,'toppingSelect');
 assert.equal(routeFor({step:'side',includedSide:true}).key,'includedSide');
 assert.equal(routeFor({step:'drink',includedDrink:true}).key,'includedDrink');
 assert.equal(routeFor({step:'phone',foreign:true}).key,'customerName');
 assert.equal(routeFor({step:'payment',paymentMethod:'cash'}).key,'submit');
 assert.equal(routeFor({step:'idle'}),null);
});

test('first touch unlock, rerender, resize-style update and modal close obey once-per-entry policy',async()=>{
 const h=harness();
 h.controller.update({step:'idle'});h.controller.update({step:'home'});
 assert.equal(h.created.length,0,'no utterance is created before unlock');
 h.controller.unlock();await h.flush();assert.equal(h.spoken.length,1);
 h.controller.update({step:'home'});h.controller.update({step:'home'});await h.flush();assert.equal(h.spoken.length,1);
 h.controller.update({step:'review'});await h.flush();assert.equal(h.spoken.length,2);
 h.controller.update({step:'review',overlay:'disposables'});await h.flush();assert.equal(h.spoken.length,3);
 h.controller.update({step:'review'});await h.flush();assert.equal(h.spoken.length,3,'closing same-step modal does not replay base guidance');
 h.controller.update({step:'phone'});await h.flush();h.controller.update({step:'review'});await h.flush();assert.equal(h.spoken.length,5,'back navigation is a new entry');
});

test('language change, cancellation and stale generations are deterministic',async()=>{
 const h=harness();h.controller.update({step:'home'});h.controller.unlock();h.controller.update({step:'timing'});await h.flush();
 assert.equal(h.spoken.length,1);assert.match(h.spoken[0].text,/voice\.timing/,'stale home utterance never speaks');
 h.setLanguage('en');h.controller.update({step:'timing'});await h.flush();assert.equal(h.spoken.length,2);assert.equal(h.spoken[1].lang,'en-US');
 h.controller.update({step:'idle'});assert.ok(h.synth.cancelCount>=3);
});

test('completion variants are separated and duplicate success renders speak once',async()=>{
 assert.equal(completionKey({}),'completeNormal');
 assert.equal(completionKey({foreign:true}),'completeForeign');
 assert.equal(completionKey({orderTiming:'reserve',reservationPaymentType:'prepaid'}),'completeReservationPrepaid');
 assert.equal(completionKey({orderTiming:'reserve',reservationPaymentType:'pay_on_pickup'}),'completeReservationPostpaid');
 assert.equal(completionKey({orderTiming:'reserve',reservationPaymentType:'prepaid',foreign:true}),'completeReservationForeignPrepaid');
 assert.equal(completionKey({orderTiming:'reserve',foreign:true}),'completeReservationForeignPostpaid');
 const h=harness();h.controller.update({step:'payment'});h.controller.unlock();await h.flush();
 h.controller.update({step:'done',completionToken:'one',orderNo:'1234'});h.controller.update({step:'done',completionToken:'one',orderNo:'1234'});await h.flush();
 assert.equal(h.spoken.filter(item=>item.text.includes('completeNormal')).length,1);
});

test('speech failure is isolated and source integration adds no order, seat, payment, admin or waiting-TV policy',async()=>{
 const controller=createKioskPageVoiceController({synth:{cancel(){},speak(){throw new Error('blocked')}},createUtterance(){throw new Error('blocked')},translate:key=>key});
 controller.update({step:'home'});assert.doesNotThrow(()=>controller.unlock());await new Promise(resolve=>setImmediate(resolve));
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8'),helper=fs.readFileSync(path.join(root,'kiosk-page-voice.js'),'utf8');
 assert.match(html,/speech\.js\?v=1/);assert.match(html,/kiosk-page-voice\.js\?v=1/);
 assert.doesNotMatch(helper,/firebase|collection\(|payment API|seat write/i);
 assert.equal(fs.readFileSync(path.join(root,'admin.js'),'utf8').includes('PJ_KIOSK_PAGE_VOICE'),false);
 assert.equal(fs.readFileSync(path.join(root,'waiting-tv/index.html'),'utf8').includes('PJ_KIOSK_PAGE_VOICE'),false);
});

test('all six locales contain the complete voice matrix and takeout-only banner copy',()=>{
 const root=path.resolve(__dirname,'..');
 for(const lang of ['ko','en','ja','zh','vi','es']){
  const source=fs.readFileSync(path.join(root,'i18n',`${lang}.js`),'utf8');
  assert.match(source,/happyHourTakeoutOnly/);assert.match(source,/happyHourDineInExclusion/);assert.match(source,/home:/);assert.match(source,/completeReservationForeignPostpaid/);assert.match(source,/inactivity:/);
 }
});
