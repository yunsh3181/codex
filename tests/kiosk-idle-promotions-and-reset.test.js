'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ui=fs.readFileSync(path.join(root,'i18n/ui.js'),'utf8');

function timeContext(){
 const source=html.match(/function seoulSecondsOfDay[\s\S]*?function eligibleIdlePromotions\(now=new Date\(\)\)\{[^\n]+\}/)?.[0];
 assert.ok(source,'idle Seoul-time helpers are present');
 const context={Intl,Date,IDLE_PROMOTIONS:[{id:'set-menu',scheduled:false},{id:'happy-hour',scheduled:true}],failedIdlePromotions:new Set()};
 vm.createContext(context);vm.runInContext(source,context);return context
}

test('happy-hour promotion uses exact Asia/Seoul boundaries independent of host timezone',()=>{
 const context=timeContext();
 const visible=iso=>vm.runInContext(`isIdleHappyHourVisible(new Date('${iso}'))`,context);
 assert.equal(visible('2026-08-05T06:59:59Z'),false);
 assert.equal(visible('2026-08-05T07:00:00Z'),true);
 assert.equal(visible('2026-08-05T10:59:59Z'),true);
 assert.equal(visible('2026-08-05T11:00:00Z'),false);
});

test('set menu is always eligible and happy hour is the only scheduled candidate',()=>{
 const context=timeContext();
 const ids=iso=>JSON.parse(vm.runInContext(`JSON.stringify(eligibleIdlePromotions(new Date('${iso}')).map(item=>item.id))`,context));
 assert.deepEqual(ids('2026-08-05T06:59:59Z'),['set-menu']);
 assert.deepEqual(ids('2026-08-05T07:00:00Z'),['set-menu','happy-hour']);
 assert.deepEqual(ids('2026-08-05T11:00:00Z'),['set-menu']);
});

test('idle screen contains safe images, fallback, image-frame overlay CTA, and live reevaluation',()=>{
 for(const file of ['kiosk-pick-set-menu.jpg','kiosk-happy-hour-regular-15000.jpg'])assert.equal(fs.existsSync(path.join(root,'assets/images/kiosk-promotions',file)),true,file);
 assert.match(html,/\.kioskIdleSlide\{[^}]*object-fit:contain/);
 assert.match(html,/body\[data-step="idle"\] \.app\{[^}]*padding:0!important[^}]*height:100dvh[^}]*overflow:hidden!important/);
 assert.match(html,/class="kioskIdleFallback" hidden/);
 assert.match(html,/class="kioskIdleFrame"/);
 assert.match(html,/class="kioskIdleFrame" onclick="startOrderFromIdle\(\)"/);
 assert.match(html,/type="button" class="kioskIdleStart"/);
 assert.match(html,/onclick="event\.stopPropagation\(\);startOrderFromIdle\(\)"/);
 assert.match(html,/min-height:104px/);
 assert.match(html,/html\[data-layout="kiosk21"\] \.kioskIdleFrame\{[^}]*height:100%[^}]*overflow:hidden/);
 assert.match(html,/html\[data-layout="kiosk21"\] \.kioskIdleControls\{[^}]*position:absolute[^}]*bottom:var\(--idle-cta-bottom\)[^}]*width:58%/);
 assert.match(html,/html\[data-layout="kiosk21"\] \.kioskIdleStart\{[^}]*min-height:110px/);
 assert.match(html,/data-active-promotion="happy-hour"\]\{--idle-cta-bottom:5\.5%/);
 assert.match(html,/\.kioskIdleFrame\{--idle-cta-bottom:6\.5%/);
 assert.match(html,/frame\.dataset\.activePromotion=active\?\.id\|\|'fallback'/);
 assert.doesNotMatch(html,/html\[data-layout="kiosk21"\] \.kioskIdleScreen\{[^}]*grid-template-rows/);
 assert.match(html,/idleEligibilityTimer=setInterval\(\(\)=>applyIdlePromotionEligibility\(new Date\(\)\),1000\)/);
 assert.match(html,/document\.hidden\)stopIdlePromotionTimers/);
});

