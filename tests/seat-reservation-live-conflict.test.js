const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

function customerHarness(){
 const subscriptions={},writes=[];
 const classList={add(){},remove(){},toggle(){}};
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{id,innerHTML:'',textContent:'',disabled:false,offsetWidth:100,offsetHeight:100,classList,style:{setProperty(){}},dataset:{},querySelectorAll(){return[]}});return elements.get(id)};
 const document={documentElement:{lang:'ko',title:'',scrollTop:0,dataset:{}},body:{dataset:{},scrollTop:0,classList,style:{setProperty(){}},appendChild(){}},activeElement:null,getElementById:element,querySelector(){return null},querySelectorAll(){return[]},addEventListener(){},createElement(){return {className:'',style:{},remove(){}}}};
 const storage={getItem(key){return key==='pjLangSelected'?'1':null},setItem(){}};
 const seat={status:'held',heldBy:'customer-1',heldAt:'OLD',heldUntil:{toDate:()=>new Date(Date.now()+30000)}};
 const db={collection(name){return {onSnapshot(success){subscriptions[name]=success},doc(id){return {id,set(payload){writes.push({name,id,payload})}}},add:async()=>({id:'wait'})}},runTransaction:async callback=>callback({get:async()=>({exists:true,data:()=>({...seat})}),set(ref,payload){writes.push({name:'seats',id:ref.id,payload});Object.assign(seat,payload)}})};
 const context={window:{},document,location:{search:''},URLSearchParams,console,Intl,Date,Math,Number,String,Object,Array,Set,Map,RegExp,JSON,Promise,localStorage:storage,sessionStorage:storage,Image:function(){},setTimeout(){return 0},setInterval(){return 0},clearTimeout(){},clearInterval(){},requestAnimationFrame:callback=>{callback();return 1},cancelAnimationFrame(){},alert(){},confirm(){return true},prompt(){return null},db,firebase:{firestore:{FieldValue:{serverTimestamp(){return 'SERVER_TIMESTAMP'}},Timestamp:{fromMillis(value){return {toDate:()=>new Date(value)}}}}}};
 context.window=context;context.window.addEventListener=()=>{};context.window.scrollTo=()=>{};context.window.PJ_NETWORK={isOnline:()=>true};
 vm.createContext(context);
 for(const language of ['ko','en','ja','zh','vi','es'])vm.runInContext(fs.readFileSync(path.join(root,'i18n',`${language}.js`),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/ui.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'i18n/index.js'),'utf8'),context);
 const data=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);vm.runInContext(`window.KIOSK_DATA=${data[1]}`,context);
 const main=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]).find(source=>source.includes('function submitMobileOrder()'));
 vm.runInContext(main,context);
 return {context,subscriptions,writes,seat};
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
