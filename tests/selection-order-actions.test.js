const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const touchLayoutCss=fs.readFileSync(path.join(root,'styles','device.css'),'utf8');
const kioskOptionCss=fs.readFileSync(path.join(root,'styles','device-kiosk21.css'),'utf8');
const selectedOptionCss=kioskOptionCss.split('/* Selected option screens: full-width, single-column cards on kiosk21 only. */')[1]?.split('/* Cart detail view model reads existing catalog prices without changing cart. */')[0]?.split('html[data-layout="kiosk21"] body[data-step="phone"] .keypad button,')[0]||'';
const languages=['ko','en','ja','zh','vi','es'];
const elements=new Map();
const classList={add(){},remove(){},toggle(){}};
const element=id=>{
  if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',disabled:false,offsetWidth:100,offsetHeight:100,classList,style:{},dataset:{}});
  return elements.get(id);
};
const document={
  documentElement:{lang:'',title:'',scrollTop:0},title:'',body:{dataset:{},scrollTop:0,appendChild(){}},activeElement:null,
  getElementById:element,querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},
  createElement(){return {className:'',style:{},remove(){}}}
};
const storage={getItem(){return null},setItem(){}};
const context={
  window:{},document,location:{search:''},URLSearchParams,console,Intl,Date,Math,Number,String,Object,Array,Set,Map,RegExp,JSON,
  localStorage:storage,sessionStorage:storage,Image:function(){},setTimeout(){return 0},setInterval(){return 0},clearInterval(){},
  alert(){},confirm(){return true},prompt(){return null},
  db:{collection(){return {onSnapshot(){},doc(){return {set(){}}},add(){return Promise.resolve({id:'test'})}}}},
  firebase:{firestore:{FieldValue:{serverTimestamp(){return null}}}}
};
context.window=context;
context.window.addEventListener=()=>{};
context.window.scrollTo=()=>{};
vm.createContext(context);

for(const language of languages){
  vm.runInContext(fs.readFileSync(path.join(root,'i18n',`${language}.js`),'utf8'),context,{filename:`i18n/${language}.js`});
}
vm.runInContext(fs.readFileSync(path.join(root,'i18n','ui.js'),'utf8'),context,{filename:'i18n/ui.js'});
vm.runInContext(fs.readFileSync(path.join(root,'i18n','index.js'),'utf8'),context,{filename:'i18n/index.js'});
const dataMatch=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);
assert.ok(dataMatch,'embedded kiosk data');
vm.runInContext(`window.KIOSK_DATA=${dataMatch[1]}`,context,{filename:'kiosk-data.js'});
const inlineScripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
const mainScript=inlineScripts.find(source=>source.includes('const localeTags=')&&source.includes('function view()'));
assert.ok(mainScript,'customer renderer script');
vm.runInContext(mainScript,context,{filename:'customer-renderer.js'});
context.window.PJ_I18N.setLanguage('ko');

const p011=vm.runInContext("po('P011')",context);
assert.strictEqual(p011.image,'assets/images/menu_image_018.png','P011 uses the shrimp pizza asset');
assert.ok(fs.existsSync(path.join(root,p011.image)),'P011 image exists');
assert.match(vm.runInContext("itemPic(po('P011'))",context),/menu_image_018\.png/,'P011 renders its real image');