test('original promotion image bytes remain unchanged',()=>{
 const expected={
  'kiosk-pick-set-menu.jpg':'fae456d5b9aebc7fae14d2888f9d1c9b5fb88914c6591826946d50dfe968168f',
  'kiosk-happy-hour-regular-15000.jpg':'bdadf7d7518863baf538d65050d0761efd8c85956ee9ac768974fbf4e3dc8633'
 };
 for(const [file,hash] of Object.entries(expected))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'assets/images/kiosk-promotions',file))).digest('hex'),hash,file);
});

test('start-order handler locks before async cleanup and ignores a rapid second activation',async()=>{
 const source=html.match(/async function startOrderFromIdle\(\)\{[\s\S]*?\n\}/)?.[0];
 assert.ok(source,'start-order handler source');
 let releases=0,resets=0,renders=0,resolveRelease;
 const releaseGate=new Promise(resolve=>{resolveRelease=resolve});
 const button={disabled:false};
 const context={idleStartLocked:false,state:{selectedTables:new Set(['A1']),firebaseOrderId:null},document:{querySelector(){return button}},async releaseSeats(){releases+=1;await releaseGate},reset(){resets+=1},render(){renders+=1},guardIdleStartTransition(){context.idleStartLocked=false},console};
 vm.createContext(context);vm.runInContext(source,context);
 const first=context.startOrderFromIdle();
 const second=context.startOrderFromIdle();
 assert.equal(releases,1);assert.equal(button.disabled,true);
 resolveRelease();await Promise.all([first,second]);
 assert.deepEqual({releases,resets,renders},{releases:1,resets:1,renders:1});
});

