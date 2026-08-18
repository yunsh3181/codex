const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function customerHarness(options={}){
 const subscriptions={},writes=[];let transactionCount=0;
 const classList={add(){},remove(){},toggle(){}};
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',disabled:false,offsetWidth:100,offsetHeight:100,classList,style:{setProperty(){}},dataset:{},querySelectorAll(){return[]}});return elements.get(id)};
 const document={documentElement:{lang:'ko',title:'',scrollTop:0,dataset:{}},body:{dataset:{},scrollTop:0,classList,style:{setProperty(){}},appendChild(){}},activeElement:null,getElementById:element,querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},createElement(){return {className:'',style:{},remove(){}}}};
 const storage={getItem(key){return key==='pjLangSelected'?'1':null},setItem(){}};
 const seat={status:'held',heldBy:'customer-1',heldAt:'OLD',heldUntil:{toDate:()=>new Date(Date.now()+30000)}};
 const db={collection(name){return {onSnapshot(success){subscriptions[name]=success},doc(id){return {id,collectionName:name,set(payload){writes.push({name,id,payload})}}},add:async()=>({id:'wait'})}},runTransaction:async callback=>{transactionCount+=1;options.beforeTransaction?.();return callback({get:async ref=>({exists:true,data:()=>ref.collectionName==='seats'?({...seat}):({})}),set(ref,payload){writes.push({name:ref.collectionName||'seats',id:ref.id,payload});if(ref.collectionName==='seats')Object.assign(seat,payload)}})}};
 const context={window:{},document,location:{search:''},URLSearchParams,console,Intl,Date,Math,Number,String,Object,Array,Set,Map,RegExp,JSON,Promise,localStorage:storage,sessionStorage:storage,Image:function(){},setTimeout(){return 0},setInterval(){return 0},clearTimeout(){},clearInterval(){},requestAnimationFrame:callback=>{callback();return 1},cancelAnimationFrame(){},alert(){},confirm(){return true},prompt(){return null},db,firebase:{firestore:{FieldValue:{serverTimestamp(){return 'SERVER_TIMESTAMP'}},Timestamp:{fromMillis(value){return {toDate:()=>new Date(value)}}}}}};
 context.window=context;context.window.addEventListener=()=>{};context.window.scrollTo=()=>{};context.window.PJ_NETWORK={isOnline:()=>true};context.window.PJ_BOTTLE_SEAT_POLICY={isBottleSeat:id=>String(id).startsWith('annex-')||String(id).startsWith('room-'),getBottleSeatAvailability:()=>({available:options.available!==false,reason:options.reason||'open',supported:true}),millisecondsUntilNextBoundary:()=>86400000};
 vm.createContext(context);
 for(const language of ['ko','en','ja','zh','vi','es'])vm.runInContext(fs.readFileSync(path.join(root,'i18n',`${language}.js`),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/ui.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/index.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'seat-capacity-policy.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'kiosk-seat-transaction.js'),'utf8'),context);
 const data=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);vm.runInContext(`window.KIOSK_DATA=${data[1]}`,context);
 const main=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).find(source=>source.includes('function submitMobileOrder()'));
 vm.runInContext(main,context);
 return {context,subscriptions,writes,seat,transactionCount:()=>transactionCount};
}

test('held customer session receives one conflict modal and reset preserves reserved',async()=>{
 const {context,subscriptions,writes,seat}=customerHarness();
 vm.runInContext("Object.assign(state,{step:'promo',orderType:'dinein',selectedTables:['papa-2'],cartItems:[{id:'cart-1'}],promo:'set',left:'P001',firebaseOrderId:null})",context);
 seat.status='reserved';seat.heldBy=null;seat.heldAt=null;seat.heldUntil=null;
 const snapshot={forEach(callback){callback({id:'papa-2',data:()=>({...seat})})}};
 subscriptions.seats(snapshot);subscriptions.seats(snapshot);
 assert.equal(vm.runInContext("state.modal",context),'seatReservationConflict');
 assert.equal(vm.runInContext("seatReservationConflictActive",context),true);
 assert.match(vm.runInContext('modalView()',context),/선택하신 좌석은 예약 완료되었습니다\. 다른 좌석을 선택해 주세요\./);
 vm.runInContext('confirmSeatReservationConflict()',context);
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify({step:state.step,selectedTables:state.selectedTables,cartItems:state.cartItems,promo:state.promo,left:state.left,firebaseOrderId:state.firebaseOrderId})",context)),{step:'home',selectedTables:[],cartItems:[],promo:null,left:null,firebaseOrderId:null});
 assert.equal(seat.status,'reserved');
 assert.equal(writes.length,0);
});