assert.ok(html.includes('class="selectionFooter"'),'selection footer component exists');
assert.ok(html.includes('env(safe-area-inset-bottom)'),'selection footer respects the mobile safe area');
assert.ok(!html.includes('padding-top:116px!important'),'fixed-CTA compensation padding was removed');
assert.match(html,/\.selectionFooter\{[\s\S]*?position:fixed;/,'selection CTA is fixed');
const footerCss=html.match(/\.selectionFooter\{([\s\S]*?)\n\}/)?.[1]||'';
assert.ok(!/position\s*:\s*(?:sticky|absolute)/.test(footerCss),'selection CTA never uses sticky or absolute positioning');
assert.match(footerCss,/bottom:calc\(var\(--order-summary-height\) \+ var\(--safe-bottom\)\)/,'CTA sits directly above the measured order bar');
assert.match(footerCss,/animation:none!important/,'fixed CTA is not displaced by stage-child animation');
assert.match(footerCss,/transform:translateX\(-50%\)!important/,'fixed CTA stays centered across the viewport');
assert.match(html,/\.selectionFooterSpacer\{[\s\S]*?height:calc\(var\(--selection-footer-height\) \+ var\(--order-summary-height\) \+ var\(--safe-bottom\) \+ var\(--selection-footer-margin\)\)/,'spacer reserves CTA, order bar, safe area, and margin');
assert.match(html,/body\[data-step="accompaniment"\] \.stage\{[\s\S]*?animation:none!important;[\s\S]*?transform:none!important;[\s\S]*?padding-bottom:0!important/,'selection stage avoids a transformed fixed-position containing block and relies on the measured spacer');
for(const step of ['topping','side','drink']){
  assert.ok(!html.includes(`body[data-step="${step}"] .grid>.skipCard`),`${step} CTA is not fixed over its grid`);
}

const render=setup=>{
  vm.runInContext(setup,context);
  return vm.runInContext('view()',context);
};
const variants={
  sideNormal:"Object.assign(state,{step:'side',set:null,finalAddMode:null,setSideExtraMode:false,extraSides:{},setSides:{}})",
  sideFinal:"Object.assign(state,{step:'side',set:null,finalAddMode:'side',setSideExtraMode:false,extraSides:{},setSides:{}})",
  sideSet:"Object.assign(state,{step:'side',set:2,finalAddMode:null,setSideExtraMode:false,extraSides:{},setSides:{[SIDES.find(x=>x.set2).id]:1}})",
  sideSetExtra:"Object.assign(state,{step:'side',set:2,finalAddMode:null,setSideExtraMode:true,extraSides:{},setSides:{[SIDES.find(x=>x.set2).id]:1}})",
  drinkNormal:"Object.assign(state,{step:'drink',set:null,finalAddMode:null,setDrinkExtraMode:false,extraDrinks:{},setDrink:null})",
  drinkFinal:"Object.assign(state,{step:'drink',set:null,finalAddMode:'drink',setDrinkExtraMode:false,extraDrinks:{},setDrink:null})",
  drinkSet:"Object.assign(state,{step:'drink',set:2,finalAddMode:null,setDrinkExtraMode:false,extraDrinks:{},setDrink:'D001'})",
  drinkSetExtra:"Object.assign(state,{step:'drink',set:2,finalAddMode:null,setDrinkExtraMode:true,extraDrinks:{},setDrink:'D001'})"
};
for(const [name,setup] of Object.entries(variants)){
  const markup=render(setup);
  const footer=markup.lastIndexOf('class="selectionFooter"');
  const grid=markup.lastIndexOf('class="grid');
  assert.ok(footer>grid,`${name} CTA follows the final menu grid`);
  assert.ok(markup.includes('selectionFooterCard'),`${name} uses the shared footer CTA`);
  assert.strictEqual((markup.match(/class="selectionFooter"/g)||[]).length,1,`${name} creates exactly one fixed CTA`);
  assert.strictEqual((markup.match(/class="selectionFooterSpacer"/g)||[]).length,1,`${name} creates exactly one measured spacer`);
  assert.ok(markup.includes('role="button"'),`${name} makes the whole card interactive`);
  assert.ok(!markup.includes('<button class="card skipCard selectionFooterCard'),`${name} does not wrap the card in a separate button`);
}

const toppingSelection=render("Object.assign(state,{step:'topping',set:null,left:'P001',right:null,size:'R',toppingChoice:'add',toppings:{}})");
const accompanimentSelection=render("Object.assign(state,{step:'accompaniment',set:null,extraDrinks:{}})");
for(const [name,markup] of [['topping',toppingSelection],['accompaniment',accompanimentSelection]]){
  assert.strictEqual((markup.match(/class="selectionFooter"/g)||[]).length,1,`${name} creates exactly one fixed CTA`);
  assert.strictEqual((markup.match(/class="selectionFooterSpacer"/g)||[]).length,1,`${name} creates exactly one measured spacer`);
}
const lastToppingId=vm.runInContext('TOPPINGS[TOPPINGS.length-1].id',context);
assert.ok(toppingSelection.includes(`toppingQty('${lastToppingId}',1)`),'last topping plus control remains clickable before the spacer');
assert.ok(toppingSelection.includes(`toppingQty('${lastToppingId}',-1)`),'last topping minus control remains clickable before the spacer');
assert.match(touchLayoutCss,/body\[data-step="topping"\] \.selectionFooterSpacer\s*\{[\s\S]*?\+ 40px/,'topping spacer reserves at least 40px after the last card');
const normalSideSelection=render(variants.sideNormal);
const lastSideId=vm.runInContext('SIDES[SIDES.length-1].id',context);
assert.ok(normalSideSelection.includes(`qty('extraSides','${lastSideId}',1,9,99)`),'last side card remains clickable before the spacer');
assert.ok(normalSideSelection.includes(`qty('extraSides','${lastSideId}',-1,9,99)`),'last side minus control remains clickable before the spacer');
const normalDrinkSelection=render(variants.drinkNormal);
const lastGroupedDrinkId=vm.runInContext('drinkGroups()[drinkGroups().length-1].large',context);
assert.ok(normalDrinkSelection.includes(`qty('extraDrinks','${lastGroupedDrinkId}',1,9,99)`),'last drink plus control remains clickable before the spacer');
assert.ok(normalDrinkSelection.includes(`qty('extraDrinks','${lastGroupedDrinkId}',-1,9,99)`),'last drink minus control remains clickable before the spacer');
assert.match(touchLayoutCss,/body\[data-step="drink"\] \.grid\.drinkTextGrid,[\s\S]*?grid-template-columns: minmax\(0, 1fr\) !important/,'drink grids use one full-width column');
assert.match(touchLayoutCss,/body\[data-step="drink"\] \.v3DrinkCard\s*\{[\s\S]*?min-height: 280px !important;[\s\S]*?padding: 30px 36px !important/,'kiosk drink cards retain enlarged height and padding');
assert.match(touchLayoutCss,/body\[data-step="drink"\] \.v3DrinkRow button,[\s\S]*?width: 84px !important;[\s\S]*?height: 84px !important/,'kiosk drink quantity controls retain 84px touch targets');
assert.match(touchLayoutCss,/body\[data-step="drink"\] \.v3DrinkRow button:active,[\s\S]*?transform: none !important/,'drink controls do not move during repeated taps');
assert.doesNotMatch(touchLayoutCss,/\.v3DrinkCard[^{]*::before/,'drink cards do not generate product names with pseudo-elements');
for(const name of ['Coca-Cola','Coca-Cola Zero','Sprite','Sprite Zero']){
  assert.ok(!touchLayoutCss.includes(`content: "${name}"`),`CSS does not hardcode ${name}`);
}
for(const language of languages){
  context.window.PJ_I18N.setLanguage(language);
  const localizedName=vm.runInContext("t('drink.group.coke')",context);
  const localizedCard=vm.runInContext("drinkGroupCard(drinkGroups()[0])",context);
  assert.ok(localizedCard.includes(`<div class="v3DrinkName">${localizedName}</div>`),`${language} drink card renders the current data-backed name`);
  assert.ok(localizedCard.includes("qty('extraDrinks','D001',1,9,99)"),`${language} drink card retains the quantity handler`);
  assert.ok(!localizedCard.includes('500ml')&&!localizedCard.includes('1.25L'),`${language} non-set card hides numeric volumes`);
  assert.ok(localizedCard.includes(vm.runInContext("t('ui.drinkScreen.large')",context)),`${language} non-set card localizes Large`);
  assert.ok(localizedCard.includes(vm.runInContext("t('ui.drinkScreen.small')",context)),`${language} non-set card localizes Small`);
  assert.ok(localizedCard.indexOf("qty('extraDrinks','D002',1,9,99)")<localizedCard.indexOf("qty('extraDrinks','D001',1,9,99)"),`${language} renders Large above Small with the original product IDs`);
}
context.window.PJ_I18N.setLanguage('ko');
vm.runInContext("DRINKS.push({id:'DX01',name:'아주 긴 계절 한정 스파클링 음료 이름',small:true,price:3100},{id:'DX02',name:'아주 긴 계절 한정 스파클링 음료 이름',price:5200})",context);
const fixtureCard=vm.runInContext("drinkGroupCard({key:'seasonalFixture',small:'DX01',large:'DX02'})",context);
assert.ok(fixtureCard.includes('<div class="v3DrinkName">아주 긴 계절 한정 스파클링 음료 이름</div>'),'an unclassified long drink name uses the same data-backed name element');
assert.ok(fixtureCard.includes("qty('extraDrinks','DX01',1,9,99)"),'an unclassified drink retains the existing quantity handler');
assert.ok(!fixtureCard.includes('undefined'),'an unclassified drink renders complete markup');
const singleSizeCard=vm.runInContext("drinkGroupCard({key:'seasonalFixture',large:'DX02'})",context);
assert.ok(singleSizeCard.includes("qty('extraDrinks','DX02',1,9,99)"),'a one-size drink renders its available size');
assert.ok(!singleSizeCard.includes("qty('extraDrinks','DX01',1,9,99)"),'a one-size drink does not invent a missing size');
vm.runInContext("DRINKS.splice(-2)",context);
const lastSauceId=vm.runInContext('SAUCES[SAUCES.length-1].id',context);
assert.ok(accompanimentSelection.includes(`qty('extraDrinks','${lastSauceId}',1,9,99)`),'last accompaniment card remains clickable before the spacer');
assert.ok(accompanimentSelection.includes(`qty('extraDrinks','${lastSauceId}',-1,9,99)`),'last accompaniment minus control remains clickable before the spacer');

for(const setSize of [2,3,4]){
  const sideId=vm.runInContext(`SIDES.find(x=>${setSize}===2?x.set2:x.set).id`,context);
  const sideExtra=render(`Object.assign(state,{step:'side',set:${setSize},finalAddMode:null,setSideExtraMode:true,extraSides:{},setSides:{'${sideId}':1}})`);
  assert.ok(sideExtra.includes(`qty('extraSides','${sideId}',1,9,99)`),`${setSize}-person paid side list retains the included product`);
  assert.ok(!sideExtra.includes(`qty('setSides','${sideId}'`),`${setSize}-person paid side view hides included selection controls`);
  vm.runInContext('prevStep()',context);
  const sideState=JSON.parse(vm.runInContext('JSON.stringify({mode:state.setSideExtraMode,prompted:state.setSidePrompted,selected:state.setSides})',context));
  assert.strictEqual(sideState.mode,false,`${setSize}-person side back returns to included mode`);
  assert.strictEqual(sideState.prompted,false,`${setSize}-person side can re-enter the extra prompt`);
  assert.strictEqual(sideState.selected[sideId],1,`${setSize}-person included side survives back navigation`);

  const drinkId=setSize===2?'D001':'D002';
  const drinkExtra=render(`Object.assign(state,{step:'drink',set:${setSize},finalAddMode:null,setDrinkExtraMode:true,extraDrinks:{},setDrink:'${drinkId}'})`);
  assert.ok(drinkExtra.includes(`'${drinkId}',1,9,99`),`${setSize}-person paid drink list retains the included product`);
  assert.ok(!drinkExtra.includes(`chooseSetDrink('${drinkId}')`),`${setSize}-person paid drink view hides included selection controls`);
  vm.runInContext('prevStep()',context);
  const drinkState=JSON.parse(vm.runInContext('JSON.stringify({mode:state.setDrinkExtraMode,prompted:state.setDrinkPrompted,selected:state.setDrink})',context));
  assert.strictEqual(drinkState.mode,false,`${setSize}-person drink back returns to included mode`);
  assert.strictEqual(drinkState.prompted,false,`${setSize}-person drink can re-enter the extra prompt`);
  assert.strictEqual(drinkState.selected,drinkId,`${setSize}-person included drink survives back navigation`);
}

const incompleteSide=render("Object.assign(state,{step:'side',set:4,finalAddMode:null,setSideExtraMode:false,extraSides:{},setSides:{}})");
assert.match(incompleteSide,/selectionFooterCard setSideContinue isDisabled" role="button" tabindex="-1" aria-disabled="true"/,'incomplete included side keeps a disabled fixed CTA visible');
const incompleteDrink=render("Object.assign(state,{step:'drink',set:2,finalAddMode:null,setDrinkExtraMode:false,extraDrinks:{},setDrink:null})");
assert.match(incompleteDrink,/selectionFooterCard setDrinkContinue isDisabled" role="button" tabindex="-1" aria-disabled="true"/,'incomplete included drink keeps a disabled fixed CTA visible');
const accompaniment=render("Object.assign(state,{step:'accompaniment',extraDrinks:{}})");
assert.ok(accompaniment.includes('selectionFooterCard'),'accompaniment uses the shared fixed CTA');
assert.ok(!accompaniment.includes('card skipCard" onclick="finishAccompaniment()'), 'accompaniment CTA is outside the menu grid');

for(const step of ['promo','setChoice','size','mode','pizzaOptions','accompaniment','language']){
  assert.ok(kioskOptionCss.includes(`html[data-layout="kiosk21"] body[data-step="${step}"]`),`${step} single-column styling is kiosk21 and step scoped`);
}
for(const selector of ['darkBenefitGrid','darkSetGrid','sizeGuideGrid','modeChoiceGrid','accompanimentGrid','languageGrid']){
  assert.match(kioskOptionCss,new RegExp(`\\.${selector}[^{]*\\{[\\s\\S]*?grid-template-columns: minmax\\(0, 1fr\\) !important`),`${selector} renders one full-width column`);
}
assert.match(kioskOptionCss,/body\[data-step="pizzaOptions"\] \.doughOptionSection \.optionButtons\s*\{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important/,'integrated dough options stay in one three-column row');
assert.match(kioskOptionCss,/body\[data-step="pizzaOptions"\] \.doughOptionSection \.optionBtn\s*\{[\s\S]*?min-height: 104px !important/,'integrated dough options fit the usable kiosk height');
for(const protectedStep of ['crust','drink','side','topping','review','payment']){
  assert.ok(!selectedOptionCss.includes(`body[data-step="${protectedStep}"]`),`${protectedStep} receives no selected-option override`);
}
assert.match(kioskOptionCss,/body\[data-step="accompaniment"\] \.textQtyCard \.qty button\s*\{[\s\S]*?width: 84px !important;[\s\S]*?height: 84px !important/,'accompaniment quantity controls are 84px touch targets');
assert.match(kioskOptionCss,/body\[data-step="accompaniment"\] \.textQtyCard:active\s*\{[\s\S]*?transform: none !important/,'accompaniment cards do not move during repeated taps');
assert.match(kioskOptionCss,/body\[data-step="language"\] \.languageGrid button:active\s*\{[\s\S]*?transform: none !important/,'language cards do not move during taps');

const regularMode=render("Object.assign(state,{step:'mode',promo:'normal',set:null,size:'R',mode:'single'})");
assert.match(regularMode,/<button class="card modeChoiceCard" disabled onclick="selectPizzaMode\('half'\)">/,'Regular half-and-half remains disabled');
assert.ok(regularMode.includes("onclick=\"selectPizzaMode('single')\""),'whole-pizza selection handler remains attached');
vm.runInContext("Object.assign(state,{step:'mode',promo:'normal',set:null,size:'L',mode:'single',modal:null,left:null,right:null,crust:'오리지널'})",context);
vm.runInContext("setSetOption('mode','single')",context);
let halfGuideState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal})",context));
assert.deepStrictEqual(halfGuideState,{step:'mode',mode:'single',modal:null},'whole pizza does not open the half guide');
vm.runInContext("setSetOption('mode','half')",context);
halfGuideState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal})",context));
assert.deepStrictEqual(halfGuideState,{step:'mode',mode:'half',modal:'halfGuide'},'half selection opens the guide before navigation');
const halfGuideMarkup=vm.runInContext("modalView()",context);
assert.match(halfGuideMarkup,/role="dialog" aria-modal="true" aria-labelledby="halfGuideTitle"/,'half guide exposes accessible dialog semantics');
assert.ok(halfGuideMarkup.includes('하프앤하프는<br>토마토소스 베이스 피자만 선택 가능합니다.'),'half guide renders the requested tomato-sauce notice');
assert.ok(halfGuideMarkup.includes('다음 피자는 하프앤하프가 불가능합니다.'),'half guide introduces the restricted pizza list');
assert.match(halfGuideMarkup,/<ul><li>쉬림프 알프레도<\/li><li>프리미엄 직화불고기<\/li><li>스파이시 치킨랜치<\/li><li>햄머쉬룸 식스치즈<\/li><\/ul>/,'half guide renders the restricted pizzas as a list');
assert.ok(halfGuideMarkup.includes('※ 존스페이버릿은<br>식스치즈와만 하프앤하프가 가능합니다.'),'half guide renders the requested John’s Favorite pairing notice');
assert.ok(halfGuideMarkup.includes('onclick="confirmHalfGuide()"'),'half guide confirmation uses its dedicated transition');
vm.runInContext("confirmHalfGuide()",context);
halfGuideState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal})",context));
assert.deepStrictEqual(halfGuideState,{step:'pizza',mode:'half',modal:null},'confirming the guide enters the existing pizza selection flow');
vm.runInContext("prevStep();setSetOption('mode','half')",context);
halfGuideState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal})",context));
assert.deepStrictEqual(halfGuideState,{step:'mode',mode:'half',modal:'halfGuide'},'back navigation allows the half guide to appear again');
for(const setSize of [3,4]){
  const pizzaSize=setSize===3?'L':'F';
  vm.runInContext(`Object.assign(state,{step:'mode',promo:'set',set:${setSize},size:'${pizzaSize}',mode:'single',modal:null,left:null,right:null,crust:'오리지널'})`,context);
  vm.runInContext("setSetOption('mode','half')",context);
  let delayedHalfState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal,crust:state.crust})",context));
  assert.deepStrictEqual(delayedHalfState,{step:'mode',mode:'half',modal:null,crust:'오리지널'},`${setSize}-person half selection stays on options without opening the guide`);
  vm.runInContext("setSetOption('crust','치즈롤')",context);
  delayedHalfState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal,crust:state.crust})",context));
  assert.deepStrictEqual(delayedHalfState,{step:'mode',mode:'half',modal:null,crust:'치즈롤'},`${setSize}-person half and crust selections remain on the current screen`);
  vm.runInContext("confirmSetOptions()",context);
  delayedHalfState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal,crust:state.crust})",context));
  assert.deepStrictEqual(delayedHalfState,{step:'mode',mode:'half',modal:'halfGuide',crust:'치즈롤'},`${setSize}-person half next click opens the guide without navigating`);
  vm.runInContext("state.modal=null;render()",context);
  delayedHalfState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal,crust:state.crust})",context));
  assert.deepStrictEqual(delayedHalfState,{step:'mode',mode:'half',modal:null,crust:'치즈롤'},`closing the ${setSize}-person guide keeps the current selections`);
  vm.runInContext("confirmSetOptions();confirmHalfGuide()",context);
  delayedHalfState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal,crust:state.crust})",context));
  assert.deepStrictEqual(delayedHalfState,{step:'pizza',mode:'half',modal:null,crust:'치즈롤'},`confirming the ${setSize}-person guide enters pizza selection`);
  vm.runInContext(`Object.assign(state,{step:'mode',promo:'set',set:${setSize},size:'${pizzaSize}',mode:'single',modal:null,left:null,right:null,crust:'골드링'});confirmSetOptions()`,context);
  const wholePizzaState=JSON.parse(vm.runInContext("JSON.stringify({step:state.step,mode:state.mode,modal:state.modal,crust:state.crust})",context));
  assert.deepStrictEqual(wholePizzaState,{step:'pizza',mode:'single',modal:null,crust:'골드링'},`${setSize}-person whole pizza keeps the existing popup-free next flow`);
}
const doughOptions=render("Object.assign(state,{step:'pizzaOptions',orderType:'takeout',promo:'takeout',bannerTakeout:true,size:'L',mode:'single',dough:'오리지널',crust:'오리지널'})");
assert.ok(doughOptions.includes('class="optionSection doughOptionSection"'),'only the integrated dough section receives its dedicated scope');
assert.ok(doughOptions.includes("onclick=\"setStandardPizzaOption('dough','오리지널')\""),'dough selection handler remains attached');
assert.ok(doughOptions.includes("onclick=\"setStandardPizzaOption('crust','오리지널')\""),'protected crust selection handler remains attached');
assert.ok(doughOptions.includes('피자 선택 후 가격 확정'),'pizza-dependent size cards defer the amount until pizza selection');
assert.ok(doughOptions.includes('+ 6,000원'),'the croissant card uses the existing CRUSTS dough fee');
assert.ok(doughOptions.includes('+ 4,000원'),'large crust cards use the existing CRUSTS price data');
assert.ok(doughOptions.includes('추가금 없음'),'zero-fee options are labelled explicitly');

