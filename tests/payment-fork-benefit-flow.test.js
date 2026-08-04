'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');

function customerHarness(){
 const classList={add(){},remove(){},toggle(){}};
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',disabled:false,offsetWidth:100,offsetHeight:100,classList,style:{setProperty(){}},dataset:{},querySelectorAll(){return[]}});return elements.get(id)};
 const document={documentElement:{lang:'ko',title:'',scrollTop:0,dataset:{}},body:{dataset:{},scrollTop:0,classList,style:{setProperty(){}},appendChild(){}},activeElement:null,getElementById:element,querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},createElement(){return {className:'',style:{},remove(){}}}};
 const storage={getItem(key){return key==='pjLangSelected'?'1':null},setItem(){}};
 const context={window:{},document,location:{search:''},URLSearchParams,console,Intl,Date,Math,Number,String,Object,Array,Set,Map,RegExp,JSON,Promise,localStorage:storage,sessionStorage:storage,Image:function(){},setTimeout(){return 0},setInterval(){return 0},clearTimeout(){},clearInterval(){},requestAnimationFrame:callback=>{callback();return 1},cancelAnimationFrame(){},alert(){},confirm(){return true},prompt(){return null},db:{collection(){return {onSnapshot(){},doc(){return {id:'order-1'}},add:async()=>({id:'wait'})}}},firebase:{firestore:{FieldValue:{serverTimestamp(){return 'SERVER_TIMESTAMP'}},Timestamp:{fromMillis(value){return {toDate:()=>new Date(value)}}}}}};
 context.window=context;context.window.addEventListener=()=>{};context.window.scrollTo=()=>{};context.window.PJ_NETWORK={isOnline:()=>true};context.window.PJ_BOTTLE_SEAT_POLICY={isBottleSeat:()=>false,getBottleSeatAvailability:()=>({available:true}),millisecondsUntilNextBoundary:()=>86400000};
 vm.createContext(context);
 for(const language of ['ko','en','ja','zh','vi','es'])vm.runInContext(fs.readFileSync(path.join(root,'i18n',`${language}.js`),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/ui.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/index.js'),'utf8'),context);
 const data=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);
 vm.runInContext(`window.KIOSK_DATA=${data[1]}`,context);
 const main=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).find(source=>source.includes('function submitMobileOrder()'));
 vm.runInContext(main,context);
 return context;
}

function adminHarness(){
 const start=admin.indexOf('function normalizedOption'),end=admin.indexOf('\nfunction showOrderDetail',start);
 const catalog={pizzas:{P001:'페퍼로니'},toppings:{},sides:{},drinks:{},sauces:{}};
 const context={ORDER_CATALOG:catalog,PIZZAS:[{id:'P001',name:'페퍼로니'}],TOPPINGS:[],SIDES:[],DRINKS:[],PJCommon:{legacyChannel:()=> 'mobile'},statusNames:{payment_pending:'결제대기'},displayText(value,fallback='-'){if(typeof value==='string'||typeof value==='number')return String(value).trim()||fallback;return fallback},productName(id){return id},esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))},money(value){return Number(value||0).toLocaleString('ko-KR')+'원'},adminOrderNumberLabel:()=> '1234',orderSeatLabel:()=> '-',formatTime:()=> '12:00'};
 vm.createContext(context);vm.runInContext(admin.slice(start,end),context);return context;
}

test('actual customer fork selection survives payload JSON and renders identically in both admin surfaces',()=>{
 const customer=customerHarness(),adminUi=adminHarness();
 assert.equal(vm.runInContext('state.disposables',customer),null);
 vm.runInContext('chooseDisposables(false)',customer);assert.equal(vm.runInContext('state.disposables',customer),false);
 vm.runInContext("Object.assign(state,{orderType:'takeout',orderTiming:'now',phone:'01012341234',paymentMethod:'card',cartItems:[{promo:'normal',set:null,size:'L',mode:'single',pizzaLeft:'P001',pizzaRight:null,pizzaName:'페퍼로니',crust:'오리지널',dough:'오리지널',qty:1,price:29900,normalPrice:29900,discount:0,toppings:{},sides:{},drinks:{},includedSides:{},includedDrinks:{}}]});chooseDisposables(true)",customer);
 assert.equal(vm.runInContext('state.disposables',customer),true);
 const payload=JSON.parse(vm.runInContext('JSON.stringify(buildMobileOrderPayload())',customer));
 assert.equal(payload.disposables,true);assert.equal(typeof payload.disposables,'boolean');
 const firestoreDocument=JSON.parse(JSON.stringify(payload));
 for(const markup of [adminUi.newOrderCard(firestoreDocument),adminUi.renderOrderDetail(firestoreDocument)])assert.match(markup,/<span>일회용 포크<\/span><strong>O<\/strong>/);
 for(const value of [false,undefined,'true',1]){
  const documentValue={...firestoreDocument};if(value===undefined)delete documentValue.disposables;else documentValue.disposables=value;
  for(const markup of [adminUi.newOrderCard(documentValue),adminUi.renderOrderDetail(documentValue)])assert.match(markup,/<span>일회용 포크<\/span><strong>X<\/strong>/);
 }
});

test('done screen renders exact Korean particles and every locale safely resolves guidance',()=>{
 const customer=customerHarness();
 const expected={cash:'현금으로 카운터에서 결제해 주세요',card:'신용카드로 카운터에서 결제해 주세요',meal_ticket:'식권대장으로 카운터에서 결제해 주세요',bizle:'제로페이로 카운터에서 결제해 주세요'};
 for(const [method,sentence] of Object.entries(expected)){
  const rendered=vm.runInContext(`currentLanguage='ko';Object.assign(state,{step:'done',orderNo:'P1234',paymentMethod:'${method}',orderTiming:'now'});render();document.getElementById('main').innerHTML`,customer);
  assert.ok(rendered.includes(sentence),`${method} renders its exact Korean sentence`);assert.doesNotMatch(rendered,/현금로|식권대장로/);
 }
 for(const locale of ['ko','en','ja','zh','vi','es'])for(const method of Object.keys(expected))assert.doesNotMatch(vm.runInContext(`currentLanguage='${locale}';paymentGuidanceName('${method}')`,customer),/done\.paymentMethodPhrase/);
 assert.equal(vm.runInContext("currentLanguage='ko';paymentGuidanceName('unknown')",customer),'-');
});

test('standard item benefits cover every mapping, strict fallback, ordering, and deduplication edge',()=>{
 const adminUi=adminHarness(),pizza=(promo,set=null)=>({pizzaLeft:'P001',promo,set});
 for(const [order,label] of [[{items:[pizza('upup')]},'업앤업'],[{items:[pizza('happy')]},'해피아워'],[{items:[pizza('set',2)]},'2인 세트'],[{items:[pizza('set',3)]},'3인 세트'],[{items:[pizza('set',4)]},'4인 세트'],[{items:[pizza('takeout')],orderType:'takeout'},'포장 20%'],[{items:[pizza('normal')],orderType:'takeout'},'포장'],[{items:[pizza('normal')],orderType:'dinein'},'']])assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels(order)),label?[label]:[]);
 const combined={items:[pizza('upup'),pizza('set',3),pizza('upup'),pizza('set',4)],promo:'happy'};
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels(combined)),['업앤업','3인 세트','4인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[{pizzaLeft:'P001',set:null}],promo:'happy'})),['해피아워']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[{pizzaLeft:'P001'}],promo:'set',set:2})),['2인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('set','3')]})),[]);
});