test('reservation/order races preserve exactly one valid winner',()=>{
 const reserve=seat=>{if(!(seat.status==='empty'||(seat.status==='held'&&!seat.orderId)))return false;Object.assign(seat,{status:'reserved',heldBy:null,heldAt:null,heldUntil:null,partySize:null});return true};
 const submit=(seat,orders)=>{if(seat.status==='reserved')return false;if(seat.status!=='held'||seat.heldBy!=='customer-1')return false;orders.push('order-1');Object.assign(seat,{orderId:'order-1',heldBy:null,heldUntil:null});return true};
 let seat={status:'held',heldBy:'customer-1'},orders=[];
 assert.equal(reserve(seat),true);assert.equal(submit(seat,orders),false);assert.equal(orders.length,0);assert.equal(seat.status,'reserved');
 seat={status:'held',heldBy:'customer-1'};orders=[];
 assert.equal(submit(seat,orders),true);assert.equal(reserve(seat),false);assert.deepEqual(orders,['order-1']);assert.equal(seat.orderId,'order-1');
 seat={status:'held',heldBy:'customer-1'};
 assert.equal(reserve(seat),true);assert.equal(reserve(seat),false);assert.equal(seat.status,'reserved');
});

test('customer hold rechecks bottle hours inside transaction and ordinary seats remain available',async()=>{
 const boundary={available:true,beforeTransaction(){this.available=false}};
 const bottle=customerHarness(boundary);
 vm.runInContext("Object.assign(state,{step:'table',orderType:'dinein',partySize:2,diningArea:'annex',selectedTables:[]})",bottle.context);
 await bottle.context.toggleTable('annex-1');
 assert.equal(bottle.writes.length,0);assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(state.selectedTables)',bottle.context)),[]);
 const holiday=customerHarness({available:false,reason:'holiday'});
 vm.runInContext("Object.assign(state,{step:'table',orderType:'dinein',partySize:2,diningArea:'annex',selectedTables:[]})",holiday.context);
 await holiday.context.toggleTable('annex-1');assert.equal(holiday.writes.length,0);
 holiday.seat.status='empty';holiday.seat.heldBy=null;
 vm.runInContext("Object.assign(state,{diningArea:'papa',selectedTables:[]})",holiday.context);
 await holiday.context.toggleTable('papa-2');assert.equal(holiday.writes.some(write=>write.name==='seats'&&write.payload?.status==='held'),true);
});

test('final order boundary writes no order or seat linkage and shows one bottle conflict modal',async()=>{
 const boundary={available:true,beforeTransaction(){this.available=false}};const harness=customerHarness(boundary);
 vm.runInContext("Object.assign(state,{step:'payment',orderType:'dinein',partySize:2,diningArea:'annex',selectedTables:['annex-1'],left:'P001',promo:'normal',mode:'single',dough:'오리지널',crust:'오리지널',phone:'12345678',paymentMethod:'card',firebaseOrderId:null})",harness.context);
 await harness.context.complete();
 assert.equal(harness.writes.filter(write=>write.name==='orders').length,0);
 assert.equal(harness.writes.filter(write=>write.payload?.orderId).length,0);
 assert.equal(vm.runInContext('state.modal',harness.context),'bottleHoursConflict');
 harness.context.showBottleHoursConflict();assert.equal(vm.runInContext('state.modal',harness.context),'bottleHoursConflict');
});

test('bottle conflict reset releases once, clears order state, and committed orders are protected',async()=>{
 const harness=customerHarness({available:false,reason:'after-close'});
 vm.runInContext("Object.assign(state,{step:'promo',orderType:'dinein',selectedTables:['annex-1'],cartItems:[{id:'cart'}],promo:'set',left:'P001',firebaseOrderId:null});checkBottleHoursBoundary();checkBottleHoursBoundary()",harness.context);
 assert.equal(vm.runInContext('state.modal',harness.context),'bottleHoursConflict');
 harness.context.confirmBottleHoursConflict();await Promise.resolve();await Promise.resolve();
 assert.equal(harness.transactionCount(),1);
 assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify({step:state.step,selectedTables:state.selectedTables,cartItems:state.cartItems,promo:state.promo,left:state.left,firebaseOrderId:state.firebaseOrderId})",harness.context)),{step:'home',selectedTables:[],cartItems:[],promo:null,left:null,firebaseOrderId:null});
 const committed=customerHarness({available:false,reason:'holiday'});
 vm.runInContext("Object.assign(state,{step:'done',orderType:'dinein',selectedTables:['annex-1'],firebaseOrderId:'order-1'});checkBottleHoursBoundary();checkBottleHoursBoundary()",committed.context);
 assert.equal(vm.runInContext('state.step',committed.context),'done');assert.equal(vm.runInContext('state.firebaseOrderId',committed.context),'order-1');assert.equal(vm.runInContext('state.modal',committed.context),null);assert.equal(committed.transactionCount(),0);
});
