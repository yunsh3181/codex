'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const split=require('../meal-ticket-split');

test('100-won helper produces the required balanced examples with larger shares last',()=>{
 const examples=[
  [30100,3,[10000,10000,10100]],
  [30500,3,[10100,10200,10200]],
  [30800,3,[10200,10300,10300]],
  [42000,4,[10500,10500,10500,10500]]
 ];
 for(const [total,count,expected] of examples){
  const plan=split.calculate(total,count);
  assert.deepEqual(plan.amounts,expected);
  assert.equal(plan.amounts.reduce((sum,amount)=>sum+amount,0),total);
  assert.ok(plan.amounts.every(amount=>Number.isSafeInteger(amount)&&amount%100===0));
  assert.ok(Math.max(...plan.amounts)-Math.min(...plan.amounts)<=100);
  assert.deepEqual([...plan.amounts].sort((a,b)=>a-b),plan.amounts);
 }
});

test('invalid totals and counts fail closed without approximate arithmetic',()=>{
 for(const [total,count] of [[30101,3],[30100,0],[30100,-1],[30100,2.5],[30100,21],[100,2],[0,1],[-100,1],[NaN,3],[Infinity,3],[Number.MAX_SAFE_INTEGER+1,3]])assert.equal(split.calculate(total,count),null,`${total}/${count}`);
 assert.deepEqual(split.calculate(100,1).amounts,[100]);
});

function customerHarness(){
 const writes=[];let transactions=0,paymentApiCalls=0;
 const classList={add(){},remove(){},toggle(){}};
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',disabled:false,offsetWidth:100,offsetHeight:100,classList,style:{setProperty(){}},dataset:{},querySelectorAll(){return[]}});return elements.get(id)};
 const document={documentElement:{lang:'ko',title:'',scrollTop:0,dataset:{}},body:{dataset:{},scrollTop:0,classList,style:{setProperty(){}},appendChild(){}},activeElement:null,getElementById:element,querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},createElement(){return {className:'',style:{},remove(){}}}};
 const storage={getItem(key){return key==='pjLangSelected'?'1':null},setItem(){}};
 const db={collection(name){return {onSnapshot(){},doc(){return {id:'order-1',collectionName:name}},add:async()=>({id:'wait'})}},runTransaction:async callback=>{transactions+=1;return callback({set(ref,value){writes.push({name:ref.collectionName,value})}})}};
 const context={window:{},document,location:{search:''},URLSearchParams,console,Intl,Date,Math,Number,String,Object,Array,Set,Map,RegExp,JSON,Promise,localStorage:storage,sessionStorage:storage,Image:function(){},setTimeout(){return 0},setInterval(){return 0},clearTimeout(){},clearInterval(){},requestAnimationFrame:callback=>{callback();return 1},cancelAnimationFrame(){},alert(){},confirm(){return true},prompt(){return null},fetch:async()=>{paymentApiCalls+=1;throw new Error('payment API must not be called')},db,firebase:{firestore:{FieldValue:{serverTimestamp(){return 'SERVER_TIMESTAMP'}},Timestamp:{fromMillis(value){return {toDate:()=>new Date(value)}}}}}};
 context.window=context;context.window.addEventListener=()=>{};context.window.scrollTo=()=>{};context.window.PJ_MEAL_TICKET_SPLIT=split;context.window.PJ_NETWORK={isOnline:()=>true};context.window.PJ_BOTTLE_SEAT_POLICY={isBottleSeat:()=>false,getBottleSeatAvailability:()=>({available:true}),millisecondsUntilNextBoundary:()=>86400000};
 vm.createContext(context);
 for(const language of ['ko','en','ja','zh','vi','es'])vm.runInContext(fs.readFileSync(path.join(root,'i18n',`${language}.js`),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/ui.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/index.js'),'utf8'),context);
 const data=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);
 vm.runInContext(`window.KIOSK_DATA=${data[1]}`,context);
 const main=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).find(source=>source.includes('function submitMobileOrder()'));
 vm.runInContext(main,context);
 return {context,writes,transactions:()=>transactions,paymentApiCalls:()=>paymentApiCalls};
}

function seed(context,total,method='meal_ticket',count=3){
 const item={promo:'normal',set:null,size:'L',mode:'single',pizzaLeft:'P001',pizzaRight:null,pizzaName:'페퍼로니',crust:'오리지널',dough:'오리지널',qty:1,price:total,normalPrice:total,discount:0,toppings:{},sides:{},drinks:{},includedSides:{},includedDrinks:{}};
 vm.runInContext(`Object.assign(state,{step:'payment',orderType:'takeout',orderTiming:'now',phone:'12341234',disposables:false,paymentMethod:${JSON.stringify(method)},splitCount:${JSON.stringify(count)},cartItems:[${JSON.stringify(item)}],left:null,right:null})`,context);
}

test('UI and order payload use the same helper result',()=>{
 const {context}=customerHarness();seed(context,30500);
 const payload=JSON.parse(vm.runInContext('JSON.stringify(buildMobileOrderPayload())',context));
 assert.deepEqual(payload.payment.splitAmounts,[10100,10200,10200]);
 vm.runInContext('render()',context);
 const markup=context.document.getElementById('main').innerHTML;
 for(const amount of ['10,100원','10,200원'])assert.match(markup,new RegExp(amount));
 assert.equal((markup.match(/10,200원/g)||[]).length,2);
 assert.match(markup,/100원 단위 차액은 뒤쪽 결제자부터 반영됩니다/);
 assert.match(html,/function mealTicketSplit\(total,count\)\{return window\.PJ_MEAL_TICKET_SPLIT\?\.calculate\(total,count\)\|\|null\}/);
 assert.doesNotMatch(html,/function splitParts/);
});

test('invalid meal-ticket input causes zero writes, zero partial records, and zero payment calls',async()=>{
 for(const [total,count] of [[30101,3],[30100,0],[30100,2.5]]){
  const harness=customerHarness();seed(harness.context,total,'meal_ticket',count);
  assert.equal(vm.runInContext('validPayment()',harness.context),false);
  await harness.context.complete();
  assert.equal(harness.transactions(),0);
  assert.deepEqual(harness.writes,[]);
  assert.equal(harness.paymentApiCalls(),0);
  assert.match(harness.context.document.getElementById('submitError').textContent,/관리자에게 확인/);
  assert.throws(()=>vm.runInContext('buildMobileOrderPayload()',harness.context),error=>error.code==='MEAL_TICKET_SPLIT_INVALID');
 }
});

test('ordinary card and cash payload totals remain unchanged',()=>{
 for(const method of ['card','cash']){
  const {context}=customerHarness();seed(context,30101,method,99);
  assert.equal(vm.runInContext('validPayment()',context),true);
  const payload=JSON.parse(vm.runInContext('JSON.stringify(buildMobileOrderPayload())',context));
  assert.equal(payload.total,30101);
  assert.equal(payload.totalAmount,30101);
  assert.deepEqual(payload.payment.splitAmounts,[30101]);
  assert.equal(payload.payment.splitCount,1);
 }
});

test('legacy order data and administrator code are not rewritten by the new helper',()=>{
 const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
 assert.doesNotMatch(admin,/PJ_MEAL_TICKET_SPLIT|mealTicketSplit/);
 assert.match(admin,/stored=Array\.isArray\(payment\.splitAmounts\)/);
});
