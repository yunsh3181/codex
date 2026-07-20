const app=document.getElementById('app');
const money=n=>new Intl.NumberFormat('ko-KR').format(Math.round(n))+'원';
const state={step:'home',orderType:null,promo:null,dough:null,size:null,crust:null,pizzaMode:'single',pizza:null,pizzaLeft:null,pizzaRight:null,halfStage:'left',toppings:{},sides:{},drinks:{},includedSides:{},includedDrinks:{},set:null,category:'ALL',orderNo:null,toppingExpanded:false,cart:[],seatZone:null,seatId:null,seatName:null,seatCapacity:null,seats:{},partySize:null,pickupMode:null,pickupHour:null,pickupMinute:null,pickupTime:null,phone:'010',phoneDisplay:'010-',phonePrefixCleared:false};
const steps=['home','type','partySize','pickup','pickupTime','phone','seatZone','seatSelect','promo','setChoice','pizzaMode','dough','size','crust','pizza','topping','side','drink','review','cart','done'];
const {doughName,doughDesc,sizeName,sizeDesc,crustName,crustDesc,crustSizeLabel,toppingName,toppingDesc,toppingCategory,toppingPriceLabel,sideName,sideDesc,sideCategory,sidePriceLabel,drinkName,drinkDesc,drinkCategory,drinkPriceLabel,drinkGroupName,drinkVariant}=window.PJ_I18N||{};
const labels={type:'이용방법',partySize:'인원 선택',pickup:'포장 방식',pickupTime:'예약 시간',phone:'전화번호',seatZone:'구역 선택',seatSelect:'좌석 선택',promo:'혜택',setChoice:'세트 선택',pizzaMode:'피자 구성',dough:'도우',size:'사이즈',crust:'크러스트',pizza:'피자',topping:'토핑',side:'사이드',drink:'음료',review:'주문확인',cart:'장바구니'};

const STORE_OPEN_MIN=11*60;
const STORE_CLOSE_MIN=21*60;
const HAPPY_START_MIN=16*60;
const HAPPY_END_MIN=20*60;
const IMMEDIATE_MIN=15;
const IMMEDIATE_MAX=20;
const HOLD_WARN_MS=10000;
const HOLD_RELEASE_MS=20000;
let holdWarnTimer=null,holdReleaseTimer=null;

const ZONE_RULES={
 papa:{open:11*60,close:20*60,weekend:true},
 outside:{open:11*60,close:20*60,weekend:true},
 bottle:{open:11*60,close:14*60,weekend:false},
 room:{open:11*60,close:14*60,weekend:false}
};

function pad2(n){return String(n).padStart(2,'0')}
function nowMinutes(){const d=new Date();return d.getHours()*60+d.getMinutes()}
function ceil5(v){return Math.ceil(v/5)*5}
function minPickupMinutes(){return Math.max(STORE_OPEN_MIN,ceil5(nowMinutes()+30))}
function immediatePickupRange(){const now=nowMinutes();return {from:ceil5(now+IMMEDIATE_MIN),to:ceil5(now+IMMEDIATE_MAX)}}
function openReservationTime(){
 const hours=availableHours();
 if(!hours.length)return alert('오늘 예약 가능한 시간이 없습니다.');
 state.pickupMode='reserve';
 if(state.pickupHour===null)state.pickupHour=hours[0];
 const mins=availableMinutesForHour(state.pickupHour);
 if(!mins.includes(state.pickupMinute))state.pickupMinute=mins[0]??null;
 state.pickupTime=state.pickupMinute===null?null:pad2(state.pickupHour)+':'+pad2(state.pickupMinute);
 state.step='pickupTime';render();
}
function chooseImmediatePickup(){const r=immediatePickupRange();state.pickupMode='now';state.pickupHour=Math.floor(r.to/60);state.pickupMinute=r.to%60;state.pickupTime=pad2(state.pickupHour)+':'+pad2(state.pickupMinute);state.step='phone';render()}
function pickupMinutes(){return state.pickupHour===null||state.pickupMinute===null?null:Number(state.pickupHour)*60+Number(state.pickupMinute)}
function pickupIsHappyHour(){const m=pickupMinutes();return state.orderType==='takeout'&&m!==null&&m>=HAPPY_START_MIN&&m<=HAPPY_END_MIN}
function availableHours(){const min=minPickupMinutes(),a=[];for(let h=11;h<=21;h++){if(h*60+55>=min&&h*60<=STORE_CLOSE_MIN)a.push(h)}return a}
function availableMinutesForHour(h){const min=minPickupMinutes(),a=[];for(let m=0;m<60;m+=5){const v=h*60+m;if(v>=min&&v<=STORE_CLOSE_MIN)a.push(m)}return a}
function choosePickupHour(h){
 const pageY=window.scrollY;
 const hs=document.querySelector('.hour-wheel')?.scrollTop||0;
 const ms=document.querySelector('.minute-wheel')?.scrollTop||0;
 state.pickupHour=Number(h);
 const a=availableMinutesForHour(state.pickupHour);
 state.pickupMinute=a.includes(state.pickupMinute)?state.pickupMinute:(a[0]??null);
 state.pickupTime=state.pickupMinute===null?null:pad2(state.pickupHour)+':'+pad2(state.pickupMinute);
 render();
 requestAnimationFrame(()=>{window.scrollTo(0,pageY);const h2=document.querySelector('.hour-wheel'),m2=document.querySelector('.minute-wheel');if(h2)h2.scrollTop=hs;if(m2)m2.scrollTop=ms});
}
function choosePickupMinute(m){
 const pageY=window.scrollY;
 const hs=document.querySelector('.hour-wheel')?.scrollTop||0;
 const ms=document.querySelector('.minute-wheel')?.scrollTop||0;
 state.pickupMinute=Number(m);
 state.pickupTime=pad2(state.pickupHour)+':'+pad2(state.pickupMinute);
 render();
 requestAnimationFrame(()=>{window.scrollTo(0,pageY);const h2=document.querySelector('.hour-wheel'),m2=document.querySelector('.minute-wheel');if(h2)h2.scrollTop=hs;if(m2)m2.scrollTop=ms});
}
function confirmPickup(){
 if(state.pickupMode!=='reserve')return;
 if(state.pickupHour===null||state.pickupMinute===null)return alert('픽업 시간을 선택해 주세요.');
 state.pickupTime=`${pad2(state.pickupHour)}:${pad2(state.pickupMinute)}`;
 state.step='phone';render();
}
function formatPhone(raw){
 const d=String(raw||'').replace(/\D/g,'').slice(0,11);
 if(!d)return '';
 if(d.length<=3)return d+(d.length===3?'-':'');
 if(d.length<=7)return d.slice(0,3)+'-'+d.slice(3);
 return d.slice(0,3)+'-'+d.slice(3,7)+'-'+d.slice(7);
}
function appendPhoneDigit(n){if(state.phone.length<11){state.phone+=String(n);state.phoneDisplay=formatPhone(state.phone);renderPhoneOnly()}}
function backspacePhone(){
 if(!state.phonePrefixCleared&&state.phone.length<=3)return;
 state.phone=state.phone.slice(0,-1);state.phoneDisplay=formatPhone(state.phone);renderPhoneOnly();
}
function clearPhoneAll(){state.phone='';state.phoneDisplay='';state.phonePrefixCleared=true;render()}
function renderPhoneOnly(){const el=document.querySelector('.phone-display');if(el)el.textContent=state.phoneDisplay||'전화번호를 입력하세요'}
function confirmPhone(){
 const digits=String(state.phone||'').replace(/\D/g,'');
 if(digits.length<9||digits.length>11)return alert('전화번호를 정확히 입력해 주세요.');
 state.orderNo=digits.slice(-4);state.step='promo';render();
}
function zoneAvailability(zone){const r=ZONE_RULES[zone],d=new Date(),weekend=[0,6].includes(d.getDay()),m=nowMinutes();if(!r.weekend&&weekend)return {open:false,reason:'주말 미운영'};if(m<r.open||m>r.close)return {open:false,reason:`${pad2(Math.floor(r.open/60))}:00~${pad2(Math.floor(r.close/60))}:00 운영`};return {open:true,reason:'운영 중'}}
function requiredRoomTables(people){return Math.ceil(Number(people||0)/4)}
function roomFreeTables(){return SEAT_MASTER.filter(s=>s.zone==='room').map(s=>seatInfo(s.id)).filter(s=>s.status==='empty').length}
function clearHoldTimers(){if(holdWarnTimer)clearTimeout(holdWarnTimer);if(holdReleaseTimer)clearTimeout(holdReleaseTimer);holdWarnTimer=holdReleaseTimer=null}
function armHoldTimers(){clearHoldTimers();if(!state.seatId)return;holdWarnTimer=setTimeout(()=>{if(!state.seatId||state.step==='done')return;const keep=confirm('좌석 선택 후 10초 동안 조작이 없습니다.\n10초 후 좌석이 자동으로 해제됩니다.\n계속 주문하시겠습니까?');if(keep)armHoldTimers()},HOLD_WARN_MS);holdReleaseTimer=setTimeout(async()=>{if(!state.seatId||state.step==='done')return;await releaseCurrentSeat();alert('20초 동안 조작이 없어 좌석이 자동으로 해제되었습니다.');state.step='seatZone';render()},HOLD_RELEASE_MS)}
document.addEventListener('click',()=>{if(state.seatId&&state.step!=='done')armHoldTimers()},{passive:true});
document.addEventListener('touchstart',()=>{if(state.seatId&&state.step!=='done')armHoldTimers()},{passive:true});