vm.runInContext("setStandardPizzaOption('size','F')",context);
const familyPriceOptions=render();
assert.ok(familyPriceOptions.includes('+ 5,000원'),'changing to family size immediately uses its existing crust surcharge');
assert.ok(!familyPriceOptions.includes('+ 4,000원'),'the stale large crust surcharge is no longer rendered');
assert.strictEqual(vm.runInContext("standardOptionPriceText('crust','골드링')",context),'+ 5,000원','displayed family gold-ring price matches the existing option calculation data');

const normalPriceOptions=render("Object.assign(state,{step:'pizzaOptions',orderType:'dinein',promo:'normal',bannerTakeout:false,size:'L',dough:'크루아상',crust:'오리지널'})");
assert.ok(normalPriceOptions.includes('크루아상은 오리지널 크러스트만 가능</span><span class=\"optionPrice\">+ 4,000원'),'disabled crust cards retain both their reason and existing price');
assert.strictEqual(vm.runInContext("standardOptionPriceText('dough','크루아상')",context),'+ 6,000원','normal-order croissant dough displays its existing CRUSTS fee');
assert.strictEqual(vm.runInContext("standardOptionPriceText('crust','오리지널')",context),'추가금 없음','croissant original crust does not repeat the dough fee');
assert.strictEqual(vm.runInContext("standardOptionPriceText('crust','치즈롤')",context),'+ 4,000원','disabled cheese roll keeps only its own large crust fee');
assert.strictEqual(vm.runInContext("standardOptionPriceText('crust','골드링')",context),'+ 4,000원','disabled gold ring keeps only its own large crust fee');

