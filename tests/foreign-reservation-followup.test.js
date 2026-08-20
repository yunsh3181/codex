'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const admin=fs.readFileSync('admin.js','utf8');

test('reservation payment label remains explicit in pending, cooking, ready and detail',()=>{
 const start=admin.indexOf('function reservationPaymentLabel('),end=admin.indexOf('function isCounterTakeout(',start),source=admin.slice(start,end);
 const context={isReservationOrder:order=>order.pickup?.mode==='reserve',reservationCountdownLabel:()=> '5분 남음',statusNames:{},esc:String,PJCommon:{legacyChannel:()=> 'mobile'},adminCustomerIdentityLabel:()=> 'Alex',displayText:String,orderSeatLabel:()=> '-',splitPaymentSummary:()=>null,safeAmounts:()=>({original:2400,discount:0,paid:2400}),money:String,orderBenefitLabel:()=> 'normal'};
 vm.createContext(context);vm.runInContext(source,context);
 for(const [type,label] of [['prepaid','결제완료 예약'],['pay_on_pickup','후결제 예약']])for(const status of ['reservation_pending','cooking','ready']){
  const order={orderType:'takeout',pickup:{mode:'reserve',time:'18:30'},reservationLifecycleId:'life',reservationPaymentType:type,status,language:'en',payment:{}};
  assert.match(context.adminStatusName(order),new RegExp(label));
  assert.match(context.orderOperationsHTML(order),new RegExp(label));
 }
 assert.equal(context.reservationPaymentLabel({orderType:'takeout',pickup:{mode:'reserve'},reservationPaymentType:'unknown'}),'결제유형 확인 필요');
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