function resetAfter(key){const order=['dough','size','crust','pizza'];const i=order.indexOf(key);order.slice(i+1).forEach(k=>state[k]=null);state.toppings={};}
function crustOptionPrice(crust){
 if(crust==='오리지널'||!crust)return 0;
 const size=effectiveSize();
 return size==='L'?4000:5000;
}
function crustPrice(){return state.promo==='upup'?0:crustOptionPrice(state.crust)}
function effectiveSize(){return state.promo==='upup'?'F':state.size}
function isHalf(){return state.pizzaMode==='half'}
function halfFee(){return isHalf()?1000:0}
function toppingPrice(){return Object.entries(state.toppings).reduce((s,[id,q])=>{const t=TOPPINGS.find(x=>x.id===id);return s+(t?.price[effectiveSize()]||0)*q},0)}
function pizzaPriceById(id,size){const p=PIZZAS.find(x=>x.id===id);return p?(p.prices[size]||0):0}
function basePizzaPrice(){
 const size=state.promo==='upup'?'L':state.size;
 if(isHalf())return (pizzaPriceById(state.pizzaLeft,size)+pizzaPriceById(state.pizzaRight,size))/2;
 return state.pizza?pizzaPriceById(state.pizza,size):0;
}
function pizzaDisplayName(){
 if(isHalf()){
  const a=pizzaName(PIZZAS.find(x=>x.id===state.pizzaLeft));
  const b=pizzaName(PIZZAS.find(x=>x.id===state.pizzaRight));
  return `${a} / ${b}`;
 }
 const item=PIZZAS.find(x=>x.id===state.pizza);return item?pizzaName(item):'';
}
function upupDiscount(){
 if(state.promo!=='upup')return 0;
 const ids=isHalf()?[state.pizzaLeft,state.pizzaRight]:[state.pizza];
 if(ids.some(x=>!x))return 0;
 const sizeUpgrade=ids.reduce((sum,id)=>sum+Math.max(0,pizzaPriceById(id,'F')-pizzaPriceById(id,'L'))/ids.length,0);
 return sizeUpgrade+5000;
}
function sideTotal(){return Object.entries(state.sides).reduce((s,[id,q])=>s+(SIDES.find(x=>x.id===id)?.price||0)*q,0)}
function drinkTotal(){return Object.entries(state.drinks).reduce((s,[id,q])=>s+(DRINKS.find(x=>x.id===id)?.price||0)*q,0)}
function visibleSides(){
 if(state.set===2)return SIDES.filter(s=>s.set2);
 if(state.set===3||state.set===4)return SIDES.filter(s=>!s.setExcluded&&!['corn','coleslaw'].includes(s.id));
 return SIDES;
}
function visibleDrinks(){
 if(state.set===2)return DRINKS.filter(d=>d.small);
 if(state.set===3||state.set===4)return DRINKS.filter(d=>d.large);
 return DRINKS;
}
function setSideLimit(){return state.set===4?2:state.set?1:9}
function setDrinkLimit(){return state.set?1:9}
function selectedCount(key){return Object.values(state[key]).reduce((a,b)=>a+b,0)}
function includedCount(key){return Object.values(state[key]).reduce((a,b)=>a+b,0)}
function calc(){
 const pizzaBase=basePizzaPrice(), crust=crustPrice(), topping=toppingPrice(), half=halfFee();
 let sides=sideTotal(),drinks=drinkTotal(),discount=0,total=0;
 if(state.promo==='happyhour'&&state.orderType==='takeout'){
   total=15000+crust+topping+sides+drinks;
 } else if(state.set){
   const setBase=state.set===2?24000:state.set===3?33000:42000;
   total=setBase+half+crust+topping+sides+drinks;
 } else if(state.promo==='takeout'&&state.orderType==='takeout'&&['L','F'].includes(state.size)){
   const discountBase=pizzaBase+half+crust+topping;
   discount=discountBase*.2;
   total=discountBase-discount+sides+drinks;
 } else {
   total=pizzaBase+half+crust+topping+sides+drinks;
 }
 return{pizza:pizzaBase,half,crust,topping,sides,drinks,discount,total,upupDiscount:upupDiscount()};
}



const SEAT_ZONES=[
 {id:'papa',name:'Papa Zone',img:'assets/images/seats/papa_zone.png',desc:'파파존스 매장 좌석'},
 {id:'outside',name:'Outside Zone',img:'assets/images/seats/outside_zone.png',desc:'야외 테라스 좌석'},
 {id:'bottle',name:'Bottle Zone',img:'assets/images/seats/bottle_zone.png',desc:'조용하고 편안한 실내 좌석'},
 {id:'room',name:'Room Zone',img:'assets/images/seats/room_zone.png',desc:'프라이빗룸 좌석'}
];
const SEAT_MASTER=[
 {id:'papa-1',zone:'papa',name:'커플석',label:'Papa 1',capacity:2},
 {id:'papa-2',zone:'papa',name:'바테이블석',label:'Papa 2',capacity:4},
 {id:'outside-1',zone:'outside',name:'야외석1',label:'Outside 1',capacity:4},
 {id:'outside-2',zone:'outside',name:'야외석2',label:'Outside 2',capacity:4},
 {id:'outside-3',zone:'outside',name:'야외석3',label:'Outside 3',capacity:4},
 {id:'outside-4',zone:'outside',name:'야외석4',label:'Outside 4',capacity:4},
 {id:'bottle-1',zone:'bottle',name:'보틀1',label:'Bottle 1',capacity:2},
 {id:'bottle-2',zone:'bottle',name:'보틀2',label:'Bottle 2',capacity:4},
 {id:'bottle-3',zone:'bottle',name:'보틀3',label:'Bottle 3',capacity:4},
 {id:'bottle-4',zone:'bottle',name:'보틀4',label:'Bottle 4',capacity:2},
 {id:'room-1',zone:'room',name:'룸테이블1',label:'Room 1',capacity:4},
 {id:'room-2',zone:'room',name:'룸테이블2',label:'Room 2',capacity:4},
 {id:'room-3',zone:'room',name:'룸테이블3',label:'Room 3',capacity:4}
];
const seatStatusName={empty:'빈자리',held:'선택중',occupied:'사용중',cleaning:'정리중',reserved:'예약'};
let seatUnsubscribe=null;
function subscribeSeats(){
 if(seatUnsubscribe)return;
 seatUnsubscribe=db.collection('seats').onSnapshot(snap=>{
   const next={};snap.forEach(doc=>next[doc.id]={id:doc.id,...doc.data()});
   state.seats=next;
   if(['seatZone','seatSelect'].includes(state.step))render();
 },err=>console.warn('좌석 실시간 연결 실패',err));
}
function seatInfo(id){
 const master=SEAT_MASTER.find(s=>s.id===id);
 const remote=state.seats[id]||{};
 return {...master,...remote,status:remote.status||'empty',updatedAt:remote.updatedAt||null};
}

function changePartySize(delta){
 const current=Number(state.partySize||1);
 state.partySize=Math.max(1,Math.min(12,current+delta));
 renderPartySizeOnly();
}
function renderPartySizeOnly(){
 const value=document.querySelector('.party-count-value');
 const room=document.querySelector('.party-room-note');
 const minus=document.querySelector('.party-minus');
 const plus=document.querySelector('.party-plus');
 if(value)value.textContent=`${state.partySize||1}명`;
 if(room){
   room.textContent=Number(state.partySize)>=6?'ROOM 선택 가능':'6명 이상부터 ROOM을 선택할 수 있습니다.';
   room.classList.toggle('active',Number(state.partySize)>=6);
 }
 if(minus)minus.disabled=Number(state.partySize)<=1;
 if(plus)plus.disabled=Number(state.partySize)>=12;
 const chip=[...document.querySelectorAll('.selection-chip')].find(x=>x.textContent.includes('인원'));
 if(chip){
   const valueNode=chip.querySelector('strong');
   if(valueNode)valueNode.textContent=`${state.partySize||1}명`;
 }
}
function confirmPartySize(){
 if(!state.partySize)state.partySize=1;
 state.step='seatZone';render();
}
function timestampMs(ts){
 if(!ts)return null;
 if(typeof ts.toMillis==='function')return ts.toMillis();
 if(ts.seconds)return ts.seconds*1000;
 const d=new Date(ts);return Number.isNaN(d.getTime())?null:d.getTime();
}
function seatElapsed(ts){
 const ms=timestampMs(ts);if(!ms)return '';
 const mins=Math.max(0,Math.floor((Date.now()-ms)/60000));
 return mins<60?`경과 ${mins}분`:`경과 ${Math.floor(mins/60)}시간 ${mins%60}분`;
}
function seatActionLabel(s,disabled){
 if(s.status==='empty'&&!disabled)return '테이블 선택하기';
 if(s.status==='occupied')return '사용 중';
 if(s.status==='cleaning')return '정리 중';
 if(s.status==='reserved')return '예약 좌석';
 if(s.status==='held')return '선택 중';
 return '선택 불가';
}