for(const orderCase of [
  {name:'normal dine-in',orderType:'dinein',promo:'normal',bannerTakeout:false,discounted:false},
  {name:'normal takeout',orderType:'takeout',promo:'normal',bannerTakeout:false,discounted:false},
  {name:'20% takeout',orderType:'takeout',promo:'takeout',bannerTakeout:true,discounted:true}
]){
  vm.runInContext(`Object.assign(state,{orderType:'${orderCase.orderType}',promo:'${orderCase.promo}',bannerTakeout:${orderCase.bannerTakeout},size:'L',mode:'single',left:'P001',right:null,dough:'크루아상',crust:'오리지널',toppings:{},extraSides:{},extraDrinks:{},set:null})`,context);
  const croissantPrice=JSON.parse(vm.runInContext("JSON.stringify(price())",context));
  const pizzaAmount=vm.runInContext("po('P001').L",context);
  assert.strictEqual(croissantPrice.crust,6000,`${orderCase.name} charges the existing croissant fee exactly once`);
  if(orderCase.discounted){
    const expectedDiscount=Math.round((pizzaAmount+6000)*(vm.runInContext('SETTINGS.PACK_DISCOUNT',context)/100));
    assert.strictEqual(croissantPrice.discount,expectedDiscount,'20% takeout discount includes the single croissant fee');
    assert.strictEqual(croissantPrice.total,pizzaAmount+6000-expectedDiscount,'20% takeout payment matches the displayed croissant fee');
  }else{
    assert.strictEqual(croissantPrice.discount,0,`${orderCase.name} does not introduce a discount`);
    assert.strictEqual(croissantPrice.total,pizzaAmount+6000,`${orderCase.name} payment matches the displayed croissant fee`);
  }
}

