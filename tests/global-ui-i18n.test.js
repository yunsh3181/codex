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
const mainScript=inlineScripts.find(source=>source.includes("const localeTags=")&&source.includes('function view()'));
assert.ok(mainScript,'customer renderer script');
vm.runInContext(mainScript,context,{filename:'customer-renderer.js'});

const screenSetups={
  home:"Object.assign(state,{step:'home'})",
  type:"Object.assign(state,{step:'type'})",
  timing:"Object.assign(state,{step:'timing',orderType:'takeout'})",
  party:"Object.assign(state,{step:'party',orderType:'dinein',partySize:2})",
  area:"Object.assign(state,{step:'area',orderType:'dinein',partySize:2,diningArea:null,selectedTables:[]})",
  table:"Object.assign(state,{step:'table',orderType:'dinein',partySize:2,diningArea:'papa',selectedTables:[]})",
  promo:"Object.assign(state,{step:'promo',orderType:'takeout',orderTiming:'now'})",
  setChoice:"Object.assign(state,{step:'setChoice',orderType:'takeout',promo:'set'})",
  pizzaOptions:"Object.assign(state,{step:'pizzaOptions',orderType:'takeout',promo:'takeout',bannerTakeout:true,size:'L',mode:'single',dough:'오리지널',crust:'오리지널'})",
  size:"Object.assign(state,{step:'size',promo:'normal',size:null})",
  mode:"Object.assign(state,{step:'mode',promo:'normal',set:null,size:'L',mode:'single'})",
  pizza:"Object.assign(state,{step:'pizza',promo:'normal',set:null,size:'L',mode:'single',left:null,right:null,cat:'ALL',bannerTakeout:false,dough:'오리지널',crust:'오리지널'})",
  crust:"Object.assign(state,{step:'crust',promo:'normal',set:null,size:'L',mode:'single',left:'P001',crust:'오리지널'})",
  topping:"Object.assign(state,{step:'topping',promo:'normal',size:'L',left:'P001',toppingChoice:'add',toppings:{T001:1}})",
  side:"Object.assign(state,{step:'side',set:null,finalAddMode:null,extraSides:{}})",
  drink:"Object.assign(state,{step:'drink',set:null,finalAddMode:null,extraDrinks:{}})",
  accompaniment:"Object.assign(state,{step:'accompaniment',extraDrinks:{}})",
  cart:"Object.assign(state,{step:'cartReview',cartItems:[]})",
  review:"Object.assign(state,{step:'review',cartItems:[],left:'P001',right:null,size:'L',mode:'single',promo:'normal',crust:'오리지널',dough:'오리지널',toppings:{},extraSides:{},extraDrinks:{},setSides:{},setDrink:null})",
  phone:"Object.assign(state,{step:'phone',phone:''})",
  payment:"Object.assign(state,{step:'payment',phone:'12345678',paymentMethod:null,cartItems:[],left:'P001',size:'L',mode:'single',promo:'normal',crust:'오리지널',dough:'오리지널',toppings:{},extraSides:{},extraDrinks:{}})",
  done:"Object.assign(state,{step:'done',orderNo:'P1234',paymentMethod:'card',orderTiming:'now'})"
};
const modalSetups={
  finalUpsell:"Object.assign(state,{modal:'finalUpsell'})",
  setSideUpsell:"Object.assign(state,{modal:'setSideUpsell'})",
  setDrinkUpsell:"Object.assign(state,{modal:'setDrinkUpsell'})",
  halfConfirm:"Object.assign(state,{modal:'halfConfirm',left:'P001',right:'P002'})",
  croissantNotice:"Object.assign(state,{modal:'croissantNotice'})",
  disposables:"Object.assign(state,{modal:'disposables'})",
  toppingLimitEach:"Object.assign(state,{modal:'toppingLimitEach'})",
  toppingLimitTotal:"Object.assign(state,{modal:'toppingLimitTotal'})"
};
const visibleContent=markup=>{
  const accessibility=[...markup.matchAll(/\b(?:aria-label|alt|title)="([^"]*)"/g)].map(match=>match[1]);
  const text=markup.replace(/<svg[\s\S]*?<\/svg>/g,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  return `${text} ${accessibility.join(' ')}`.trim();
};

for(const language of languages){
  context.window.PJ_I18N.setLanguage(language);
  const rendered=[];
  for(const [screen,setup] of Object.entries(screenSetups)){
    vm.runInContext(setup,context);
    const markup=vm.runInContext('view()',context);
    assert.ok(markup&&typeof markup==='string',`${language} ${screen} rendered`);
    assert.ok(!markup.includes('ui.'),`${language} ${screen} exposed translation key`);
    rendered.push(visibleContent(markup));
  }
  for(const [modal,setup] of Object.entries(modalSetups)){
    vm.runInContext(setup,context);
    const markup=vm.runInContext('modalView()',context);
    assert.ok(markup&&typeof markup==='string',`${language} ${modal} rendered`);
    rendered.push(visibleContent(markup));
  }
  const combined=rendered.join(' ');
  if(language==='ko')assert.ok(/[가-힣]/.test(combined),'Korean UI remains Korean');
  else assert.ok(!/[가-힣]/.test(combined),`${language} rendered UI contains Hangul`);
}

console.log(`${Object.keys(screenSetups).length} screens + ${Object.keys(modalSetups).length} popups × ${languages.length} languages rendered without locale leakage`);
