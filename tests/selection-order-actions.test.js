const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
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
const normalSideSelection=render(variants.sideNormal);
const lastSideId=vm.runInContext('SIDES[SIDES.length-1].id',context);
assert.ok(normalSideSelection.includes(`qty('extraSides','${lastSideId}',1,9,99)`),'last side card remains clickable before the spacer');
assert.ok(normalSideSelection.includes(`qty('extraSides','${lastSideId}',-1,9,99)`),'last side minus control remains clickable before the spacer');
const normalDrinkSelection=render(variants.drinkNormal);
const lastGroupedDrinkId=vm.runInContext('drinkGroups()[drinkGroups().length-1].large',context);
assert.ok(normalDrinkSelection.includes(`qty('extraDrinks','${lastGroupedDrinkId}',1,9,99)`),'last drink plus control remains clickable before the spacer');
assert.ok(normalDrinkSelection.includes(`qty('extraDrinks','${lastGroupedDrinkId}',-1,9,99)`),'last drink minus control remains clickable before the spacer');
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
for(const action of ['addAnotherSet()','addAnotherUpUp()','addAnotherSingle()'])assert.ok(reviewMarkup.includes(action),`${action} is rendered`);

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