const emptyOptions=render("Object.assign(state,{step:'pizzaOptions',orderType:'dinein',promo:'normal',set:null,bannerTakeout:false,size:null,mode:'single',dough:null,crust:null,left:null,right:null})");
assert.ok(emptyOptions.includes('사이즈를 먼저 선택해 주세요'),'dependent options explain why they are unavailable');
assert.match(emptyOptions,/class="optionContinue" disabled/,'next is disabled until all three options are valid');
vm.runInContext("confirmStandardPizzaOptions()",context);
assert.strictEqual(vm.runInContext("state.step",context),'pizzaOptions','an incomplete option selection cannot enter composition');

vm.runInContext("setStandardPizzaOption('size','R');setStandardPizzaOption('dough','오리지널');setStandardPizzaOption('crust','오리지널')",context);
assert.strictEqual(vm.runInContext("standardPizzaOptionsValid()",context),true,'regular classic original is a valid combination');
vm.runInContext("setStandardPizzaOption('dough','씬도우')",context);
assert.strictEqual(vm.runInContext("state.dough",context),'오리지널','clicking a disabled dough does not change state');
vm.runInContext("confirmStandardPizzaOptions()",context);
assert.strictEqual(vm.runInContext("state.step",context),'mode','valid options enter whole or half selection');
vm.runInContext("selectPizzaMode('single');pickPizza('P001')",context);
assert.strictEqual(vm.runInContext("state.step",context),'topping','whole pizza selection goes directly to toppings without reopening crust');
vm.runInContext("prevStep();prevStep();prevStep()",context);
assert.strictEqual(vm.runInContext("state.step",context),'pizzaOptions','back follows topping to pizza to mode to integrated options');