function chooseSeatZone(zone){state.seatZone=zone;state.seatId=null;state.seatName=null;state.seatCapacity=null;state.step='seatSelect';render();}
async function chooseSeat(id){
 if(state.seatZone==='room'){
   const need=requiredRoomTables(state.partySize);
   const seats=SEAT_MASTER.filter(s=>s.zone==='room').map(s=>seatInfo(s.id)).filter(s=>s.status==='empty').slice(0,need);
   if(seats.length<need)return alert('현재 룸의 남은 테이블이 부족합니다.');
   try{
     await db.runTransaction(async tx=>{
       for(const s of seats){
         const ref=db.collection('seats').doc(s.id),snap=await tx.get(ref);
         const current=snap.exists?(snap.data().status||'empty'):'empty';
         if(current!=='empty')throw new Error('방금 다른 고객이 룸을 선택했습니다.');
         tx.set(ref,{status:'held',zone:s.zone,name:s.name,capacity:s.capacity,partySize:state.partySize,heldAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
       }
     });
     state.seatId=seats.map(s=>s.id).join(',');state.seatName=`Room Zone · ${need}테이블`;state.seatCapacity=need*4;armHoldTimers();state.step='promo';render();
   }catch(e){alert(e.message||'룸 선택에 실패했습니다.')}
   return;
 }
 const s=seatInfo(id);
 if(s.status!=='empty')return alert(`${s.name}은(는) 현재 선택할 수 없습니다.`);
 if(Number(state.partySize)>Number(s.capacity))return alert(`이 좌석은 최대 ${s.capacity}인까지 이용 가능합니다.`);
 try{
   await db.runTransaction(async tx=>{
     const ref=db.collection('seats').doc(id),snap=await tx.get(ref);
     const current=snap.exists?(snap.data().status||'empty'):'empty';
     if(current!=='empty')throw new Error('방금 다른 고객이 선택했습니다.');
     tx.set(ref,{status:'held',zone:s.zone,name:s.name,capacity:s.capacity,partySize:state.partySize,heldAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
   });
   state.seatId=id;state.seatName=s.name;state.seatCapacity=s.capacity;armHoldTimers();state.step='promo';render();
 }catch(e){alert(e.message||'좌석 선택에 실패했습니다.')}
}
async function releaseCurrentSeat(){
 clearHoldTimers();
 if(!state.seatId)return;
 try{
   for(const id of String(state.seatId).split(',').filter(Boolean)){
     const ref=db.collection('seats').doc(id),snap=await ref.get();
     if(snap.exists&&snap.data().status==='held')await ref.set({status:'empty',partySize:null,heldAt:null,releasedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
   }
 }catch(e){console.warn(e)}
 state.seatId=null;state.seatName=null;state.seatCapacity=null;state.seatZone=null;
}
function selectionIndicator(){
 const items=[];
 const add=(label,value,icon='✓')=>{if(value!==null&&value!==undefined&&value!=='')items.push(`<div class="selection-chip"><span class="selection-icon">${icon}</span><span><small>${label}</small><strong>${value}</strong></span></div>`)};
 add('이용방법',state.orderType==='takeout'?'포장하기':state.orderType==='dinein'?'먹고가기':'',state.orderType==='takeout'?'🥡':'🍽️');
 if(state.orderType==='dinein'&&state.partySize)add('인원',`${state.partySize}명`,'👥');
 if(state.orderType==='takeout'&&state.pickupTime)add('픽업',`${state.pickupMode==='now'?'바로 주문':'예약'} · 오늘 ${state.pickupTime}`,'🕒');
 if(state.orderType==='takeout'&&state.phone)add('연락처',formatPhone(state.phone),'☎️');
 if(state.orderType==='dinein'&&state.seatName)add('좌석',state.seatName,`🪑`);
 const promo=state.set?`${state.set}인 세트`:state.promo==='upup'?'UP & UP':state.promo==='takeout'?'포장 20%':state.promo==='happyhour'?'해피아워 R 15,000원':state.promo==='normal'?'일반주문':'';
 add('주문유형',promo,state.set?'👨‍👩‍👧‍👦':state.promo==='upup'?'⬆️':state.promo==='takeout'?'🏷️':'🍕');
 add('피자구성',state.pizzaMode==='half'?'반반':state.pizzaMode==='single'&&state.step!=='promo'&&state.step!=='setChoice'?'한 판':'',state.pizzaMode==='half'?'◐':'●');
 add('도우',state.dough==='thin'?'씬도우':state.dough==='hand'?'수타도우':'',state.dough==='thin'?'◯':'🫓');
 const sz=state.promo==='upup'?'L 주문 → F 제공':state.size||'';
 add('사이즈',sz,'📏');
 add('크러스트',state.crust||'','🧀');
 let pizza='';
 if(isHalf()){
   const left=PIZZAS.find(x=>x.id===state.pizzaLeft)?.name||'';
   const right=PIZZAS.find(x=>x.id===state.pizzaRight)?.name||'';
   pizza=left&&right?`${left} + ${right}`:left?`${left} + 선택 중`:'';
 }else pizza=PIZZAS.find(x=>x.id===state.pizza)?.name||'';
 add('피자',pizza,'🍕');
 const topCount=selectedCount('toppings');
 if(topCount)add('추가토핑',`${topCount}개`,'➕');
 const sideCount=selectedCount('sides')+selectedCount('includedSides');
 if(sideCount)add('사이드',`${sideCount}개`,'🍟');
 const drinkCount=selectedCount('drinks')+selectedCount('includedDrinks');
 if(drinkCount)add('음료',`${drinkCount}개`,'🥤');
 if(!items.length)items.push(`<div class="selection-chip selection-chip-start"><span class="selection-icon">☰</span><span><small>현재 단계</small><strong>${labels[state.step]||'주문 시작'}</strong></span></div>`);
 return `<div class="selection-indicator"><div class="selection-indicator-title">현재 선택</div><div class="selection-track">${items.join('')}</div></div>`;
}

function currentItem(){
 const c=calc();
 return {
  id:Date.now()+Math.random(),
  orderType:state.orderType,promo:state.promo,set:state.set,dough:state.dough,size:state.size,crust:state.crust,pizzaMode:state.pizzaMode,pizza:state.pizza,pizzaLeft:state.pizzaLeft,pizzaRight:state.pizzaRight,pizzaName:pizzaDisplayName(),
  toppings:{...state.toppings},sides:{...state.sides},drinks:{...state.drinks},includedSides:{...state.includedSides},includedDrinks:{...state.includedDrinks},
  total:c.total,qty:1
 };
}
function cartTotal(){return state.cart.reduce((sum,item)=>sum+item.total*item.qty,0)}
function itemSummary(item){
 const benefit=item.set?`${item.set}인 세트`:item.promo==='upup'?'UP & UP':item.promo==='takeout'?'포장 20%':'일반주문';
 const size=item.promo==='upup'?'L 주문 → F 업그레이드':item.size;
 return `<div class="cart-item-main"><strong>${benefit} · ${item.pizzaName}${item.pizzaMode==='half'?' (반반)':''}</strong><span>${item.dough==='thin'?'씬도우':'수타도우'} · ${size} · ${item.crust||''}</span>${names(item.toppings,TOPPINGS)!=='없음'?`<small>토핑: ${names(item.toppings,TOPPINGS)}</small>`:''}${item.set?`<small>포함 사이드: ${names(item.includedSides,SIDES)}</small><small>포함 음료: ${names(item.includedDrinks,DRINKS)}</small>`:''}${names(item.sides,SIDES)!=='없음'?`<small>추가 사이드: ${names(item.sides,SIDES)}</small>`:''}${names(item.drinks,DRINKS)!=='없음'?`<small>추가 음료: ${names(item.drinks,DRINKS)}</small>`:''}</div>`;
}
function addCurrentToCart(){
 state.cart.push(currentItem());
 state.step='cart';
 render();
}
function removeCartItem(index){if(!confirm(t('cart.confirmRemove')))return;state.cart.splice(index,1);render()}
function cartQty(index,d){const item=state.cart[index];item.qty=Math.max(1,Math.min(9,item.qty+d));render()}
function clearCurrentSelection(){
 state.promo=null;state.set=null;state.dough=null;state.size=null;state.crust=null;state.pizzaMode='single';state.pizza=null;state.pizzaLeft=null;state.pizzaRight=null;state.halfStage='left';
 state.toppings={};state.sides={};state.drinks={};state.includedSides={};state.includedDrinks={};state.toppingExpanded=false;
}
function addMoreMenu(){clearCurrentSelection();state.step='promo';render()}
async function checkoutCart(){
 if(!state.cart.length)return alert(t('cart.empty'));
 const checkoutButton=document.querySelector('.cart-actions .btn.primary');
 if(checkoutButton){checkoutButton.disabled=true;checkoutButton.textContent='주문 전송 중...';}
 state.orderNo=Math.floor(1000+Math.random()*9000);
 const orderPayload={
  orderNo:state.orderNo,
  storeId:'pangyo2-techno-valley',
  storeName:'판교2테크노밸리점',
  status:'new',
  orderType:state.orderType||'unknown',
  partySize:state.partySize||null,
  phone:state.orderType==='takeout'?state.phone:null,
  phoneMasked:state.orderType==='takeout'?`010-****-${state.phone.slice(-4)}`:null,
  pickup:state.orderType==='takeout'?{date:'today',time:state.pickupTime,mode:state.pickupMode,isHappyHour:pickupIsHappyHour(),prepMinutes:state.pickupMode==='now'?'15~20':null}:null,
  items:state.cart.map(item=>JSON.parse(JSON.stringify(item))),
  itemCount:state.cart.reduce((n,item)=>n+(item.qty||1),0),
  total:cartTotal(),
  createdAt:firebase.firestore.FieldValue.serverTimestamp(),
  createdAtClient:new Date().toISOString(),
  seat:state.orderType==='dinein'?{id:state.seatId,name:state.seatName,zone:state.seatZone,capacity:state.seatCapacity}:null,
  source:'mobile-order-v1.2'
 };
 try{
  const ref=await db.collection('orders').add(orderPayload);
  state.orderId=ref.id;
  if(state.orderType==='dinein'&&state.seatId){for(const id of String(state.seatId).split(',').filter(Boolean)){await db.collection('seats').doc(id).set({status:'occupied',orderId:ref.id,orderNo:state.orderNo,partySize:state.partySize,occupiedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});}}
  state.step='done';
  render();
 }catch(error){
  console.error('주문 저장 실패:',error);
  alert('주문 전송에 실패했습니다. 인터넷 연결과 Firestore 설정을 확인해 주세요.\n\n'+error.message);
  if(checkoutButton){checkoutButton.disabled=false;checkoutButton.textContent='결제하기';}
 }
}
function shell(content,opts={}){
 const c=calc();
 const showFooter=state.step!=='home'&&state.step!=='done';
 const cartCount=state.cart.reduce((n,i)=>n+(i.qty||1),0);
 const hasSelectedProduct=cartCount>0||Boolean(state.pizza||state.pizzaLeft||state.pizzaRight);
 const showNext=!opts.auto;
 const nextLabel=state.step==='review'?'장바구니 담기':'다음';
 const orderSummary=hasSelectedProduct?`<div class="mobile-total"><small>현재 금액</small><strong>${money(c.total)}</strong></div>`:'';
 const cartButton=hasSelectedProduct?`<button class="mobile-cart" onclick="state.step='cart';render()">🛒<b>${cartCount}</b></button>`:'';
 const footer=showFooter?`<footer class="mobile-footer ${hasSelectedProduct?'has-product':'no-product'}">
   <button class="nav-button back" onclick="back()" aria-label="이전">‹<span>이전</span></button>
   <button class="nav-button home" onclick="goHome()" aria-label="처음으로">⌂<span>홈</span></button>
   ${opts.skip?`<button class="nav-button skip" onclick="next()"><span>선택 안 함</span></button>`:''}
   ${orderSummary}
   ${showNext?`<button class="mobile-next" ${opts.nextDisabled?'disabled':''} onclick="next()">${nextLabel} →</button>`:cartButton}
 </footer>`:'';
 const indicator=!['home','done'].includes(state.step)?selectionIndicator():'';
 app.innerHTML=`<div class="shell mobile-shell step-${state.step}">${indicator}<header class="mobile-header"><button class="header-home" onclick="goHome()" aria-label="처음으로">PAPA JOHN'S</button><div class="store-name">판교2테크노밸리점</div><div class="progress">${labels[state.step]||'주문'}</div></header><main class="main mobile-main">${content}</main>${footer}</div>`;
}
function render(){
 if(state.step==='home'){app.innerHTML=`<div class="hero mobile-hero"><div class="hero-overlay"></div><div class="hero-copy"><img class="hero-logo" src="assets/images/home_logo_v33.png" alt="PAPA JOHNS"><h2>판교2테크노밸리점</h2><p>더 좋은 재료, 더 좋은 피자</p><button class="btn primary hero-order" onclick="state.step='type';render()">주문하기</button><small>모바일 주문 시스템</small></div></div>`;return}
 if(state.step==='type')return shell(`<section class="service-select"><h1 class="title">어떻게 이용하시나요?</h1><p class="sub">아래 주문 방식을 터치해 주세요.</p><div class="service-grid"><button type="button" class="service-card ${state.orderType==='takeout'?'selected':''}" onclick="selectOrderType('takeout')"><span class="service-icon" aria-hidden="true">🥡</span><strong>포장하기</strong><span class="service-desc">매장에서 포장해 가기</span><span class="service-benefit">L/F 피자 20% 할인 선택 가능</span></button><button type="button" class="service-card ${state.orderType==='dinein'?'selected':''}" onclick="selectOrderType('dinein')"><span class="service-icon" aria-hidden="true">🍽️</span><strong>먹고가기</strong><span class="service-desc">매장에서 바로 즐기기</span><span class="service-benefit">세트 · UP & UP 이용 가능</span></button></div></section>`,{auto:true});

 if(state.step==='partySize'){
  if(!state.partySize)state.partySize=1;
  return shell(`<section class="party-screen mobile-party-screen"><h1 class="title">이용 인원을 선택해 주세요</h1><p class="sub">버튼을 눌러 인원을 조정한 뒤 다음으로 이동하세요.</p>
  <div class="party-counter-card">
    <span class="party-counter-icon">👥</span>
    <div class="party-counter-control">
      <button class="party-step party-minus" onclick="changePartySize(-1)" ${state.partySize<=1?'disabled':''}>−</button>
      <strong class="party-count-value">${state.partySize}명</strong>
      <button class="party-step party-plus" onclick="changePartySize(1)" ${state.partySize>=12?'disabled':''}>＋</button>
    </div>
    <small>최소 1명 · 최대 12명</small>
    <em class="party-room-note ${state.partySize>=6?'active':''}">${state.partySize>=6?'ROOM 선택 가능':'6명 이상부터 ROOM을 선택할 수 있습니다.'}</em>
    <button class="btn primary party-confirm" onclick="confirmPartySize()">다음 →</button>
  </div></section>`,{auto:true});
 }
 if(state.step==='pickup'){
  const range=immediatePickupRange();
  const rangeText=`${pad2(Math.floor(range.from/60))}:${pad2(range.from%60)}~${pad2(Math.floor(range.to/60))}:${pad2(range.to%60)}`;
  return shell(`<section class="pickup-screen mobile-pickup-screen"><h1 class="title">포장 주문 방식을 선택해 주세요</h1><p class="sub">바로 주문하거나 오늘 픽업 시간을 예약할 수 있습니다.</p><div class="takeout-choice-grid">
    <button class="takeout-choice-card" onclick="chooseImmediatePickup()"><span class="choice-icon">⚡</span><strong>바로 주문</strong><small>준비시간 약 15~20분</small><em>예상 픽업 ${rangeText}</em></button>
    <button class="takeout-choice-card reserve-card" onclick="openReservationTime()"><span class="choice-icon">🕒</span><strong>예약 주문</strong><small>오늘 11:00~21:00</small><em>시간과 분을 따로 선택</em></button>
  </div><div class="happy-hour-banner"><b>HAPPY HOUR</b><strong>16:00~20:00 픽업</strong><span>R 사이즈 모든 피자 15,000원</span><small>해피아워는 픽업시간 기준입니다.</small></div></section>`);
 }
 if(state.step==='pickupTime'){
  const hours=availableHours(),mins=state.pickupHour===null?[]:availableMinutesForHour(state.pickupHour);
  return shell(`<section class="reservation-time-screen mobile-reservation-screen"><h1 class="title">예약 픽업 시간을 선택해 주세요</h1><p class="sub">당일 예약만 가능하며 5분 단위입니다.</p>
  <div class="wheel-wrap stable-wheel">
   <div class="wheel-col"><b>시간</b><div class="wheel-list hour-wheel">${hours.map(h=>`<button class="${state.pickupHour===h?'active':''}" onclick="choosePickupHour(${h})">${pad2(h)}시</button>`).join('')}</div></div>
   <div class="wheel-col"><b>분</b><div class="wheel-list minute-wheel">${mins.map(m=>`<button class="${state.pickupMinute===m?'active':''}" onclick="choosePickupMinute(${m})">${pad2(m)}분</button>`).join('')}</div></div>
  </div>
  <div class="pickup-result"><span>오늘 예약 픽업</span><strong>${state.pickupHour===null?'--':pad2(state.pickupHour)}:${state.pickupMinute===null?'--':pad2(state.pickupMinute)}</strong>${pickupIsHappyHour()?'<em>🌇 HAPPY HOUR 적용</em>':'<small>일반 예약</small>'}</div>
  <button class="btn primary pickup-confirm" onclick="confirmPickup()">이 시간으로 예약</button></section>`);
 }
 if(state.step==='phone')return shell(`<section class="phone-screen mobile-phone-screen"><h1 class="title">휴대전화 번호를 입력해 주세요</h1><p class="sub">기본값은 010입니다. 다른 번호는 전체삭제 후 직접 입력할 수 있습니다.</p><div class="phone-display">${state.phoneDisplay||'전화번호를 입력하세요'}</div><div class="phone-actions"><button class="clear-phone" onclick="clearPhoneAll()">전체삭제</button></div><div class="number-pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button onclick="appendPhoneDigit(${n})">${n}</button>`).join('')}<button onclick="backspacePhone()">⌫</button><button onclick="appendPhoneDigit(0)">0</button><button class="confirm" onclick="confirmPhone()">확인</button></div><small class="phone-note">입력한 번호 뒤 4자리가 고객 호출번호로 사용됩니다.</small></section>`,{auto:true});

 if(state.step==='seatZone'){
  subscribeSeats();
  const zones=SEAT_ZONES.map(z=>{
    const a=zoneAvailability(z.id);
    let allowed=a.open;
    if(z.id==='room')allowed=a.open&&Number(state.partySize)>=6&&requiredRoomTables(state.partySize)<=roomFreeTables();
    const reason=!a.open?a.reason:(z.id==='room'&&Number(state.partySize)<6?'6명 이상 이용 가능':z.id==='room'&&!allowed?'남은 룸 테이블 부족':'선택 가능');
    const count=SEAT_MASTER.filter(s=>s.zone===z.id).map(s=>seatInfo(s.id)).filter(s=>s.status==='empty').length;
    const icon=z.id==='papa'?'🍕':z.id==='outside'?'⛱️':z.id==='bottle'?'🪑':'🛋️';
    return `<button class="seat-zone-card zone-square ${allowed?'':'zone-disabled'}" ${allowed?'':'disabled'} onclick="chooseSeatZone('${z.id}')">
      <span class="zone-icon">${icon}</span>
      <strong>${z.name}</strong>
      <small>${z.desc}</small>
      <em>${allowed?`이용 가능 ${count}`:`🔒 ${reason}`}</em>
    </button>`;
  }).join('');
  return shell(`<section class="seat-screen zone-screen-v33.1"><h1 class="title">구역을 선택해 주세요</h1><p class="sub">${state.partySize}명 기준으로 이용 가능한 구역입니다.</p><div class="seat-zone-grid zone-grid-v33.1">${zones}</div></section>`,{auto:true});
 }
 if(state.step==='seatSelect'){
  subscribeSeats();
  const z=SEAT_ZONES.find(x=>x.id===state.seatZone);
  const list=SEAT_MASTER.filter(s=>s.zone===state.seatZone).map(s=>seatInfo(s.id));
  const entrance=state.seatZone==='outside'?`<div class="compact-entrance"><span>🚪</span><strong>파파존스 출입구</strong><small>야외석1 옆</small></div>`:'';
  return shell(`<section class="seat-screen seat-screen-v33.1"><h1 class="title">테이블을 선택해 주세요</h1><p class="sub">${z?.name||''} · ${state.partySize}명</p>${entrance}
  <div class="seat-grid seat-grid-v33.1">${list.map(s=>{
    const capacityBlocked=state.seatZone!=='room'&&Number(state.partySize)>Number(s.capacity);
    const selectable=s.status==='empty'&&!capacityBlocked;
    const elapsed=s.status==='occupied'?seatElapsed(s.occupiedAt):'';
    return `<article class="seat-card-v33.1 ${s.status} ${capacityBlocked?'capacity-blocked':''}">
      <div class="seat-table-visual"><span class="table-board"></span><span class="chair chair-a"></span><span class="chair chair-b"></span><span class="chair chair-c"></span><span class="chair chair-d"></span></div>
      <strong>${s.name}</strong>
      <small>최대 ${s.capacity}인</small>
      <em>${capacityBlocked?'인원 초과':seatStatusName[s.status]||s.status}</em>
      ${elapsed?`<b class="seat-elapsed">${elapsed}</b>`:''}
      <button class="seat-select-action" ${selectable?'':"disabled"} onclick="chooseSeat('${s.id}')">${seatActionLabel(s,capacityBlocked)}</button>
    </article>`;
  }).join('')}</div></section>`,{auto:true});
 }
 if(state.step==='promo'){
  const dinein=state.orderType==='dinein';
  const cards=dinein
   ? `<button type="button" class="promo-card promo-set" onclick="openSetMenu()"><span class="promo-ribbon">BEST CHOICE</span><span class="promo-icon">👨‍👩‍👧‍👦</span><strong>세트메뉴</strong><span class="promo-copy">2인 · 3인 · 4인</span><span class="promo-point">인원에 맞춘 알찬 구성</span></button><button type="button" class="promo-card promo-upup ${state.promo==='upup'?'selected':''}" onclick="choosePromo('upup')"><span class="promo-icon">⬆️</span><strong>UP & UP</strong><span class="promo-copy">L 주문 시 F 업그레이드</span><span class="promo-point">크러스트까지 무료</span></button><button type="button" class="promo-card promo-normal ${state.promo==='normal'?'selected':''}" onclick="choosePromo('normal')"><span class="promo-icon">🍕</span><strong>일반주문</strong><span class="promo-copy">원하는 메뉴와 옵션 선택</span><span class="promo-point">자유롭게 주문</span></button>`
   : `${pickupIsHappyHour()?`<button type="button" class="promo-card promo-happy" onclick="choosePromo('happyhour')"><span class="promo-ribbon">16~20시 픽업</span><span class="promo-icon">🌇</span><strong>해피아워</strong><span class="promo-copy">R 사이즈 모든 피자</span><span class="promo-point">15,000원</span></button>`:''}<button type="button" class="promo-card promo-set" onclick="openSetMenu()"><span class="promo-ribbon">BEST CHOICE</span><span class="promo-icon">👨‍👩‍👧‍👦</span><strong>세트메뉴</strong><span class="promo-copy">2인 · 3인 · 4인</span><span class="promo-point">인원에 맞춘 알찬 구성</span></button><button type="button" class="promo-card promo-takeout ${state.promo==='takeout'?'selected':''}" onclick="choosePromo('takeout')"><span class="promo-icon">🏷️</span><strong>포장 20%</strong><span class="promo-copy">L/F 피자 할인</span><span class="promo-point">포장 전용 혜택</span></button><button type="button" class="promo-card promo-upup ${state.promo==='upup'?'selected':''}" onclick="choosePromo('upup')"><span class="promo-icon">⬆️</span><strong>UP & UP</strong><span class="promo-copy">L 주문 시 F 업그레이드</span><span class="promo-point">크러스트까지 무료</span></button><button type="button" class="promo-card promo-normal ${state.promo==='normal'?'selected':''}" onclick="choosePromo('normal')"><span class="promo-icon">🍕</span><strong>일반주문</strong><span class="promo-copy">원하는 메뉴와 옵션 선택</span><span class="promo-point">자유롭게 주문</span></button>`;
  return shell(`<section class="promo-select"><h1 class="title">주문 유형을 선택해 주세요</h1><p class="sub">${dinein?'세트메뉴, UP & UP, 일반주문 중 선택해 주세요.':'적용할 주문 혜택을 선택해 주세요.'}</p><div class="promo-grid ${dinein?'three':'four'}">${cards}</div><div class="notice promo-notice">UP & UP은 L 사이즈 판매 피자 전용입니다. 결제는 L 피자 가격으로 하고, F 사이즈와 선택 크러스트로 무료 업그레이드됩니다.</div></section>`,{auto:true});
 }
 if(state.step==='setChoice')return shell(`<section class="set-select"><h1 class="title">세트메뉴를 선택해 주세요</h1><p class="sub">인원에 맞는 세트를 터치하면 바로 다음 단계로 이동합니다.</p><div class="set-grid">${[2,3,4].map(n=>{const meta=n===2?{icon:'👫',badge:'가볍고 알찬 구성',size:'R 사이즈',price:24000,copy:'피자 1판 + 파스타 1개 + 500ml 음료 1개',cls:'set-two'}:n===3?{icon:'👨‍👩‍👦',badge:'가장 인기',size:'L 사이즈',price:33000,copy:'피자 1판 + 사이드 1개 + 대용량 음료 1개',cls:'set-three'}:{icon:'👨‍👩‍👧‍👦',badge:'가성비 최고',size:'F 사이즈',price:42000,copy:'피자 1판 + 사이드 2개 + 대용량 음료 1개',cls:'set-four'};return `<button type="button" class="set-card ${meta.cls}" onclick="selectSet(${n})"><span class="set-card-badge">${meta.badge}</span><span class="set-card-icon" aria-hidden="true">${meta.icon}</span><strong>${n}인 세트</strong><span class="set-size">${meta.size} 전용</span><span class="set-copy">${meta.copy}</span><span class="set-price">${money(meta.price)}</span><span class="set-action">선택하기 →</span></button>`}).join('')}</div><div class="notice set-notice">세트메뉴는 수타도우 전용이며, 선택한 세트에 맞춰 사이즈가 자동 적용됩니다.</div></section>`,{auto:true});
 if(state.step==='pizzaMode')return shell(`<section class="topping-choice"><h1 class="title">피자 구성을 선택해 주세요</h1><p class="sub">반반는 L/F 사이즈에서만 가능하며 추가금 1,000원이 발생합니다.</p><div class="topping-choice-grid"><button type="button" class="topping-choice-card add" onclick="selectPizzaMode('single')"><span class="choice-icon">🍕</span><strong>한 판</strong><span>한 가지 피자로 주문합니다</span></button><button type="button" class="topping-choice-card skip" onclick="selectPizzaMode('half')"><span class="choice-icon">◐</span><strong>반반</strong><span>두 가지 피자 반반 +1,000원</span></button></div></section>`,{auto:true});
 if(state.step==='dough')return shell(`<section class="crust-select"><h1 class="title">도우 타입을 선택해 주세요</h1><p class="sub">사진이 있는 큰 카드를 터치하면 바로 다음 단계로 이동합니다.</p><div class="dough-card-grid"><button type="button" class="crust-image-card ${state.dough==='hand'?'selected':''}" onclick="selectDough('hand')"><img src="assets/images/crust/original.jpg" alt="수타도우 오리지널"><span class="crust-card-body"><strong>수타도우</strong><span>쫄깃하고 고소한 기본 도우</span><em>R · L · F 선택 가능</em></span></button><button type="button" class="crust-image-card ${state.dough==='thin'?'selected':''} ${state.promo==='upup'?'disabled':''}" onclick="selectDough('thin')"><img src="assets/images/crust/thin.jpg" alt="씬도우"><span class="crust-card-body"><strong>씬도우</strong><span>바삭한 식감, 더욱 풍부한 토핑</span><em>${state.promo==='upup'?'UP & UP 적용 불가':'F 사이즈 전용 · 모든 피자 가능'}</em></span></button></div></section>`,{auto:true});
 if(state.step==='size'){
  const fixed=state.dough==='thin'||state.promo==='upup'||state.set;
  return shell(`<h1 class="title">사이즈를 선택해 주세요</h1><div class="grid"><div class="card choice ${state.size==='R'?'selected':''} ${fixed||state.dough==='thin'||isHalf()?'disabled':''}" onclick="selectSize('R')"><strong>R 레귤러</strong><span>23cm · 1~2인</span></div><div class="card choice ${state.size==='L'?'selected':''} ${(fixed&&state.promo!=='upup')?'disabled':''}" onclick="selectSize('L')"><strong>L 라지</strong><span>${state.promo==='upup'?'선택 필수 · F로 무료 업그레이드':'31cm · 2~3인'}</span></div><div class="card choice ${state.size==='F'?'selected':''} ${state.promo==='upup'||state.set?'disabled':''}" onclick="selectSize('F')"><strong>F 패밀리</strong><span>36cm · 3~4인</span></div></div>${fixed?'<div class="notice">선택한 도우 또는 프로모션에 따라 사이즈가 자동 지정되었습니다.</div>':''}`,{auto:true});
 }
 if(state.step==='crust'){
  let opts=state.set&&state.set>=3?['오리지널','치즈롤','골드링']:state.promo==='upup'?['치즈롤','골드링']:state.dough==='thin'?['오리지널','골드링']:state.size==='R'?['오리지널']:['오리지널','치즈롤','골드링'];
  const crustMeta={
   '오리지널':{img:'assets/images/crust/original.jpg',desc:'쫄깃하고 고소한 기본에 충실한 맛'},
   '골드링':{img:'assets/images/crust/gold_ring.jpg',desc:'달콤한 고구마 무스와 스트링 치즈의 만남'},
   '치즈롤':{img:'assets/images/crust/cheese_roll.jpg',desc:'도우 속 스트링 치즈와 체다 치즈의 풍미'}
  };
  return shell(`<section class="crust-select"><h1 class="title">크러스트를 선택해 주세요</h1>${state.promo==='upup'?'<p class="sub">UP & UP 혜택으로 치즈롤 또는 골드링을 무료로 선택할 수 있습니다.</p>':state.set?`<p class="sub">${state.set}인 세트 기본금액에 선택한 크러스트 추가금이 더해집니다.</p>`:'<p class="sub">사진을 확인한 뒤 원하는 크러스트를 터치해 주세요.</p>'}<div class="crust-card-grid ${opts.length===2?'two':''}">${opts.map(x=>{const m=crustMeta[x];const price=state.promo==='upup'?'무료 업그레이드':x==='오리지널'?'추가금 없음':`+${money(crustOptionPrice(x))}`;return `<button type="button" class="crust-image-card ${state.crust===x?'selected':''}" onclick="selectCrust('${x}')"><img src="${m.img}" alt="${x}"><span class="crust-card-body"><strong>${x}</strong><span>${m.desc}</span><em>${price}</em></span></button>`}).join('')}</div></section>`,{auto:true});
 }
 if(state.step==='pizza'){
  const cats=['ALL','BEST','SPECIALTY','CLASSIC','THIN'];
  const priceSize=state.promo==='upup'?'L':state.size;
  const halfBlocked=['bulgogi','ranch','ham','shrimp'];
  let list=PIZZAS.filter(p=>{if(state.dough==='hand'&&p.thinOnly)return false;if(!p.sizes.includes(priceSize))return false;if(isHalf()&&halfBlocked.includes(p.id))return false;if(isHalf()&&state.halfStage==='right'&&p.id===state.pizzaLeft)return false;if(isHalf()&&state.halfStage==='right'&&state.pizzaLeft==='favorite'&&p.id!=='six')return false;if(isHalf()&&state.halfStage==='right'&&state.pizzaLeft==='six'&&p.id!=='favorite')return false;if(isHalf()&&state.halfStage==='right'&&p.id==='favorite'&&state.pizzaLeft!=='six')return false;if(isHalf()&&state.halfStage==='right'&&p.id==='six'&&state.pizzaLeft!=='favorite')return false;return state.category==='ALL'||p.cat===state.category});
  const leftPizza=isHalf()&&state.pizzaLeft?PIZZAS.find(p=>p.id===state.pizzaLeft):null;
  const rightPizza=isHalf()&&state.pizzaRight?PIZZAS.find(p=>p.id===state.pizzaRight):null;
  const halfPreview=isHalf()?`<section class="half-preview ${state.halfStage==='confirm'?'complete':''}"><div class="half-pizza-visual ${state.halfStage==='confirm'?'large':''}"><div class="half-slice left" style="background-image:url('${leftPizza?leftPizza.img:''}')">${leftPizza?'':'<span>왼쪽</span>'}</div><div class="half-slice right" style="background-image:url('${rightPizza?rightPizza.img:''}')">${rightPizza?'':'<span>오른쪽</span>'}</div></div><div class="half-preview-copy"><strong>${leftPizza?leftPizza.name:'왼쪽 피자 선택'} + ${rightPizza?rightPizza.name:'오른쪽 피자 선택'}</strong><span>${state.halfStage==='left'?'먼저 왼쪽 피자를 선택해 주세요.':state.halfStage==='right'?'왼쪽에 선택한 '+leftPizza.name+'는 목록에서 숨겨졌습니다. 다른 피자를 선택해 주세요.':'반반 조합이 완성되었습니다. 아래 내용을 확인해 주세요.'}</span><em>반반 추가금 +1,000원</em></div></section>`:'';
  if(isHalf()&&state.halfStage==='confirm')return shell(`<section class="half-confirm-screen"><h1 class="title">반반 조합을 확인해 주세요</h1>${halfPreview}<div class="half-confirm-actions"><button class="btn secondary big-action" onclick="changeHalfSelection()">다시 선택</button><button class="btn primary big-action" onclick="confirmHalfSelection()">이 조합으로 확인</button></div></section>`,{auto:true});
  const guide=isHalf()?`<p class="sub">${state.halfStage==='left'?'왼쪽':'오른쪽'} 피자를 선택해 주세요.</p>`:state.set===2?'<p class="sub">2인 세트는 R 사이즈 판매 메뉴만 표시됩니다.</p>':'';
  const selectedId=isHalf()?(state.halfStage==='left'?state.pizzaLeft:state.pizzaRight):state.pizza;
  return shell(`<h1 class="title">${isHalf()?'반반 피자를 선택해 주세요':'피자를 선택해 주세요'}</h1>${halfPreview}${guide}<div class="tabs">${cats.map(c=>`<button class="tab ${state.category===c?'active':''}" onclick="state.category='${c}';render()">${c}</button>`).join('')}</div><div class="grid">${list.map(p=>`<div class="card ${selectedId===p.id?'selected':''}" onclick="selectPizza('${p.id}')"><span class="badge">${p.cat}</span><img src="${p.img}" alt="${p.name}"><h3>${p.name}</h3><p class="price">${money(p.prices[priceSize]||0)}</p></div>`).join('')}</div>`,{auto:true});
 }
 if(state.step==='topping'){
  if(!state.toppingExpanded)return shell(`<section class="topping-choice"><h1 class="title">토핑을 추가하시겠어요?</h1><p class="sub">원하시는 방법을 터치해 주세요.</p><div class="topping-choice-grid"><button type="button" class="topping-choice-card add" onclick="openToppings()"><span class="choice-icon">➕</span><strong>토핑 추가하기</strong><span>치즈, 고기, 야채 토핑을 선택합니다</span></button><button type="button" class="topping-choice-card skip" onclick="skipToppings()"><span class="choice-icon">➡️</span><strong>건너뛰기</strong><span>추가 토핑 없이 다음 단계로 이동합니다</span></button></div></section>`,{auto:true});
  return shell(`<h1 class="title">추가할 토핑을 선택해 주세요</h1><p class="sub">전체 합계 최대 5개, 동일 토핑 최대 2개 · 선택한 토핑 금액은 주문금액에 추가됩니다.</p><div class="grid four">${TOPPINGS.map(t=>{const q=state.toppings[t.id]||0;return `<div class="card"><h3>${toppingName(t)}</h3><p>${toppingPriceLabel(t,money(t.price[effectiveSize()]))}</p><div class="qty"><button onclick="qty('toppings','${t.id}',-1)">−</button><strong>${q}</strong><button onclick="qty('toppings','${t.id}',1)">＋</button></div></div>`}).join('')}</div>`);
 }
 if(state.step==='side'){
  if(state.set){
   const includedList=visibleSides();
   const guide=state.set===2?'파스타 3종 중 1개가 세트에 포함됩니다.':state.set===3?'브라우니를 제외한 사이드 중 1개가 세트에 포함됩니다.':'브라우니를 제외한 사이드 중 2개가 세트에 포함됩니다.';
   return shell(`<h1 class="title">사이드 메뉴를 선택해 주세요</h1><p class="sub">${guide}</p><section class="menu-section included-section"><div class="section-heading"><div><span class="section-badge">세트 포함</span><h2>포함 사이드 선택</h2></div><strong>${includedCount('includedSides')} / ${setSideLimit()}</strong></div><div class="grid side-grid compact-product-grid">${includedList.map(s=>itemCard(s,'includedSides',true)).join('')}</div></section><section class="menu-section extra-section"><div class="section-heading"><div><span class="section-badge extra">추가 결제</span><h2>사이드 추가 주문</h2></div><span>선택 시 판매가가 추가됩니다</span></div><div class="extra-alert">⚠ 세트 구성 외 추가 상품입니다. ＋ 버튼을 누르면 추가금 안내 팝업이 표시됩니다.</div><div class="grid side-grid compact-product-grid">${SIDES.map(s=>itemCard(s,'sides',false)).join('')}</div></section>`,{nextDisabled:includedCount('includedSides')!==setSideLimit()});
  }
  return shell(`<h1 class="title">사이드 메뉴를 선택해 주세요</h1><p class="sub">원하는 사이드를 추가해 보세요.</p><div class="grid side-grid compact-product-grid">${SIDES.map(s=>itemCard(s,'sides')).join('')}</div>`,{skip:true});
 }
 if(state.step==='drink'){
  if(state.set){
   const includedList=visibleDrinks();
   const guide=state.set===2?'500ml 음료 1개가 세트에 포함됩니다.':'1.25L 또는 1.5L 음료 1개가 세트에 포함됩니다.';
   return shell(`<h1 class="title">음료를 선택해 주세요</h1><p class="sub">${guide}</p><section class="menu-section included-section"><div class="section-heading"><div><span class="section-badge">세트 포함</span><h2>포함 음료 선택</h2></div><strong>${includedCount('includedDrinks')} / 1</strong></div><div class="grid drink-grid compact-product-grid">${includedList.map(d=>itemCard(d,'includedDrinks',true)).join('')}</div></section><section class="menu-section extra-section"><div class="section-heading"><div><span class="section-badge extra">추가 결제</span><h2>음료 추가 주문</h2></div><span>500ml 1,800원 · 1.25/1.5L 2,500원</span></div><div class="extra-alert">⚠ 세트 포함 음료 외 추가 상품입니다. ＋ 버튼을 누르면 추가금 안내 팝업이 표시됩니다.</div><div class="grid drink-grid compact-product-grid">${DRINKS.map(d=>itemCard(d,'drinks',false)).join('')}</div></section>`,{nextDisabled:includedCount('includedDrinks')!==1});
  }
  return shell(`<h1 class="title">음료를 선택해 주세요</h1><p class="sub">원하는 음료를 선택해 주세요.</p><div class="grid drink-grid compact-product-grid">${DRINKS.map(d=>itemCard(d,'drinks')).join('')}</div>`,{skip:true});
 }
 if(state.step==='review'){
  const c=calc();
  return shell(`<h1 class="title">주문 내용을 확인해 주세요</h1><div class="summary"><div class="summary-row"><b>이용방법</b><span>${state.orderType==='takeout'?'포장':'먹고가기'}</span></div>${state.orderType==='takeout'?`<div class="summary-row"><b>픽업 방식</b><span>${state.pickupMode==='now'?'바로 주문 (15~20분)':'예약 주문'}</span></div><div class="summary-row"><b>픽업 예정</b><span>오늘 ${state.pickupTime||'-'}</span></div><div class="summary-row"><b>연락처</b><span>${formatPhone(state.phone)}</span></div>`:`<div class="summary-row"><b>이용 인원</b><span>${state.partySize||'-'}명</span></div>`}${state.orderType==='dinein'?`<div class="summary-row"><b>선택 좌석</b><span>${state.seatName||'-'} · 최대 ${state.seatCapacity||'-'}인</span></div>`:''}<div class="summary-row"><b>혜택</b><span>${state.set?state.set+'인 세트':state.promo==='takeout'?'포장 20%':state.promo==='happyhour'?'해피아워 R 15,000원':state.promo==='upup'?'UP & UP':'일반 주문'}</span></div><div class="summary-row"><b>피자</b><span>${pizzaDisplayName()}${isHalf()?' (반반)':''} · ${state.dough==='thin'?'씬도우':'수타도우'} · ${state.promo==='upup'?'L 주문 → F 업그레이드':state.size} · ${state.crust}</span></div>${isHalf()?`<div class="summary-row"><b>반반 추가금</b><span>${money(1000)}</span></div>`:''}<div class="summary-row"><b>추가 토핑</b><span>${Object.entries(state.toppings).filter(x=>x[1]).map(([id,q])=>toppingName(TOPPINGS.find(t=>t.id===id))+' ×'+q).join(', ')||'없음'}</span></div>${state.set?`<div class="summary-row"><b>세트 포함 사이드</b><span>${names(state.includedSides,SIDES)}</span></div><div class="summary-row"><b>세트 포함 음료</b><span>${names(state.includedDrinks,DRINKS)}</span></div>`:''}<div class="summary-row"><b>${state.set?'추가 사이드':'사이드'}</b><span>${names(state.sides,SIDES)}</span></div><div class="summary-row"><b>${state.set?'추가 음료':'음료'}</b><span>${names(state.drinks,DRINKS)}</span></div>${state.set?`<div class="summary-row"><b>세트 기본금액</b><span>${money(state.set===2?24000:state.set===3?33000:42000)}</span></div><div class="summary-row"><b>크러스트 추가금</b><span>${money(crustPrice())}</span></div><div class="summary-row"><b>토핑 추가금</b><span>${money(toppingPrice())}</span></div><div class="summary-row"><b>추가 사이드</b><span>${money(c.sides)}</span></div><div class="summary-row"><b>추가 음료</b><span>${money(c.drinks)}</span></div>`:''}${!state.set?`<div class="summary-row"><b>피자 금액</b><span>${money(c.pizza)}</span></div><div class="summary-row"><b>크러스트 추가금</b><span>${money(c.crust)}</span></div><div class="summary-row"><b>토핑 추가금</b><span>${money(c.topping)}</span></div>`:''}${c.discount?`<div class="summary-row discount"><b>포장 할인</b><span>-${money(c.discount)}</span></div>`:''}${state.promo==='upup'?`<div class="summary-row"><b>L 피자 정상가</b><span>${money(basePizzaPrice())}</span></div><div class="summary-row discount"><b>UP & UP 할인</b><span>-${money(c.upupDiscount)}</span></div><div class="summary-row"><b>무료 혜택</b><span>F 사이즈 업그레이드 + ${state.crust==='오리지널'?'오리지널 크러스트':'크러스트 업그레이드'}</span></div>`:''}<div class="summary-row"><b style="font-size:24px">총 결제금액</b><strong class="price" style="font-size:28px">${money(c.total)}</strong></div></div><div class="notice" style="margin-top:15px">현재 버전은 주문 흐름·가격 계산 확인용입니다. 실제 카드 승인, POS, 영수증 출력은 연결되어 있지 않습니다.</div>`);
 }
 if(state.step==='cart'){
  return shell(`<section class="cart-screen"><h1 class="title">${t('cart.title')}</h1><p class="sub">${t('cart.subtitle')}</p>${state.cart.length?`<div class="cart-list">${state.cart.map((item,i)=>`<article class="cart-item">${itemSummary(item)}<div class="cart-item-side"><strong>${money(item.total*item.qty)}</strong><div class="qty cart-qty"><button onclick="cartQty(${i},-1)">−</button><span>${item.qty}</span><button onclick="cartQty(${i},1)">＋</button></div><button class="cart-remove" onclick="removeCartItem(${i})">${t('cart.remove')}</button></div></article>`).join('')}</div><div class="cart-total-box"><span>${t('cart.totalPayment')}</span><strong>${money(cartTotal())}</strong></div><div class="cart-actions"><button class="btn secondary big-action" onclick="addMoreMenu()">${t('cart.addSingle')}</button><button class="btn primary big-action" onclick="checkoutCart()">${t('cart.orderNow')}</button></div>`:`<div class="empty-cart">${t('cart.empty')}<button class="btn primary" onclick="addMoreMenu()">${t('cart.addSingle')}</button></div>`}</section>`);
 }
 if(state.step==='done')return shell(`<div class="complete"><h1>주문이 접수되었습니다</h1><p>주문번호</p><div class="num">${state.orderNo}</div><p>관리자 화면으로 주문이 실시간 전송되었습니다.</p>${state.orderType==='dinein'?`<div class="done-seat">선택 좌석 <strong>${state.seatName||'-'}</strong></div>`:''}<small class="order-id">주문 ID: ${state.orderId||'-'}</small><button class="btn primary" onclick="location.reload()">처음 화면으로</button></div>`);
}
function productName(x,key){const group=String(key).toLowerCase();return group.includes('side')?sideName(x):group.includes('drink')?drinkName(x):toppingName(x)}
function productPriceLabel(x,key,included=false){const group=String(key).toLowerCase();if(included)return window.PJ_I18N.t(group.includes('drink')?'drink.includedLabel':'side.includedLabel');const price=money(x.price);return group.includes('drink')?drinkPriceLabel(x,price):group.includes('side')?sidePriceLabel(x,price):price}
function itemCard(x,key,included=false){const q=state[key][x.id]||0;const name=productName(x,key);return `<div class="card ${included?'included-card':''} clickable-card" onclick="qty('${key}','${x.id}',1)"><img src="${x.img||''}" alt="${name}"><h3>${name}</h3><p class="price">${productPriceLabel(x,key,included)}</p><div class="qty"><button onclick="event.stopPropagation();qty('${key}','${x.id}',-1)">−</button><strong>${q}</strong><button onclick="event.stopPropagation();qty('${key}','${x.id}',1)">＋</button></div><small class="tap-hint">카드를 터치해 수량 추가</small></div>`}
function names(obj,list){const a=Object.entries(obj).filter(x=>x[1]).map(([id,q])=>{const item=list.find(x=>x.id===id);return (item?(list===SIDES?sideName(item):list===DRINKS?drinkName(item):toppingName(item)):id)+' ×'+q});return a.join(', ')||'없음'}
function qty(key,id,d){
 let obj=state[key];let cur=obj[id]||0;
 if(d>0&&key==='toppings'){
   const total=Object.values(obj).reduce((a,b)=>a+b,0);
   if(total>=5)return alert('추가토핑은 전체 합계 최대 5개까지 선택할 수 있습니다.');
   if(cur>=2)return alert('동일 토핑은 최대 2개까지 선택할 수 있습니다.');
 }
 if(d>0&&state.set&&key==='includedSides'){
   if(includedCount('includedSides')>=setSideLimit())return alert(`${state.set}인 세트 포함 사이드는 ${setSideLimit()}개까지 선택할 수 있습니다.`);
 }
 if(d>0&&state.set&&key==='includedDrinks'){
   if(includedCount('includedDrinks')>=1)return alert('세트 포함 음료는 1개를 선택할 수 있습니다.');
 }
 if(d>0&&state.set&&(key==='sides'||key==='drinks')){
   const list=key==='sides'?SIDES:DRINKS;
   const item=list.find(x=>x.id===id);
   const ok=confirm(`${item.name}은(는) 세트 포함 상품 외 추가 주문입니다.\n\n추가금 ${money(item.price)}이 결제금액에 더해집니다.\n추가하시겠습니까?`);
   if(!ok)return;
 }
 cur=Math.max(0,Math.min(9,cur+d));obj[id]=cur;
 const preserve=['side','drink'].includes(state.step);
 const y=window.scrollY;
 const main=document.querySelector('.main');
 const mainY=main?.scrollTop||0;
 render();
 if(preserve)requestAnimationFrame(()=>{window.scrollTo(0,y);const m=document.querySelector('.main');if(m)m.scrollTop=mainY});
}
function selectOrderType(type){
 state.orderType=type;state.promo=null;state.set=null;
 if(type==='dinein'){subscribeSeats();state.step='partySize';}else{state.pickupMode=null;state.pickupHour=null;state.pickupMinute=null;state.pickupTime=null;state.phone='010';state.phoneDisplay='010-';state.phonePrefixCleared=false;state.step='pickup';}
 render();
}
function selectPizzaMode(mode){
 state.pizzaMode=mode;state.pizza=null;state.pizzaLeft=null;state.pizzaRight=null;state.halfStage='left';
 if(mode==='half'){
  if(state.set===2)return alert('2인 세트는 R 사이즈 전용으로 반반를 선택할 수 없습니다.');
  if(!state.set&&state.promo!=='upup'&&state.size==='R')state.size=null;
 }
 if(state.set){state.step=state.set===2?'pizza':'crust';}
 else if(state.promo==='upup'){state.step='crust';}
 else state.step='dough';
 render();
}
function selectDough(dough){
 if(state.promo==='upup')return;
 state.dough=dough;resetAfter('dough');
 if(dough==='thin'){state.size='F';state.step='crust';}
 else state.step='size';
 render();
}
function selectSize(size){
 if(state.set||state.promo==='upup'||state.dough==='thin'||(isHalf()&&size==='R'))return;
 state.size=size;resetAfter('size');state.step='crust';render();
}
function selectCrust(crust){
 state.crust=crust;state.pizza=null;state.step='pizza';render();
}
function selectPizza(id){
 if(isHalf()){
  if(state.halfStage==='left'){state.pizzaLeft=id;state.pizzaRight=null;state.halfStage='right';state.category='ALL';render();return;}
  state.pizzaRight=id;state.halfStage='confirm';render();return;
 }else state.pizza=id;
 state.toppingExpanded=false;state.step='topping';render();
}
function confirmHalfSelection(){state.toppingExpanded=false;state.step='topping';render();}
function changeHalfSelection(){state.halfStage='right';state.pizzaRight=null;state.category='ALL';render();}
function openToppings(){state.toppingExpanded=true;render();}
function skipToppings(){state.toppings={};state.toppingExpanded=false;state.step='side';render();}
function choosePromo(promo){
 if(promo==='happyhour'&&!pickupIsHappyHour())return alert('해피아워는 픽업 시간이 16:00~20:00일 때만 적용됩니다.');
 state.promo=promo;
 state.set=null;
 state.toppings={};state.sides={};state.drinks={};state.includedSides={};state.includedDrinks={};state.toppingExpanded=false;
 if(promo==='happyhour'){state.dough='hand';state.size='R';state.crust='오리지널';state.pizzaMode='single';state.step='pizza';render();return;}
 if(promo==='upup'){
  state.dough='hand';state.size='L';state.crust=null;state.pizza=null;state.pizzaLeft=null;state.pizzaRight=null;state.step='pizzaMode';
 }else{
  state.dough=null;state.size=null;state.crust=null;state.pizza=null;state.pizzaLeft=null;state.pizzaRight=null;state.step='pizzaMode';
 }
 render();
}
function openSetMenu(){
 state.promo=null;state.set=null;state.dough=null;state.size=null;state.crust=null;state.pizzaMode='single';state.pizza=null;state.pizzaLeft=null;state.pizzaRight=null;state.halfStage='left';
 state.toppings={};state.sides={};state.drinks={};state.includedSides={};state.includedDrinks={};state.toppingExpanded=false;state.step='setChoice';render();
}
function selectSet(n){
 state.set=n;
 state.promo='set';
 state.dough='hand';
 state.size=n===2?'R':n===3?'L':'F';
 state.crust=n===2?'오리지널':null;
 state.pizzaMode='single';state.pizza=null;state.pizzaLeft=null;state.pizzaRight=null;state.halfStage='left';
 state.toppings={};
 state.toppingExpanded=false;
 state.sides={};
 state.drinks={};
 state.includedSides={};
 state.includedDrinks={};
 if(n===2){state.pizzaMode='single';state.step='pizza';}else{state.step='pizzaMode';}
 render();
}

function reselectCurrent(){
 if(state.step==='cart')return addMoreMenu();
 const ok=confirm('현재 선택 중인 피자와 옵션을 다시 선택하시겠습니까?\n\n장바구니에 담긴 메뉴는 유지됩니다.');
 if(!ok)return;
 state.pizza=null;state.pizzaLeft=null;state.pizzaRight=null;state.halfStage='left';
 state.toppings={};state.sides={};state.drinks={};state.includedSides={};state.includedDrinks={};state.toppingExpanded=false;
 if(state.set===2){state.dough='hand';state.size='R';state.crust='오리지널';state.pizzaMode='single';state.step='pizza';}
 else if(state.set===3||state.set===4){state.dough='hand';state.size=state.set===3?'L':'F';state.crust=null;state.pizzaMode='single';state.step='pizzaMode';}
 else if(state.promo==='upup'){state.dough='hand';state.size='L';state.crust=null;state.pizzaMode='single';state.step='pizzaMode';}
 else {state.dough=null;state.size=null;state.crust=null;state.pizzaMode='single';state.step='pizzaMode';}
 render();
}
async function goHome(){
 const ok=confirm('현재 선택 내용과 장바구니를 모두 초기화하고 처음 화면으로 이동하시겠습니까?');
 if(!ok)return;
 await releaseCurrentSeat();
 state.orderType=null;state.cart=[];state.orderNo=null;state.partySize=null;state.pickupMode=null;state.pickupHour=null;state.pickupMinute=null;state.pickupTime=null;state.phone='010';state.phoneDisplay='010-';state.phonePrefixCleared=false;
 clearCurrentSelection();
 state.step='home';
 render();
}

function next(){
 if(state.step==='promo'&&state.promo==='upup'){
   state.dough='hand';
   state.size='L';
   state.crust=null;
   state.pizza=null;
   state.step='crust';
   render();
   return;
 }
 if(state.step==='promo'&&state.set){
   // 세트는 씬도우를 사용할 수 없고 사이즈가 자동 고정됩니다.
   state.dough='hand';
   state.size=state.set===2?'R':state.set===3?'L':'F';
   if(state.set===2){
     state.crust='오리지널';
     state.step='pizza'; // 2인 세트는 R 전용이므로 바로 피자 선택
   }else{
     state.crust=null;
     state.step='crust'; // 3·4인 세트는 크러스트 선택부터
   }
   render();
   return;
 }
 const map={type:'promo',promo:'dough',dough:'size',size:'crust',crust:'pizza',pizza:'topping',topping:'side',side:'drink',drink:'review',review:'done'};
 if(state.step==='review'){addCurrentToCart();return;}
 state.step=map[state.step]||state.step;render();
}
async function back(){
 if(state.orderType==='dinein'&&state.seatId&&['promo','setChoice','pizzaMode','dough','size','crust','pizza','topping','side','drink','review','cart'].includes(state.step)){await releaseCurrentSeat();state.step='seatZone';render();return;}
 if(state.step==='pizza'&&state.set===2){state.step='setChoice';render();return;}
 if(state.step==='pizza'&&isHalf()&&state.halfStage==='confirm'){state.halfStage='right';state.pizzaRight=null;render();return;}
 if(state.step==='pizza'&&isHalf()&&state.halfStage==='right'){state.halfStage='left';state.pizzaRight=null;render();return;}
 if(state.step==='crust'&&state.set){state.step='pizzaMode';render();return;}
 if(state.step==='crust'&&state.promo==='upup'){state.step='pizzaMode';render();return;}
 const map={type:'home',partySize:'type',pickup:'type',pickupTime:'pickup',phone:state.pickupMode==='reserve'?'pickupTime':'pickup',seatZone:'partySize',seatSelect:'seatZone',promo:state.orderType==='dinein'?'seatSelect':'phone',setChoice:'promo',pizzaMode:state.set?'setChoice':'promo',dough:'pizzaMode',size:'dough',crust:'size',pizza:'crust',topping:'pizza',side:'topping',drink:'side',review:'drink',cart:'promo'};
 state.step=map[state.step]||'home';render();
}
render();
