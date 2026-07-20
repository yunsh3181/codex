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
}

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

console.log('selection footers, drink quantity UI, P011 image, and 3 preserved additional-order flows passed');