vm.runInContext("Object.assign(state,{step:'pizzaOptions',promo:'normal',size:'F',dough:'씬도우',crust:'골드링'});setStandardPizzaOption('size','L')",context);
assert.deepStrictEqual(JSON.parse(vm.runInContext("JSON.stringify({dough:state.dough,crust:state.crust})",context)),{dough:null,crust:'골드링'},'size change clears only the newly incompatible dough');
vm.runInContext("setStandardPizzaOption('size','R')",context);
assert.strictEqual(vm.runInContext("state.crust",context),null,'size change clears a newly incompatible crust');

const croissantOptions=render("Object.assign(state,{step:'pizzaOptions',promo:'normal',set:null,size:'L',dough:'크루아상',crust:null})");
assert.ok(croissantOptions.includes('크루아상은 오리지널 크러스트만 가능'),'croissant explains its original-crust-only restriction');
assert.match(croissantOptions,/button class="optionBtn " disabled aria-disabled="true" onclick="setStandardPizzaOption\('crust','치즈롤'\)"/,'croissant disables cheese roll');
assert.match(croissantOptions,/button class="optionBtn " disabled aria-disabled="true" onclick="setStandardPizzaOption\('crust','골드링'\)"/,'croissant disables gold ring');
vm.runInContext("state.crust='치즈롤';confirmStandardPizzaOptions()",context);
assert.strictEqual(vm.runInContext("state.step",context),'pizzaOptions','croissant with cheese roll cannot enter composition');
vm.runInContext("setStandardPizzaOption('crust','골드링')",context);
assert.strictEqual(vm.runInContext("state.crust",context),'치즈롤','clicking croissant gold ring does not change state');

