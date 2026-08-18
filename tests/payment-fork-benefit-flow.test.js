'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8').replace(/const autoReadyCoordinator=createAutoReadyCoordinator\([\s\S]*?function reconcileAutoReadyOrders\(list\)\{autoReadyCoordinator\.reconcile\(list\)\}\n/,'');

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
 for(const value of [false]){
  const documentValue={...firestoreDocument};if(value===undefined)delete documentValue.disposables;else documentValue.disposables=value;
  for(const markup of [adminUi.newOrderCard(documentValue),adminUi.renderOrderDetail(documentValue)])assert.match(markup,/<span>일회용 포크<\/span><strong>X<\/strong>/);
 }
 for(const value of [undefined,null,'true','false',1]){
  const documentValue={...firestoreDocument};if(value===undefined)delete documentValue.disposables;else documentValue.disposables=value;
  for(const markup of [adminUi.newOrderCard(documentValue),adminUi.renderOrderDetail(documentValue)])assert.match(markup,/<span>일회용 포크<\/span><strong>확인 필요<\/strong>/);
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
 for(const [order,label] of [[{items:[pizza('upup')]},'UP&UP'],[{items:[pizza('happy')]},'해피아워'],[{items:[pizza('set',2)]},'2인 세트'],[{items:[pizza('set',3)]},'3인 세트'],[{items:[pizza('set',4)]},'4인 세트'],[{items:[pizza('takeout')],orderType:'takeout'},'포장 20%'],[{items:[pizza('normal')],orderType:'takeout'},'포장'],[{items:[pizza('normal')],orderType:'dinein'},'']])assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels(order)),label?[label]:[]);
 const combined={items:[pizza('upup'),pizza('set',3),pizza('upup'),pizza('set',4)],promo:'happy'};
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels(combined)),['UP&UP','3인 세트','4인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[{pizzaLeft:'P001',set:null}],promo:'happy'})),['해피아워']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[{pizzaLeft:'P001'}],promo:'set',set:2})),['2인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('set','3')]})),[]);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('normal')],set:3})),['3인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza(null,3)],promo:'upup'})),['UP&UP','3인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('upup',3)],benefit:'normal'})),['UP&UP','3인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('upup')],set:3})),['UP&UP','3인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('normal')],benefit:'normal'})),[]);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('unknown','invalid')],benefit:'upup',set:3})),['UP&UP','3인 세트']);
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels({items:[pizza('upup',3),pizza('upup',3)]})),['UP&UP','3인 세트']);
});

test('D8222-shaped set and UP&UP order keeps the paid set crust and combines item benefits',()=>{
 const customer=customerHarness(),adminUi=adminHarness();
 vm.runInContext("Object.assign(state,{orderType:'dinein',orderTiming:'now',phone:'00008222',paymentMethod:'card',promo:'upup',set:3,size:'L',mode:'single',left:'P001',right:null,dough:'오리지널',crust:'치즈롤',toppings:{},extraSides:{},extraDrinks:{},setSides:{S007:1},setDrink:'D004',cartItems:[]})",customer);
 const setSnapshot=JSON.parse(vm.runInContext('JSON.stringify(orderSnapshot())',customer));
 assert.equal(setSnapshot.price,37000);
 assert.equal(setSnapshot.normalPrice,44900);
 assert.equal(setSnapshot.discount,7900);

 vm.runInContext(`state.cartItems=[${JSON.stringify(setSnapshot)},{kind:'single',set:null,name:'존스 페이버릿',size:'F',promo:'upup',price:29500,normalPrice:39900,discount:10400,discountLabel:'UP & UP',qty:1,mode:'single',pizza:'P002',pizzaLeft:'P002',pizzaRight:null,pizzaName:'존스 페이버릿',crust:'치즈롤',dough:'오리지널',toppings:{},sides:{},drinks:{},includedSides:{},includedDrinks:{}}];clearCurrentProduct()`,customer);
 const payload=JSON.parse(vm.runInContext('JSON.stringify(buildMobileOrderPayload())',customer));
 assert.deepEqual(payload.items.map(item=>({total:item.total,normalTotal:item.normalTotal,discountAmount:item.discountAmount})),[
  {total:37000,normalTotal:44900,discountAmount:7900},
  {total:29500,normalTotal:39900,discountAmount:10400}
 ]);
 assert.equal(payload.normalAmount,84800);
 assert.equal(payload.discountAmount,18300);
 assert.equal(payload.totalAmount,66500);
 assert.equal(payload.total,66500);
 assert.deepEqual(payload.items[0].includedSides,{S007:1});
 assert.deepEqual(payload.items[0].includedDrinks,{D004:1});
 assert.ok(payload.items.every(item=>Object.values(item).every(value=>value!==undefined)));
 assert.ok([payload.normalAmount,payload.discountAmount,payload.totalAmount,payload.total,...payload.items.flatMap(item=>[item.total,item.normalTotal,item.discountAmount])].every(Number.isFinite));

 const firestoreDocument={...payload,benefit:'normal'};
 assert.deepEqual(Array.from(adminUi.orderPizzaBenefitLabels(firestoreDocument)),['UP&UP','3인 세트']);
 for(const markup of [adminUi.newOrderCard(firestoreDocument),adminUi.renderOrderDetail(firestoreDocument)])assert.match(markup,/UP&amp;UP \+ 3인 세트/);

 vm.runInContext("Object.assign(state,{promo:'upup',set:null,size:'F',mode:'single',left:'P002',right:null,dough:'오리지널',crust:'치즈롤',toppings:{},extraSides:{},extraDrinks:{},setSides:{},setDrink:null})",customer);
 assert.equal(vm.runInContext('price().crust',customer),0,'standalone UP&UP keeps its free crust policy');
 assert.equal(vm.runInContext('price().total',customer),29500,'standalone UP&UP payment remains the Large pizza price');

 vm.runInContext("Object.assign(state,{promo:'upup',set:3,size:'L',mode:'single',left:'P001',right:null,dough:'오리지널',crust:'오리지널',toppings:{},extraSides:{},extraDrinks:{},setSides:{S007:1},setDrink:'D004'})",customer);
 assert.equal(vm.runInContext('price().total',customer),33000,'the default set crust keeps the set base price');
 for(const [setNo,size,crust,fee] of [[2,'R','오리지널',0],[3,'L','치즈롤',4000],[4,'F','치즈롤',5000]]){
  vm.runInContext(`Object.assign(state,{promo:'upup',set:${setNo},size:'${size}',crust:'${crust}'})`,customer);
  assert.equal(vm.runInContext('crustFee()',customer),fee,`${setNo}-person set reads the existing ${size} crust price`);
 }

 const doubled={...setSnapshot,qty:2};
 vm.runInContext(`state.cartItems=[${JSON.stringify(doubled)}];clearCurrentProduct()`,customer);
 const doubledPayload=JSON.parse(vm.runInContext('JSON.stringify(buildMobileOrderPayload())',customer));
 assert.equal(doubledPayload.items[0].total,74000);
 assert.equal(doubledPayload.items[0].normalTotal,89800);
 assert.equal(doubledPayload.items[0].discountAmount,15800);
 assert.deepEqual(doubledPayload.items[0].includedSides,{S007:1},'included sides remain one per set unit in stored data');
 assert.deepEqual(doubledPayload.items[0].includedDrinks,{D004:1},'included drinks remain one per set unit in stored data');
});
