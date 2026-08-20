'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const admin=fs.readFileSync('admin.js','utf8');

test('reservation payment label remains explicit in pending, cooking, ready, completed and detail',()=>{
 const start=admin.indexOf('function reservationPaymentLabel('),end=admin.indexOf('function isCounterTakeout(',start),source=admin.slice(start,end);
 const context={isReservationOrder:order=>order.pickup?.mode==='reserve',reservationCountdownLabel:()=> '5분 남음',statusNames:{},esc:String,PJCommon:{legacyChannel:()=> 'mobile'},adminCustomerIdentityLabel:()=> 'Alex',displayText:String,orderSeatLabel:()=> '-',splitPaymentSummary:()=>null,safeAmounts:()=>({original:2400,discount:0,paid:2400}),money:String,orderBenefitLabel:()=> 'normal'};
 vm.createContext(context);vm.runInContext(source,context);
 for(const [type,label] of [['prepaid','결제완료 예약'],['pay_on_pickup','후결제 예약']])for(const status of ['reservation_pending','cooking','ready','completed']){
  const order={orderType:'takeout',pickup:{mode:'reserve',time:'18:30'},reservationLifecycleId:'life',reservationPaymentType:type,status,language:'en',payment:{}};
  assert.match(context.adminStatusName(order),new RegExp(label));
  assert.match(context.orderOperationsHTML(order),new RegExp(label));
 }
 assert.equal(context.reservationPaymentLabel({orderType:'takeout',pickup:{mode:'reserve'},reservationPaymentType:'unknown'}),'결제유형 확인 필요');
});

test('reservation detail keeps foreign name, Korean phone, pickup timestamp, status and payment type safe',()=>{
 const detailAdmin=admin
  .replace(/const autoReadyCoordinator=createAutoReadyCoordinator\([\s\S]*?function reconcileAutoReadyOrders\(list\)\{autoReadyCoordinator\.reconcile\(list\)\}\n/,'')
  .replace(/function reservationCountdownLabel\([\s\S]*?\nlet preparationOrderId=/,'let preparationOrderId=');
 const detailStart=detailAdmin.indexOf('function normalizedOption'),detailEnd=detailAdmin.indexOf('\nfunction showOrderDetail',detailStart),source=detailAdmin.slice(detailStart,detailEnd);
 const context={
  ORDER_CATALOG:{},PIZZAS:[],TOPPINGS:[],SIDES:[],DRINKS:[],statusNames:{reservation_pending:'예약중',cooking:'조리중',ready:'완료',completed:'완료'},
  PJCommon:{legacyChannel:()=> 'mobile'},displayText:(value,fallback='-')=>typeof value==='string'||typeof value==='number'?String(value).trim()||fallback:fallback,
  esc:value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])),money:value=>`${Number(value||0).toLocaleString('ko-KR')}원`,
  productName:id=>id,adminOrderNumberLabel:order=>String(order.orderNo||'-').replace(/^P/,''),orderSeatLabel:()=>'-',formatTime:()=> '08. 20. 오후 4:43',reservationCountdownLabel:()=> '5분 남음',
  safeCustomerCallName:value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f-\u009f]/gu,'').replace(/<[^>]*>/gu,'').replace(/\s+/gu,' ').trim().slice(0,80):''
 };
 vm.createContext(context);vm.runInContext(source,context);
 const base={id:'r1',orderNo:'P0001',customerNumber:'P0001',orderType:'takeout',pickup:{mode:'reserve',pickupAt:{toDate:()=>new Date('2026-08-20T08:20:00.000Z')}},reservationLifecycleId:'life',reservationPaymentType:'prepaid',status:'reservation_pending',language:'en',items:[],payment:{methodName:'현금'},totalAmount:2400};
 const alex=context.renderOrderDetail({...base,customerIdentityType:'name',customerDisplayName:'Alex'});
 assert.match(alex,/<span>고객명<\/span><strong>Alex<\/strong>/);
 assert.doesNotMatch(alex,/data-action="copy-phone"/,'a foreign name is not treated as a phone number');
 assert.match(alex,/2026\. 08\. 20\. 오후 5:20/);
 assert.match(alex,/예약중 \(5분 남음\)/);
 assert.match(alex,/결제완료 예약/);
 assert.equal(context.renderOrderDetail({...base,customerIdentityType:'name',customerDisplayName:'Alex'}),alex,'reload-equivalent rerender preserves the foreign identity and reservation labels');
 for(const [status,label] of [['cooking','조리중 (예약)'],['ready','조리완료 (예약)'],['completed','픽업완료 (예약)']]){
  const markup=context.renderOrderDetail({...base,customerIdentityType:'name',customerDisplayName:'Alex',status});
  assert.match(markup,new RegExp(label.replace(/[()]/g,'\\$&')));
  assert.match(markup,/결제완료 예약/);
 }
 const korean=context.renderOrderDetail({...base,language:'ko',customerIdentityType:'phone_last4',phone:'01012345678',reservationPaymentType:'pay_on_pickup',status:'completed'});
 assert.match(korean,/<span>연락처<\/span><strong>01012345678<\/strong>/);
 assert.match(korean,/픽업완료 \(예약\)/);
 assert.match(korean,/후결제 예약/);
 for(const unsafe of [undefined,null,{value:'Alex'}]){
  const markup=context.renderOrderDetail({...base,customerIdentityType:'name',customerDisplayName:unsafe,pickup:{mode:'reserve'},reservationPaymentType:unsafe,status:'unknown'});
  assert.doesNotMatch(markup,/undefined|null|\[object Object\]/);
  assert.match(markup,/확인 필요/);
 }
});

test('production reservation prep announcement is queued exactly after a successful transaction',async()=>{
 const source=admin.slice(admin.indexOf('async function executeReservationLifecycle('),admin.indexOf('const reservationLifecycleCoordinator=',admin.indexOf('async function executeReservationLifecycle(')));
 const calls=[];
 const context={db:{},Date:{now:()=>123},firebase:{firestore:{FieldValue:{serverTimestamp(){}}},auth:()=>({currentUser:{uid:'admin'}})},orderBusinessDayKey(){},enqueueSpeech:text=>calls.push(text),enqueueAutomaticTakeoutCall:()=>calls.push('ready')};
 vm.createContext(context);
 context.advanceReservationLifecycleTransaction=async()=>({announcement:'prep'});vm.runInContext(source,context);
 await context.executeReservationLifecycle({id:'r1',reservationLifecycleId:'life',pickup:{pickupAt:1}});
 assert.deepEqual(calls,['예약 주문 조리 시간입니다.']);
 calls.length=0;context.advanceReservationLifecycleTransaction=async()=>{throw Object.assign(new Error('stale'),{code:'order/stale-state'})};
 await assert.rejects(()=>context.executeReservationLifecycle({id:'r1',reservationLifecycleId:'life',pickup:{pickupAt:1}}));
 assert.deepEqual(calls,[]);
});