const thinOptions=render("Object.assign(state,{step:'pizzaOptions',promo:'normal',set:null,size:'F',dough:'씬도우',crust:'골드링'})");
assert.ok(thinOptions.includes('씬도우는 오리지널·골드링만 가능'),'thin dough explains why cheese roll is disabled');
assert.strictEqual(vm.runInContext("standardPizzaOptionsValid()",context),true,'family thin dough with gold ring remains valid');
vm.runInContext("setStandardPizzaOption('crust','치즈롤')",context);
assert.strictEqual(vm.runInContext("state.crust",context),'골드링','clicking thin-dough cheese roll does not change state');

vm.runInContext("Object.assign(state,{step:'pizzaOptions',promo:'normal',size:'L',dough:'오리지널',crust:'치즈롤'});setStandardPizzaOption('dough','크루아상')",context);
assert.deepStrictEqual(JSON.parse(vm.runInContext("JSON.stringify({dough:state.dough,crust:state.crust})",context)),{dough:'크루아상',crust:null},'changing to croissant clears an incompatible crust');
vm.runInContext("Object.assign(state,{step:'pizzaOptions',promo:'normal',size:'F',dough:'오리지널',crust:'치즈롤'});setStandardPizzaOption('dough','씬도우')",context);
assert.deepStrictEqual(JSON.parse(vm.runInContext("JSON.stringify({dough:state.dough,crust:state.crust})",context)),{dough:'씬도우',crust:null},'changing to thin dough clears cheese roll');
for(const language of languages){
  context.window.PJ_I18N.setLanguage(language);
  const languageMarkup=render("Object.assign(state,{step:'language'})");
  assert.ok(languageMarkup.includes(`class="selected" aria-current="true" onclick="chooseLanguage('${language}')"`),`${language} is visibly marked as current`);
  assert.ok(languageMarkup.includes(`onclick="chooseLanguage('${language}')"`),`${language} switch handler remains attached`);
  const translatedPrice=render("Object.assign(state,{step:'pizzaOptions',promo:'normal',bannerTakeout:false,size:'L',dough:'오리지널',crust:'오리지널'})");
  assert.ok(!translatedPrice.includes('ui.pizzaOptions.priceAfterPizza'),`${language} has the deferred-price translation`);
  assert.ok(!translatedPrice.includes('ui.pizzaOptions.extraCharge'),`${language} has the surcharge translation`);
}
context.window.PJ_I18N.setLanguage('ko');