test('idle transition installs a short click shield before unlocking the new screen',()=>{
 assert.match(html,/\.kioskIdleClickShield\{position:fixed;inset:0;z-index:99999/);
 assert.match(html,/function guardIdleStartTransition\(\)\{[\s\S]*?document\.body\.append\(shield\)[\s\S]*?setTimeout\(\(\)=>\{shield\.remove\(\);idleStartLocked=false\},800\)/);
 assert.match(html,/reset\('home',\{skipRelease:true\}\);render\(\);guardIdleStartTransition\(\)/);
});

test('idle translations use a fresh cache key without changing unrelated assets',()=>{
 assert.match(html,/<script src="i18n\/ui\.js\?v=52"><\/script>/);
 assert.doesNotMatch(html,/<script src="i18n\/ui\.js\?v=51"><\/script>/);
 assert.equal((html.match(/i18n\/ui\.js\?v=/g)||[]).length,1);
 assert.match(html,/<script src="i18n\/index\.js\?v=44\.2"><\/script>/);
 assert.match(html,/<script src="bottle-seat-policy\.js\?v=1"><\/script>/);
 assert.match(html,/<link rel="stylesheet" href="styles\/device-kiosk21\.css\?v=order-review-single-screen-v17">/);
});

test('central idle controller ignores programmatic events and protects persistence',()=>{
 assert.match(html,/function recordOrderActivity\(event\)\{[\s\S]*?event&&event\.isTrusted===false[\s\S]*?armOrderIdleTimer\(\)/);
 assert.match(html,/function isIdleResetProtected\(\)\{return mobileOrderSubmitting\|\|seatOrderCommitStarted\|\|Boolean\(state\.firebaseOrderId\)\}/);
 assert.match(html,/if\(idleResetInProgress\|\|!isOrderIdleStep\(\)\)return/);
 assert.match(html,/const heldSeats=\[\.\.\.state\.selectedTables\]/);
 assert.match(html,/if\(heldSeats\.length\)await releaseSeats\(heldSeats\)/);
  assert.doesNotMatch(html,/onSnapshot\([\s\S]{0,300}armOrderIdleTimer/);
  assert.doesNotMatch(html,/\['pointerdown','touchstart','keydown','wheel','scroll'/);
  assert.match(html,/\['pointerdown','touchstart','keydown','wheel','click','input'\]/);
});

test('central idle controller runs once across order steps and pauses while protected',async()=>{
 assert.match(html,/const generation=orderIdleGeneration;orderIdleDeadline=orderIdleNow\(\)\+SEAT_IDLE_MS/);
 assert.match(html,/seatIdleTimer=setTimeout\(\(\)=>expireOrderIdle\(generation\),SEAT_IDLE_MS\)/);
 assert.match(html,/orderIdleCountdownTimer=setTimeout\(\(\)=>scheduleOrderIdleCountdown\(generation\),SEAT_IDLE_MS-ORDER_IDLE_WARNING_MS\)/);
 assert.match(html,/if\(generation!==orderIdleGeneration\)return/);
 assert.match(html,/if\(isIdleResetProtected\(\)\)\{stopOrderIdleTimers\(\);return\}/);
});

test('start-order copy exists in all supported locales',()=>{
 for(const language of ['ko','en','ja','zh','vi','es'])assert.match(ui,new RegExp(`${language}:\\{startOrder:`));
});

test('kiosk21 always boots and resets to idle while other layouts keep their policy',()=>{
 assert.match(html,/function initialStep\(\)\{return isKioskInactivityLayout\(\)\?'idle':\(sessionStorage\.getItem\('pjLangSelected'\)\?'idle':'language'\)\}/);
 assert.match(html,/function defaultResetStep\(\)\{return isKioskInactivityLayout\(\)\?'idle':'home'\}/);
 assert.match(html,/const state=\{step:initialStep\(\)/);
 assert.match(html,/function reset\(targetStep=defaultResetStep\(\),options=\{\}\)/);
 assert.match(html,/reset\('home',\{skipRelease:true\}\);render\(\);guardIdleStartTransition\(\)/);
});

test('unknown kiosk steps use the canonical safe reset path to idle',()=>{
 assert.match(html,/const KIOSK_VALID_STEPS=new Set\(\[\.\.\.flow,\.\.\.KIOSK_SPECIAL_STEPS\]\)/);
 assert.match(html,/function recoverUnknownKioskStep\(\)\{[\s\S]*?if\(!isKioskInactivityLayout\(\)\|\|KIOSK_VALID_STEPS\.has\(state\.step\)\)return false;[\s\S]*?if\(isIdleResetProtected\(\)\)return false;[\s\S]*?reset\('idle'\)/);
 assert.match(html,/function render\(\)\{\n recoverUnknownKioskStep\(\)/);
});

test('every runtime step extracted from the application is registered exactly once',()=>{
 const arrayValues=name=>{
  const body=html.match(new RegExp(`const ${name}=\\[([^;]+)\\]`))?.[1];
  assert.ok(body,`${name} declaration`);
  return [...body.matchAll(/'([^']+)'/g)].map(match=>match[1])
 };
 const registered=[...arrayValues('flow'),...arrayValues('KIOSK_SPECIAL_STEPS')];
 const expected=['language','idle','home','type','timing','promo','size','mode','pizzaOptions','pizza','crust','topping','side','drink','accompaniment','review','phone','payment','party','area','table','reserve','setChoice','done','testDone'];
 assert.deepEqual([...new Set(registered)].sort(),[...expected].sort());
 assert.equal(registered.length,new Set(registered).size,'valid steps must not be duplicated');
 const referenced=new Set([...html.matchAll(/state\.step\s*(?:===|!==|=)\s*'([^']+)'/g)].map(match=>match[1]));
 for(const step of referenced)assert.ok(registered.includes(step),`unregistered runtime step: ${step}`)
});

test('all terminal home actions reuse reset and therefore return kiosk21 to idle',()=>{
 assert.match(html,/class="doneHomeBtn" onclick="reset\(\);render\(\)"/);
 assert.match(html,/setTimeout\(\(\)=>\{reset\(\);render\(\)\},5000\)/);
 assert.match(html,/class="prev" onclick="reset\(\);render\(\)"/);
 assert.match(html,/function confirmSeatReservationConflict\(\)\{reset\(\)/);
 assert.match(html,/function confirmBottleHoursConflict\(\)\{[^}]*reset\(\)/);
});