vm.runInContext("Object.assign(state,{orderType:'takeout',orderTiming:'now',phone:'12345678',paymentMethod:'card',set:3,promo:'set',size:'L',mode:'half',left:'P001',right:'P002',dough:'오리지널',crust:'치즈롤',toppings:{T001:1},setSides:{S004:1},extraSides:{S004:1},setDrink:'D002',extraDrinks:{D002:1,D009:2},cartItems:[]})",context);
const payload=JSON.parse(vm.runInContext('JSON.stringify(buildMobileOrderPayload())',context));
assert.strictEqual(payload.items.length,1,'current order becomes one Firestore item');
const payloadItem=payload.items[0];
assert.strictEqual(payloadItem.pizzaLeft,'P001','left half pizza ID is retained');
assert.strictEqual(payloadItem.pizzaRight,'P002','right half pizza ID is retained');
assert.strictEqual(payloadItem.toppings.T001,1,'topping quantity is retained');
assert.strictEqual(payloadItem.includedSides.S004,1,'included side is retained');
assert.strictEqual(payloadItem.sides.S004,1,'same side can also be retained as a paid extra');
assert.strictEqual(payloadItem.includedDrinks.D002,1,'included drink is retained');
assert.strictEqual(payloadItem.drinks.D002,1,'same drink can also be retained as a paid extra');
assert.strictEqual(payloadItem.drinks.D009,2,'sauce quantity is retained');
assert.ok(Number.isFinite(payload.normalAmount)&&Number.isFinite(payload.discountAmount)&&Number.isFinite(payload.total),'order amounts are finite');
assert.ok(!Object.hasOwn(payload,'discountBreakdown'),'payload contains only Firestore-approved summary fields');

const drinkMarkup=render(variants.drinkNormal);
assert.ok(drinkMarkup.includes('v3DrinkQuantity'),'grouped drink quantity readout exists');
assert.ok(drinkMarkup.includes('>수량<'),'quantity label is localized and visible');
const setDrinkMarkup=render(variants.drinkSet);
assert.ok(setDrinkMarkup.includes('setDrinkQuantity'),'included drink selection has a visible count');

const takeoutSetup="Object.assign(state,{step:'review',orderType:'takeout',orderTiming:'now',bannerTakeout:true,promo:'takeout',set:null,size:'L',mode:'single',dough:'오리지널',left:'P001',right:null,crust:'오리지널',toppingChoice:'add',toppings:{},extraSides:{},extraDrinks:{},setSides:{},setDrink:null,cartItems:[]})";
const reviewMarkup=render(takeoutSetup);
assert.ok(reviewMarkup.includes('reviewAddMore'),'takeout review shows additional-order actions');
assert.ok(reviewMarkup.includes('addAnotherOrder()'),'the single additional-order action is rendered');
for(const action of ['addAnotherSet()','addAnotherUpUp()','addAnotherSingle()'])assert.ok(!reviewMarkup.includes(`onclick="${action}"`),`${action} is not rendered as a competing review action`);

const flowCases={
  addAnotherSet:{step:'setChoice',promo:'set'},
  addAnotherUpUp:{step:'mode',promo:'upup'},
  addAnotherSingle:{step:'promo',promo:null}
};
for(const [action,expected] of Object.entries(flowCases)){
  vm.runInContext(takeoutSetup,context);
  const before=JSON.parse(vm.runInContext('JSON.stringify(price())',context));
  vm.runInContext(`${action}()`,context);
  const after=JSON.parse(vm.runInContext('JSON.stringify({step:state.step,promo:state.promo,bannerTakeout:state.bannerTakeout,cartItems:state.cartItems,total:cartTotal()})',context));
  assert.strictEqual(after.step,expected.step,`${action} route`);
  assert.strictEqual(after.promo,expected.promo,`${action} promo`);
  assert.strictEqual(after.bannerTakeout,false,`${action} clears takeout-only UI state`);
  assert.strictEqual(after.cartItems.length,1,`${action} preserves the current order`);
  assert.strictEqual(after.cartItems[0].promo,'takeout',`${action} keeps the original discount type`);
  assert.strictEqual(after.cartItems[0].price,before.total,`${action} keeps the discounted price`);
  assert.strictEqual(after.cartItems[0].normalPrice,before.total+before.discount,`${action} keeps the normal price`);
  assert.strictEqual(after.cartItems[0].discount,before.discount,`${action} keeps the discount`);
  assert.strictEqual(after.total,before.total,`${action} cart total remains correct`);
}

console.log('fixed selection CTAs, 2/3/4-person included/paid state, drink quantities, P011 image, and additional-order flows passed');
