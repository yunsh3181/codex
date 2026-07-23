const adminGate=document.getElementById('adminLoginGate');
const adminLoginForm=document.getElementById('adminLoginForm');
const adminEmail=document.getElementById('adminEmail');
const adminPassword=document.getElementById('adminPassword');
const adminLoginError=document.getElementById('adminLoginError');
async function verifyAdminUser(user){if(!user)return false;const token=await user.getIdTokenResult(true);return token.claims.admin===true}

let unsubscribeOrders=null;
let unsubscribeWaitlist=null;
let unsubscribeSeats=null;
let unsubscribeManualCalls=null;
let subscriptionsStarted=false;
let receivedOrders=[];
let manualCustomerCalls=[];
let businessDayRefreshTimer=null;

function stopRealtimeSubscriptions(){
 if(unsubscribeOrders){unsubscribeOrders();unsubscribeOrders=null}
 if(unsubscribeWaitlist){unsubscribeWaitlist();unsubscribeWaitlist=null}
 if(unsubscribeSeats){unsubscribeSeats();unsubscribeSeats=null}
 if(unsubscribeManualCalls){unsubscribeManualCalls();unsubscribeManualCalls=null}
 if(businessDayRefreshTimer){clearTimeout(businessDayRefreshTimer);businessDayRefreshTimer=null}
 subscriptionsStarted=false;
}

function refreshVisibleOrders(now=new Date()){
 orders=visibleBusinessDayOrders(receivedOrders,now);
 render();
 assignMissingOrderSequences(orders).catch(error=>console.error('영업일 순번 배정 실패',error));
}

function scheduleBusinessDayRefresh(){
 if(businessDayRefreshTimer)clearTimeout(businessDayRefreshTimer);
 const now=new Date();
 const seoulParts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 const currentSeoulAsUtc=Date.UTC(Number(seoulParts.year),Number(seoulParts.month)-1,Number(seoulParts.day),Number(seoulParts.hour),Number(seoulParts.minute),Number(seoulParts.second));
 const boundaryAsUtc=Date.UTC(Number(seoulParts.year),Number(seoulParts.month)-1,Number(seoulParts.day)+(Number(seoulParts.hour)>=9?1:0),9,0,0);
 const delay=Math.max(1000,boundaryAsUtc-currentSeoulAsUtc+1000);
 businessDayRefreshTimer=setTimeout(()=>{refreshVisibleOrders();scheduleBusinessDayRefresh()},delay);
}

function startRealtimeSubscriptions(){
 if(subscriptionsStarted)return;
 subscriptionsStarted=true;
 initialLoad=true;
 waitingInitialLoad=true;

 unsubscribeOrders=db.collection('orders').onSnapshot(snapshot=>{
 connectionBadge.textContent='실시간 연결';
 connectionBadge.className='connection live';
 const added=[];
 snapshot.docChanges().forEach(change=>{
   if(change.type==='added')added.push({id:change.doc.id,...change.doc.data()});
 });
 receivedOrders=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
 const now=new Date();
 refreshVisibleOrders(now);
 if(!initialLoad)notifyNewOrders(added.filter(o=>['payment_pending','new'].includes(o.status)&&isCurrentBusinessDayOrder(o,now)));
 if(soundEnabled&&hasUnacceptedOrders())startNewOrderRepeat();
 else if(!hasUnacceptedOrders())stopNewOrderRepeat();
 initialLoad=false;
},error=>{
 console.error(error);
 connectionBadge.textContent='연결 오류';
 connectionBadge.className='connection error';
 orderList.innerHTML=`<div class="empty">Firestore 연결 오류: ${esc(error.message)}</div>`;
});
 scheduleBusinessDayRefresh();

 unsubscribeWaitlist=db.collection('waitlist').onSnapshot(snapshot=>{
 const added=[];
 waitingEntries=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
 snapshot.docChanges().forEach(ch=>{if(ch.type==='added'&&ch.doc.data().status==='waiting')added.push({id:ch.doc.id,...ch.doc.data()})});
 renderWaiting();
 if(!waitingInitialLoad&&added.length){
   playPreset();setTimeout(()=>speak(`새로운 줄서기 ${added.length}건이 등록되었습니다.`),500);
 }
  waitingInitialLoad=false;
 });
 unsubscribeSeats=db.collection('seats').onSnapshot(snapshot=>{
  seatDocuments={};
  snapshot.forEach(doc=>seatDocuments[doc.id]=doc.data());
  const badge=document.getElementById('seatOverviewConnection');
  if(badge){badge.textContent='실시간 연결';badge.className='live'}
  renderSeatOverview();
 },error=>{
  console.error('좌석 연결 실패',error);
  const badge=document.getElementById('seatOverviewConnection');
  if(badge){badge.textContent='연결 오류';badge.className='error'}
 });
 unsubscribeManualCalls=db.collection('manualCustomerCalls').onSnapshot(snapshot=>{
  manualCustomerCalls=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
  render();
 },error=>{
  console.error('대면 포장 수동접수 연결 실패',error);
  showAdminMessage(`대면 포장 접수 현황을 불러오지 못했습니다: ${error.message}`,true);
 });
}

firebase.auth().onAuthStateChanged(async user=>{
 try{
  const ok=await verifyAdminUser(user);
  adminGate.hidden=ok;
  document.body.classList.toggle('admin-authenticated',ok);
  if(ok){
   startRealtimeSubscriptions();
  }else{
   stopRealtimeSubscriptions();
   if(user){
    adminLoginError.textContent='관리자 권한이 없는 계정입니다.';
    await firebase.auth().signOut();
   }
  }
 }catch(error){
  stopRealtimeSubscriptions();
  adminLoginError.textContent='관리자 권한 확인 실패: '+error.message;
 }
});
adminLoginForm?.addEventListener('submit',async e=>{e.preventDefault();adminLoginError.textContent='';try{const result=await firebase.auth().signInWithEmailAndPassword(adminEmail.value.trim(),adminPassword.value);if(!await verifyAdminUser(result.user))throw new Error('관리자 권한이 없습니다.')}catch(error){adminLoginError.textContent=error.message}});
const soundButton=document.getElementById('soundButton');
const soundSettingsButton=document.getElementById('soundSettingsButton');
const connectionBadge=document.getElementById('connectionBadge');
const takeoutPending=document.getElementById('takeoutPending');
const takeoutProcessing=document.getElementById('takeoutProcessing');
const seatOverviewGrid=document.getElementById('seatOverviewGrid');
const settingsModal=document.getElementById('soundSettingsModal');
const soundPreset=document.getElementById('soundPreset');
const soundVolume=document.getElementById('soundVolume');
const volumeValue=document.getElementById('volumeValue');
const voiceEnabled=document.getElementById('voiceEnabled');
const customSoundFile=document.getElementById('customSoundFile');
const customSoundName=document.getElementById('customSoundName');
let orders=[];
let activeFilter='payment_pending';
let activeChannel='all';
let initialLoad=true;
let soundEnabled=localStorage.getItem('pjAdminSoundEnabled')!=='false';
let audioContext=null;
let audioMaster=null;
let customAudioUrl=null;
let settings={preset:'papa',volume:1,voice:true};

try{settings={...settings,...JSON.parse(localStorage.getItem('pjAdminSoundSettings')||'{}')}}catch(e){}
soundPreset.value=settings.preset||'papa';
soundVolume.value=Math.round((settings.volume??1)*100);volumeValue.textContent=soundVolume.value+'%';voiceEnabled.checked=settings.voice!==false;

const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
const jsArg=value=>JSON.stringify(String(value??'')).replace(/</g,'\\u003c');
const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const statusNames={payment_pending:'결제대기',new:'결제대기',paid:'접수',accepted:'접수',cooking:'조리중',ready:'완료',completed:'완료',cancelled:'취소'};
const ADMIN_SEATS=[
 {id:'papa-2',name:'파파존 2인석'},{id:'papa-bar4',name:'파파존 바테이블'},
 {id:'outdoor-1',name:'야외존1번'},{id:'outdoor-2',name:'야외존2번'},{id:'outdoor-3',name:'야외존3번'},{id:'outdoor-4',name:'야외존4번'},
 {id:'annex-1',name:'별관1'},{id:'annex-2',name:'별관2'},{id:'annex-3',name:'별관3'},{id:'annex-4',name:'별관4'},
 {id:'room-1',name:'룸1'},{id:'room-2',name:'룸2'},{id:'room-3',name:'룸3'}
];
const seatStatusNames={empty:'빈자리',occupied:'사용중',held:'주문중'};
let seatDocuments={};
const formatTime=value=>{const d=value?.toDate?value.toDate():value?new Date(value):null;if(!d||Number.isNaN(d.getTime()))return '-';return new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};
const dateValue=value=>value?.toMillis?value.toMillis():value?.seconds?value.seconds*1000:Number(new Date(value||0))||0;
function orderNumberLabel(value){
 const raw=String(value??'');
 const digits=raw.replace(/\D/g,'');
 return digits.length>=4?digits.slice(-4):raw
}
function spokenOrderNumber(value){
 return orderNumberLabel(value)
}
function adminOrderNumberLabel(order){
 const stored=order?.customerNumber||order?.orderNo;
 if(stored)return orderNumberLabel(stored);
 const sequence=order?.sequence||order?.dailySequence;
 return sequence?String(sequence).padStart(4,'0').slice(-4):'-'
}
function orderTimeMillis(value){
 if(value?.toMillis)return value.toMillis();
 if(Number.isFinite(Number(value?.seconds)))return Number(value.seconds)*1000;
 const millis=value?new Date(value).getTime():NaN;
 return Number.isFinite(millis)?millis:null;
}
function compareOrdersOldestFirst(a,b){
 const aTime=orderTimeMillis(a?.createdAt)??orderTimeMillis(a?.createdAtClient);
 const bTime=orderTimeMillis(b?.createdAt)??orderTimeMillis(b?.createdAtClient);
 if(aTime!==bTime){if(aTime==null)return 1;if(bTime==null)return -1;return aTime-bTime}
 const aSequence=Number(a?.sequence??a?.dailySequence);
 const bSequence=Number(b?.sequence??b?.dailySequence);
 const aValid=Number.isFinite(aSequence)&&aSequence>0,bValid=Number.isFinite(bSequence)&&bSequence>0;
 if(aValid!==bValid)return aValid?-1:1;
 return aValid&&aSequence!==bSequence?aSequence-bSequence:0;
}
function seoulBusinessDayKey(value=new Date()){
 const date=value?.toDate?value.toDate():new Date(value);
 if(Number.isNaN(date.getTime()))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 let businessDate=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),12));
 if(Number(parts.hour)<9)businessDate.setUTCDate(businessDate.getUTCDate()-1);
 return businessDate.toISOString().slice(0,10);
}
const ACTIVE_ORDER_STATUSES=new Set(['payment_pending','new','accepted','paid','cooking']);
function orderBusinessDayKey(order){
 if(typeof order?.businessDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(order.businessDay))return order.businessDay;
 const createdAtKey=order?.createdAt!=null?seoulBusinessDayKey(order.createdAt):null;
 if(createdAtKey)return createdAtKey;
 return order?.createdAtClient!=null?seoulBusinessDayKey(order.createdAtClient):null;
}
function isCurrentBusinessDayOrder(order,now=new Date()){
 const currentBusinessDay=seoulBusinessDayKey(now);
 const orderBusinessDay=orderBusinessDayKey(order);
 return Boolean(currentBusinessDay&&orderBusinessDay&&orderBusinessDay===currentBusinessDay);
}
function shouldShowBusinessDayOrder(order,now=new Date()){
 const orderBusinessDay=orderBusinessDayKey(order);
 if(!orderBusinessDay)return false;
 return orderBusinessDay===seoulBusinessDayKey(now)||ACTIVE_ORDER_STATUSES.has(order.status);
}
function visibleBusinessDayOrders(list,now=new Date(),limit=100){
 const sorted=(list||[])
  .filter(order=>shouldShowBusinessDayOrder(order,now))
  .map((order,index)=>({order,index}))
  .sort((a,b)=>compareOrdersOldestFirst(a.order,b.order)||a.index-b.index);
 return sorted.slice(Math.max(0,sorted.length-limit)).map(entry=>entry.order);
}
const sequenceAssignments=new Set();
async function ensureOrderSequence(order){
 if(!order?.id||Number(order.sequence||order.dailySequence)>0||sequenceAssignments.has(order.id))return;
 sequenceAssignments.add(order.id);
 try{
  const businessDay=seoulBusinessDayKey(order.createdAt||order.createdAtClient||new Date());
  const storeId=String(order.storeId||'pangyo2-techno-valley').replace(/[^a-zA-Z0-9_-]/g,'_');
  const orderRef=db.collection('orders').doc(order.id);
  const counterRef=db.collection('dailyStats').doc(`order-sequence_${storeId}_${businessDay}`);
  await db.runTransaction(async transaction=>{
   const [orderSnapshot,counterSnapshot]=await Promise.all([transaction.get(orderRef),transaction.get(counterRef)]);
   if(!orderSnapshot.exists)return;
   const saved=orderSnapshot.data();
   if(Number(saved.sequence||saved.dailySequence)>0)return;
   const next=Math.max(0,Number(counterSnapshot.exists?counterSnapshot.data().lastSequence:0)||0)+1;
   transaction.set(counterRef,{type:'orderSequence',storeId,businessDay,lastSequence:next,updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
   transaction.update(orderRef,{businessDay,sequence:next,dailySequence:next,sequenceAssignedAt:firebase.firestore.FieldValue.serverTimestamp()});
  });
 }finally{sequenceAssignments.delete(order.id)}
}
async function assignMissingOrderSequences(list){
 const pending=(list||[]).filter(order=>!Number(order.sequence||order.dailySequence)).sort((a,b)=>{
  const millis=value=>value?.toMillis?value.toMillis():value?.seconds?value.seconds*1000:new Date(value||0).getTime()||0;
  return millis(a.createdAt||a.createdAtClient)-millis(b.createdAt||b.createdAtClient);
 });
 for(const order of pending)await ensureOrderSequence(order);
}
const ORDER_CATALOG=window.PJ_ORDER_CATALOG||{};
function displayText(value,fallback='-'){
 if(typeof value==='string'||typeof value==='number')return String(value).trim()||fallback;
 return fallback;
}
function productName(id,category,legacyMaster=[]){return displayText(ORDER_CATALOG[category]?.[id]||legacyMaster.find(x=>x.id===id)?.name||id)}

const ADMIN_SEAT_NAMES={
 'papa-2':'파파존 2인석','papa-bar4':'파파존 4인 바테이블',
 'outdoor-1':'야외석 1번','outdoor-2':'야외석 2번','outdoor-3':'야외석 3번','outdoor-4':'야외석 4번',
 'annex-1':'별관 1번','annex-2':'별관 2번','annex-3':'별관 3번','annex-4':'별관 4번',
 'room-1':'룸테이블 1','room-2':'룸테이블 2','room-3':'룸테이블 3'
};
const ADMIN_ZONE_NAMES={papa:'파파존',outdoor:'야외석',annex:'별관',room:'별관룸'};
function orderSeatIds(order){
 const tables=Array.isArray(order?.seat?.tables)?order.seat.tables.filter(Boolean):[];
 if(tables.length)return [...new Set(tables)];
 return order?.seat?.id?[order.seat.id]:[];
}
function orderSeatLabel(order){
 if(order?.seat?.name)return order.seat.name;
 const ids=orderSeatIds(order);
 return ids.map(id=>ADMIN_SEAT_NAMES[id]||id).join(' + ');
}
function orderZoneLabel(order){return ADMIN_ZONE_NAMES[order?.seat?.zone]||order?.seat?.zone||'-'}

function normalizedOption(value){return String(value||'').trim().toLowerCase().replace(/[\s_-]+/g,'')}
function adminSizeLabel(item){
 const raw=item?.size||item?.pizzaSize||item?.selectedSize||'';
 const n=normalizedOption(raw);
 if(item?.promo==='upup'&&(!n||n==='l→f'||n==='ltof'))return '14"';
 if(['r','regular','레귤러','9','9inch','9인치'].includes(n))return '9"';
 if(['l','large','라지','12','12inch','12인치'].includes(n))return '12"';
 if(['f','family','패밀리','14','14inch','14인치'].includes(n))return '14"';
 return raw;
}
function optionIs(value,words){const normalized=normalizedOption(value);return words.some(word=>normalized===word||normalized.includes(word))}
function formatPizzaDisplayCode(pizza){
 const size=adminSizeLabel(pizza);
 const dough=pizza?.dough||pizza?.doughType;
 const crust=pizza?.crust||pizza?.crustType;
 const croissant=optionIs(dough,['croissant','크루아상','cro'])||optionIs(crust,['croissant','크루아상','cro']);
 const thin=optionIs(dough,['thin','씬도우','씬']);
 const cheeseRoll=optionIs(crust,['cheeseroll','치즈롤','ch']);
 const goldRing=optionIs(crust,['goldring','골드링','gold','g']);
 const defaultCrust=!normalizedOption(crust)||optionIs(crust,['original','오리지널','기본']);
 if(croissant&&size==='12"')return 'CRO12';
 if(thin&&goldRing&&size==='14"')return 'T14G';
 if(thin&&defaultCrust&&size==='14"')return 'TH';
 if(cheeseRoll&&size==='12"')return 'CH12';
 if(cheeseRoll&&size==='14"')return 'CH14';
 if(goldRing&&size==='12"')return '12G';
 if(goldRing&&size==='14"')return '14G';
 return ['9"','12"','14"'].includes(size)?size:(displayText(pizza?.size||pizza?.pizzaSize||pizza?.selectedSize,'-'));
}
function renderPizzaDisplayCode(code){
 const parts=displayText(code).match(/[A-Za-z]+|[^A-Za-z]+/g)||['-'];
 return `<span class="pizza-code">[${parts.map(part=>/^[A-Za-z]+$/.test(part)?`<span class="pizza-code-alpha">${esc(part)}</span>`:esc(part)).join('')}]</span>`;
}
function adminPizzaName(item){
 const leftId=item?.pizzaLeft||item?.pizza;
 const rightId=item?.pizzaRight;
 if(!leftId)return displayText(item?.name||item?.menuName||item?.id||item?.code);
 const left=productName(leftId,'pizzas',PIZZAS);
 const names=[left,(item?.pizzaMode||item?.mode)==='half'&&rightId?productName(rightId,'pizzas',PIZZAS):''].filter(Boolean);
 return names.join(' / ')||'-';
}
function quantityHTML(quantity){const qty=Math.max(1,Number(quantity)||1);return qty>1?` <span class="admin-quantity">×${qty}</span>`:''}
function selectionEntries(map,category,legacyMaster=[]){return Object.entries(map||{}).filter(([,q])=>Number(q)>0).map(([id,q])=>({name:productName(id,category,legacyMaster),quantity:Number(q)||1}))}
function drinkEntries(map){return Object.entries(map||{}).filter(([,q])=>Number(q)>0).map(([id,q])=>({name:productName(id,ORDER_CATALOG.sauces?.[id]?'sauces':'drinks',DRINKS),quantity:Number(q)||1}))}
function itemListHTML(entries){return `<div class="admin-detail-list">${entries.map(entry=>`<div class="admin-product-row"><span class="admin-item-name">${esc(entry.name)}</span>${quantityHTML(entry.quantity)}</div>`).join('')}</div>`}
function itemHTML(item){
 const benefit=item.set?`${Number(item.set)||0}인 세트`:item.promo==='upup'?'UP & UP':item.promo==='takeout'?'포장 20%':'일반주문';
 const toppings=selectionEntries(item.toppings,'toppings',TOPPINGS);
 return `<div class="order-item admin-pizza-item"><div class="admin-product-row admin-pizza-row"><strong class="admin-pizza-heading">${renderPizzaDisplayCode(formatPizzaDisplayCode(item))}<span class="admin-pizza-name">${esc(adminPizzaName(item))}</span></strong>${quantityHTML(item.qty)}</div>${toppings.length?`<div class="admin-toppings"><b>토핑</b>${itemListHTML(toppings)}</div>`:''}<small>${esc(benefit)} · ${money(item.total||0)}</small></div>`;
}
function orderBenefitLabel(order){return [...new Set((order.items||[]).map(item=>item.set?`${Number(item.set)||0}인 세트`:item.promo==='upup'?'UP & UP':item.promo==='takeout'?'포장 20%':item.promo==='happy'?'해피아워':'일반주문'))].join(' + ')||'-'}
function safeAmounts(order){
 const candidates=[order?.originalAmount,order?.normalAmount,order?.subtotal,order?.totalAmount,order?.total];
 const original=Math.max(0,Number(candidates.find(value=>Number.isFinite(Number(value))))||0);
 const paidCandidates=[order?.finalAmount,order?.totalAmount,order?.total,order?.amount,original];
 const paid=Math.max(0,Number(paidCandidates.find(value=>Number.isFinite(Number(value))))||0);
 const savedDiscount=Number(order?.discountAmount);
 const discount=Math.max(0,order?.discountAmount!=null&&Number.isFinite(savedDiscount)?savedDiscount:original-paid);
 return {original,discount,paid};
}
function splitPaymentSummary(order,paid=safeAmounts(order).paid){
 const stored=Array.isArray(order?.payment?.splitAmounts)?order.payment.splitAmounts.map(Number).filter(value=>Number.isFinite(value)&&value>=0):[];
 const requested=Number(order?.payment?.splitCount);
 const count=Number.isInteger(requested)&&requested>1?requested:stored.length>1?stored.length:0;
 if(count<2)return null;
 const amounts=stored.length>1?stored:Array.from({length:count},(_,index)=>Math.floor(paid/count)+(index>=count-paid%count?1:0));
 const groups=[];
 amounts.forEach(amount=>{const found=groups.find(group=>group.amount===amount);if(found)found.count++;else groups.push({amount,count:1})});
 return {count,amounts,groups,total:amounts.reduce((sum,value)=>sum+value,0),matchesPaid:amounts.reduce((sum,value)=>sum+value,0)===paid};
}
function orderMenuHTML(order){
 const items=Array.isArray(order.items)?order.items:[];
 const sides=items.flatMap(item=>[...selectionEntries(item.includedSides,'sides',SIDES),...selectionEntries(item.sides,'sides',SIDES)]);
 const drinks=items.flatMap(item=>[...drinkEntries(item.includedDrinks),...drinkEntries(item.drinks)]);
 return `${items.length?`<section><h4>피자</h4><div class="detail-items">${items.map(itemHTML).join('')}</div></section>`:'<p class="empty-items">저장된 피자 정보가 없습니다.</p>'}${sides.length?`<section><h4>사이드</h4>${itemListHTML(sides)}</section>`:''}${drinks.length?`<section><h4>음료</h4>${itemListHTML(drinks)}</section>`:''}`;
}
function orderOperationsHTML(order){
 const {original,discount,paid}=safeAmounts(order),split=splitPaymentSummary(order,paid);
 const phone=displayText(order.phone||order.phoneMasked,'-');
 const takeout=order.orderType==='takeout';
 const seat=takeout?'포장':displayText(orderSeatLabel(order));
 const party=Number(order.partySize)>0?`${Number(order.partySize)}인`:'-';
 const splitHTML=split?`<div class="payment-metric split-metric"><span>1인당 결제금액</span><strong>${money(split.groups[0].amount)}</strong><small>${split.groups.map(group=>`${money(group.amount)} × ${group.count}명`).join(' · ')}${split.matchesPaid?'':' · 저장 합계 '+money(split.total)}</small></div>`:'';
 return `<div class="key-info"><div><span>인원</span><strong>${party}</strong></div><div><span>${takeout?'이용방법':'좌석'}</span><strong>${esc(seat)}</strong></div><div class="phone-info"><span>연락처</span><strong>${esc(phone)}</strong>${phone!=='-'?`<button type="button" data-action="copy-phone" data-phone="${esc(phone)}">복사</button>`:''}</div></div><div class="order-context"><span>${PJCommon.legacyChannel(order)==='mobile'?'모바일':'PC'}</span><span>${takeout?'포장':'매장식사'}</span><span>${esc(order.pickup?.time?`예약 ${order.pickup.time}`:'바로 주문')}</span><span>${esc(orderBenefitLabel(order))}</span></div><div class="payment-grid"><div class="payment-metric"><span>결제수단</span><strong>${esc(displayText(order.payment?.methodName))}</strong>${split?`<small>${split.count}명 분할결제</small>`:''}</div>${splitHTML}<div class="payment-metric"><span>원 금액</span><strong>${money(original)}</strong></div><div class="payment-metric discount"><span>할인금액</span><strong>${discount?`−${money(discount)}`:money(0)}</strong></div><div class="payment-metric paid"><span>결제금액</span><strong>${money(paid)}</strong></div></div>`;
}
function filterOrders(order){const channel=PJCommon.legacyChannel(order);if(activeChannel!=='all'&&channel!==activeChannel)return false;if(activeFilter==='all')return true;if(activeFilter==='payment_pending')return ['payment_pending','new'].includes(order.status);if(activeFilter==='accepted')return ['accepted','paid'].includes(order.status);if(activeFilter==='completed')return ['completed','ready'].includes(order.status);return order.status===activeFilter}
function adminStatusName(order){if(order.orderType!=='takeout'&&['accepted','paid','cooking'].includes(order.status))return '사용중';return statusNames[order.status]||order.status}
function adminStatusVisual(order){if(['payment_pending','new'].includes(order.status))return {className:'seat-ordering',icon:'🟡'};if(order.orderType!=='takeout'&&['accepted','paid','cooking'].includes(order.status))return {className:'seat-occupied',icon:'🔴'};if(order.orderType==='takeout'&&['accepted','paid','cooking','ready','completed'].includes(order.status))return {className:'seat-available',icon:'🟢'};if(['ready','completed'].includes(order.status))return {className:'seat-available',icon:'🟢'};return {className:'',icon:''}}
function adminOrderActions(order){
 const pending=['payment_pending','new'].includes(order.status),inProgress=['accepted','paid','cooking'].includes(order.status),done=['ready','completed'].includes(order.status),takeout=order.orderType==='takeout';
 const primary=pending?`<button type="button" class="accept" data-action="set-status" data-order-id="${esc(order.id)}" data-status="accepted">접수</button>`:inProgress?`<button type="button" class="${takeout?'ready':'occupied-action'}" data-action="set-status" data-order-id="${esc(order.id)}" data-status="completed">조리완료</button>`:'';
 return `${primary}${inProgress||done?`<button type="button" class="call" data-action="call-customer" data-order-no="${esc(order.customerNumber||order.orderNo||'')}" data-order-language="${esc(order.language||'')}">📢 고객 호출</button>`:''}${!['cancelled','completed'].includes(order.status)?`<button type="button" class="cancel" data-action="set-status" data-order-id="${esc(order.id)}" data-status="cancelled">취소</button>`:''}`;
}
function takeoutItemCount(order){
 return Number(order.itemCount)||(order.items||[]).reduce((sum,item)=>sum+Math.max(1,Number(item.qty)||1),0);
}
function takeoutPendingCard(order){
 const visual=adminStatusVisual(order);
 return `<article class="order-card takeout-large ${order.status}"><header class="order-head"><div class="order-identity"><div class="order-no">${esc(adminOrderNumberLabel(order))}</div><span class="status-badge ${order.status} ${visual.className}">포장 · 결제대기</span></div><time>주문시간 ${formatTime(order.createdAt||order.createdAtClient)}</time></header><div class="order-card-body"><div class="order-menu">${orderMenuHTML(order)}</div><div class="order-operations">${orderOperationsHTML(order)}<div class="actions takeout-accept-action"><button type="button" class="accept" data-action="set-status" data-order-id="${esc(order.id)}" data-status="cooking">주문접수</button></div></div></div></article>`;
}
function takeoutProgressAction(order){
 if(['accepted','paid','cooking'].includes(order.status))return {label:'조리완료',status:'ready',className:'ready'};
 return {label:'픽업완료',status:'completed',className:'pickup'};
}
function takeoutProcessingCard(order){
 const action=takeoutProgressAction(order);
 return `<article class="takeout-small" data-order-status="${esc(order.status)}"><div class="takeout-small-number">${esc(adminOrderNumberLabel(order))}</div><strong>포장 주문</strong><span>주문시간 ${formatTime(order.createdAt||order.createdAtClient)}</span><span>상품 ${takeoutItemCount(order)}개</span><button type="button" class="${action.className}" data-action="set-status" data-order-id="${esc(order.id)}" data-status="${action.status}">${action.label}</button></article>`;
}
function manualCustomerCallCard(call){
 const ready=call.displayStatus==='ready';
 return `<article class="takeout-small manual" data-manual-call-id="${esc(call.id)}"><div class="takeout-small-number">${esc(orderNumberLabel(call.orderNumber))}</div><span class="manual-badge">대면접수</span><strong>대면 포장</strong><span>현재 상태 · ${ready?'조리완료':'조리중'}</span><span>접수 시각 ${formatTime(call.createdAt)}</span><button type="button" class="${ready?'pickup':'ready'}" data-action="set-manual-status" data-call-id="${esc(call.id)}" data-status="${ready?'picked-up':'ready'}">${ready?'픽업완료':'조리완료'}</button></article>`;
}
function normalizedSeatStatus(status){return status==='occupied'?'occupied':status==='held'?'held':'empty'}
function renderSeatOverview(){
 if(!seatOverviewGrid)return;
 seatOverviewGrid.innerHTML=ADMIN_SEATS.map(seat=>{
  const data=seatDocuments[seat.id]||{},status=normalizedSeatStatus(data.status);
  const orderNumber=orderNumberLabel(data.orderNo||data.customerNumber||data.orderId||'');
  const content=`<strong>${esc(seat.name)}</strong><span class="seat-overview-status"><i aria-hidden="true"></i>${seatStatusNames[status]}</span>${status!=='empty'&&orderNumber?`<small>${esc(orderNumber)}</small>`:''}`;
  return status==='empty'
   ?`<article class="seat-overview-card ${status}" data-seat-id="${esc(seat.id)}">${content}</article>`
   :`<button type="button" class="seat-overview-card ${status}" data-action="clear-seat" data-seat-id="${esc(seat.id)}" aria-label="${esc(seat.name)} ${seatStatusNames[status]}. 빈자리로 변경">${content}</button>`;
 }).join('');
}
function render(){
 const sortedTakeout=orders.filter(order=>order.orderType==='takeout').sort(compareOrdersOldestFirst);
 const pendingTakeout=sortedTakeout.filter(order=>['payment_pending','new'].includes(order.status));
 const processingTakeout=sortedTakeout.filter(order=>['accepted','paid','cooking','ready'].includes(order.status));
 if(takeoutPending)takeoutPending.innerHTML=pendingTakeout.length?takeoutPendingCard(pendingTakeout[0]):'<div class="empty">결제대기 포장 주문이 없습니다.</div>';
 const processingCards=[
  ...processingTakeout.map(order=>({time:order.createdAt||order.createdAtClient,html:takeoutProcessingCard(order)})),
  ...manualCustomerCalls.map(call=>({time:call.createdAt,html:manualCustomerCallCard(call)}))
 ].sort((a,b)=>dateValue(a.time)-dateValue(b.time));
 if(takeoutProcessing)takeoutProcessing.innerHTML=processingCards.length?processingCards.map(card=>card.html).join(''):'<div class="empty">처리중인 포장 주문이 없습니다.</div>';
 const filtered=orders.filter(order=>order.orderType!=='takeout').filter(filterOrders).map((order,index)=>({order,index})).sort((a,b)=>compareOrdersOldestFirst(a.order,b.order)||a.index-b.index).map(entry=>entry.order);
 orderList.innerHTML=filtered.length?filtered.map(order=>{const visual=adminStatusVisual(order);return `<article class="order-card ${order.status}"><header class="order-head"><div class="order-identity"><div class="order-no">${esc(adminOrderNumberLabel(order))}</div><span class="status-badge ${order.status} ${visual.className}">${visual.icon?`${visual.icon} `:''}${esc(adminStatusName(order))}</span></div><time>주문시간 ${formatTime(order.createdAt||order.createdAtClient)}</time></header><div class="order-card-body"><div class="order-menu">${orderMenuHTML(order)}</div><div class="order-operations">${orderOperationsHTML(order)}<div class="actions">${adminOrderActions(order)}</div></div></div></article>`}).join(''):'<div class="empty">해당 상태의 주문이 없습니다.</div>';
 const count=s=>orders.filter(o=>s.includes(o.status)).length;
 document.getElementById('newCount').textContent=count(['payment_pending','new']);document.getElementById('cookingCount').textContent=count(['paid','accepted','cooking']);document.getElementById('doneCount').textContent=count(['ready','completed']);
 const pendingCount=count(['payment_pending','new']);document.title=pendingCount?`🔴 미접수 주문(${pendingCount}) · 관리자`:'파파존스 주문 관리자';
 const today=new Date();today.setHours(0,0,0,0);const sales=orders.filter(o=>{const d=o.createdAt?.toDate?o.createdAt.toDate():new Date(o.createdAtClient||0);return d>=today&&o.status!=='cancelled'}).reduce((s,o)=>s+Number(o.total||0),0);document.getElementById('todaySales').textContent=money(sales);
}
function seatReleasePayload(){
 return {
  status:'empty',
  orderId:null,orderNo:null,partySize:null,groupId:null,
  occupiedAt:null,heldBy:null,heldAt:null,heldUntil:null,cleaningAt:null,
  updatedAt:firebase.firestore.FieldValue.serverTimestamp()
 };
}
const statusUpdateLocks=new Set();
// Counter/in-person takeout intake only: this displays waiting status outside the kiosk flow.
// Menu, payment, and sales records remain in their existing systems and are never created here.
const MANUAL_CALL_STORE_ID='pangyo2-techno-valley';
const manualCallLocks=new Set();
function validManualCustomerNumber(value){return /^[0-9]{4}$/.test(String(value??'').trim())}
function manualCallDocumentId(orderNumber){return `${MANUAL_CALL_STORE_ID}_${orderNumber}`}
async function createManualCustomerCall(orderNumber,status,buttons=[]){
 const number=String(orderNumber??'').trim();
 if(!validManualCustomerNumber(number)){showAdminMessage('전화번호 뒤 4자리 숫자를 정확히 입력해 주세요.',true);return false}
 const id=manualCallDocumentId(number);
 if(manualCallLocks.has(id))return false;
 manualCallLocks.add(id);buttons.forEach(button=>{button.disabled=true;button.setAttribute('aria-busy','true')});
 try{
  await db.runTransaction(async transaction=>{
   const ref=db.collection('manualCustomerCalls').doc(id);
   const existing=await transaction.get(ref);
   if(existing.exists){const error=new Error(`${number}번은 이미 고객 화면에 표시 중입니다.`);error.code='manual-call/duplicate';throw error}
   transaction.set(ref,{orderNumber:number,displayStatus:status,storeId:MANUAL_CALL_STORE_ID,announceVersion:status==='ready'?1:0,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  });
  showAdminMessage(`${number}번을 ${status==='ready'?'조리완료':'조리중'}에 등록했습니다.`);
  return true;
 }catch(error){
  showAdminMessage(error.code==='manual-call/duplicate'?error.message:`대면 포장 주문접수 실패: ${error.message}`,true);
  return false;
 }finally{
  manualCallLocks.delete(id);buttons.forEach(button=>{button.disabled=false;button.removeAttribute('aria-busy')});
 }
}
async function setManualCustomerCallStatus(id,status,button){
 if(!id||manualCallLocks.has(id))return false;
 manualCallLocks.add(id);const original=button?.textContent||'';
 if(button){button.disabled=true;button.textContent='처리 중…';button.setAttribute('aria-busy','true')}
 try{
  const ref=db.collection('manualCustomerCalls').doc(id);
  if(status==='picked-up')await ref.delete();
  else await ref.update({displayStatus:'ready',announceVersion:1,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  showAdminMessage(status==='picked-up'?'픽업 완료로 처리했습니다.':'조리완료로 변경했습니다.');
  return true;
 }catch(error){showAdminMessage(`대면 포장 상태 처리 실패: ${error.message}`,true);return false}
 finally{manualCallLocks.delete(id);if(button&&button.isConnected){button.disabled=false;button.textContent=original;button.removeAttribute('aria-busy')}}
}
function showAdminMessage(message,isError=false){
 const toast=document.getElementById('toast');
 const text=document.getElementById('toastText');
 if(!toast||!text){if(isError)alert(message);return}
 toast.querySelector('strong').textContent=isError?'처리 실패':'처리 완료';
 text.textContent=message;
 toast.style.borderLeftColor=isError?'#d71920':'#08703c';
 toast.hidden=false;toast.classList.add('show');
 clearTimeout(showAdminMessage.timer);
 showAdminMessage.timer=setTimeout(()=>{toast.classList.remove('show');toast.hidden=true},3500);
}
async function setStatus(id,status,button){
 if(!id||statusUpdateLocks.has(id))return false;
 statusUpdateLocks.add(id);
 const originalText=button?.textContent||'';
 if(button){button.disabled=true;button.textContent='처리 중…';button.setAttribute('aria-busy','true')}
 try{
  const order=orders.find(o=>o.id===id);
  if(!order)throw new Error('주문 정보를 찾을 수 없습니다. 화면을 새로고침해 주세요.');
  if((status==='accepted'&&order.orderType!=='takeout')||(status==='cooking'&&order.orderType==='takeout'))stopNewOrderRepeat();
  const seatIds=orderSeatIds(order);
  const batch=db.batch();
  batch.update(db.collection('orders').doc(id),{status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  if(order.orderType==='takeout'){
   const displayRef=db.collection('publicOrderDisplays').doc(id);
   if(['accepted','paid','cooking','ready'].includes(status)){
    batch.set(displayRef,{
     orderNumber:String(order.customerNumber||order.orderNo||adminOrderNumberLabel(order)),
     displayStatus:status==='ready'?'ready':'cooking',
     storeId:String(order.storeId||'pangyo2-techno-valley'),
     updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    });
   }else{
    batch.delete(displayRef);
   }
  }
  if(seatIds.length&&status==='accepted'&&order.orderType!=='takeout'){
   seatIds.forEach(seatId=>batch.set(db.collection('seats').doc(seatId),{
    status:'occupied',heldBy:null,heldUntil:null,
    occupiedAt:firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
   },{merge:true}));
  }
  if(seatIds.length&&['completed','cancelled'].includes(status)){
   seatIds.forEach(seatId=>batch.set(db.collection('seats').doc(seatId),seatReleasePayload(),{merge:true}));
  }
  await batch.commit();
  showAdminMessage(status==='accepted'&&order.orderType!=='takeout'?'좌석을 사용중으로 변경했습니다.':status==='completed'&&order.orderType==='takeout'?'픽업 완료로 처리했습니다.':status==='completed'?'주문 완료와 좌석 해제를 처리했습니다.':'주문 상태가 변경되었습니다.');
  if(!['payment_pending','new'].includes(status))setTimeout(()=>{if(hasUnacceptedOrders())startNewOrderRepeat();else stopNewOrderRepeat()},300);
  if((status==='ready'&&order.orderType==='takeout')||(status==='completed'&&order.orderType!=='takeout'))callCustomer(order.customerNumber||order.orderNo||'',order.language);
  return true;
 }catch(error){
  console.error('상태 변경 실패',error);
  showAdminMessage(`상태 변경 실패 (${error.code||'unknown'}): ${error.message}`,true);
  return false;
 }finally{
  statusUpdateLocks.delete(id);
  if(button&&button.isConnected){button.disabled=false;button.textContent=originalText;button.removeAttribute('aria-busy')}
 }
}

document.getElementById('ordersPanel')?.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-action]');
 if(!button||!document.getElementById('ordersPanel').contains(button))return;
 event.preventDefault();
 event.stopPropagation();
 const action=button.dataset.action;
 if(action==='copy-phone'){
  try{await navigator.clipboard.writeText(button.dataset.phone||'');showAdminMessage('연락처가 복사되었습니다.');button.textContent='복사됨';setTimeout(()=>{if(button.isConnected)button.textContent='복사'},1200)}catch(error){showAdminMessage('연락처를 복사하지 못했습니다.',true)}
  return;
 }
 if(action==='call-customer'){
  callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage);
  return;
 }
 if(action==='set-status'){
  await setStatus(button.dataset.orderId,button.dataset.status,button);
  return;
 }
 if(action==='set-manual-status'){
  await setManualCustomerCallStatus(button.dataset.callId,button.dataset.status,button);
  return;
 }
 if(action==='clear-seat'){
  await clearSeat(button.dataset.seatId,button);
 }
});

const manualCustomerCallForm=document.getElementById('manualCustomerCallForm');
const manualCustomerNumber=document.getElementById('manualCustomerNumber');
manualCustomerNumber?.addEventListener('input',()=>{manualCustomerNumber.value=manualCustomerNumber.value.replace(/[^0-9]/g,'').slice(0,4)});
manualCustomerCallForm?.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-manual-status]');
 if(!button||button.type==='submit')return;
 const ok=await createManualCustomerCall(manualCustomerNumber.value,button.dataset.manualStatus,[...manualCustomerCallForm.querySelectorAll('button')]);
 if(ok)manualCustomerNumber.value='';
});
manualCustomerCallForm?.addEventListener('submit',async event=>{
 event.preventDefault();
 const ok=await createManualCustomerCall(manualCustomerNumber.value,'cooking',[...manualCustomerCallForm.querySelectorAll('button')]);
 if(ok)manualCustomerNumber.value='';
});

async function clearSeat(id,button){
 const lockId=`seat:${id}`;
 if(!id||statusUpdateLocks.has(lockId))return false;
 const seat=ADMIN_SEATS.find(item=>item.id===id),data=seatDocuments[id]||{};
 if(!seat||normalizedSeatStatus(data.status)==='empty')return false;
 if(!confirm('이 좌석을 빈자리로 변경할까요?'))return false;
 statusUpdateLocks.add(lockId);
 if(button){button.disabled=true;button.setAttribute('aria-busy','true')}
 try{
  await db.collection('seats').doc(id).set(seatReleasePayload(),{merge:true});
  showAdminMessage(`${seat.name}을 빈자리로 변경했습니다.`);
  return true;
 }catch(error){
  console.error('좌석 비우기 실패',error);
  showAdminMessage(`좌석 비우기 실패 (${error.code||'unknown'}): ${error.message}`,true);
  return false;
 }finally{
  statusUpdateLocks.delete(lockId);
  if(button&&button.isConnected){button.disabled=false;button.removeAttribute('aria-busy')}
 }
}

function ensureAudio(){
 audioContext=audioContext||new (window.AudioContext||window.webkitAudioContext)();
 if(!audioMaster){
  const compressor=audioContext.createDynamicsCompressor();
  compressor.threshold.value=-24;compressor.knee.value=18;compressor.ratio.value=5;compressor.attack.value=.003;compressor.release.value=.18;
  audioMaster=audioContext.createGain();audioMaster.gain.value=1.65;
  audioMaster.connect(compressor);compressor.connect(audioContext.destination);
 }
 return audioContext.resume();
}

async function unlockAdminAudio(){
 try{
  if(!soundEnabled)return;
  await ensureAudio();
  localStorage.setItem('pjAdminSoundEnabled','true');
  soundButton.textContent='🔔 알림음 켜짐';
 }catch(e){console.warn('관리자 알림음 잠금 해제 실패',e)}
}
document.addEventListener('pointerdown',unlockAdminAudio,{once:true,passive:true});
document.addEventListener('keydown',unlockAdminAudio,{once:true});
function tone(freq,start,duration,gain=.48,type='sine'){const now=audioContext.currentTime+start,osc=audioContext.createOscillator(),g=audioContext.createGain();osc.frequency.value=freq;osc.type=type;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(Math.max(.0001,gain*settings.volume),now+.012);g.gain.exponentialRampToValueAtTime(.0001,now+duration);osc.connect(g);g.connect(audioMaster||audioContext.destination);osc.start(now);osc.stop(now+duration+.04)}
async function playPreset(forcePreset){
 if(!soundEnabled)return;
 await ensureAudio();const preset=forcePreset||settings.preset;
 if(preset==='voice')return;
 if(preset==='custom'&&customAudioUrl){const a=new Audio(customAudioUrl);a.volume=settings.volume;a.play().catch(console.warn);return}
 if(preset==='pos'){[[1100,0,.11],[1100,.16,.11],[1250,.32,.15]].forEach(x=>tone(...x,.28,'square'));return}
 if(preset==='cafe'){[[523,0,.22],[659,.15,.25],[784,.32,.32]].forEach(x=>tone(...x,.19,'sine'));return}
 [[660,0,.22],[880,.22,.30],[1040,.48,.30]].forEach(x=>tone(...x,.36,'sine'));
}
let speechQueue=Promise.resolve();
function speakText(text){
 return new Promise(resolve=>{
  if(!soundEnabled||!settings.voice||!('speechSynthesis'in window)){resolve();return}
  const u=PJSpeech.createSpeechUtterance(text);
  u.onend=resolve;u.onerror=resolve;
  window.speechSynthesis.speak(u);
 });
}
function enqueueSpeech(text){speechQueue=speechQueue.then(()=>speakText(text)).catch(()=>{});return speechQueue}
function speak(text){return enqueueSpeech(text)}
function customerCallLanguage(language){
 const normalized=String(language||'').trim().toLowerCase().replace(/_/g,'-');
 if(['ko','ko-kr'].includes(normalized))return 'ko';
 if(['en','en-us'].includes(normalized))return 'en';
 if(['es','es-es'].includes(normalized))return 'es';
 if(['ja','ja-jp'].includes(normalized))return 'ja';
 if(['zh','zh-cn','zh-hans','zh-hans-cn'].includes(normalized))return 'zh';
 return 'ko'
}
function customerCallSpeech(orderNo,language){
 const normalized=customerCallLanguage(language);
 const number=spokenOrderNumber(orderNo);
 const speech={
  ko:{lang:'ko-KR',text:`${number}번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터로 와주시기 바랍니다.`},
  en:{lang:'en-US',text:`Customer number ${number}, your order is ready. Please come to the counter.`},
  es:{lang:'es-ES',text:`Cliente número ${number}, su pedido está listo. Por favor, acérquese al mostrador.`},
  ja:{lang:'ja-JP',text:`お客様番号${number}番、ご注文の商品ができあがりました。カウンターまでお越しください。`},
  zh:{lang:'zh-CN',text:`号码为${number}的顾客，您的餐品已经准备好了，请到柜台取餐。`}
 }[normalized];
 return {...speech,voicePrefix:normalized}
}
function speakCustomerCall(orderNo,language){
 return new Promise(resolve=>{
  if(!soundEnabled||!settings.voice||!('speechSynthesis'in window)){resolve();return}
  const speech=customerCallSpeech(orderNo,language);
  const utterance=PJSpeech.createSpeechUtterance(speech.text,{lang:speech.lang});
  utterance.onend=resolve;utterance.onerror=resolve;
  window.speechSynthesis.speak(utterance);
 });
}
function enqueueCustomerCall(orderNo,language){speechQueue=speechQueue.then(()=>speakCustomerCall(orderNo,language)).catch(()=>{});return speechQueue}

let announcementQueue=Promise.resolve();
function wait(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function playTripleDing(){
 if(!soundEnabled)return;
 await ensureAudio();
 [[1320,0,.16],[1480,.19,.16],[1660,.38,.22]].forEach(x=>{tone(...x,.52,'sine');tone(x[0]*1.006,x[1],x[2],.22,'triangle')});
 await wait(720);
}
function orderAnnouncementText(order){
 const pickupMode=order?.pickup?.mode;
 if(pickupMode&&pickupMode!=='now')return '예약 주문이 들어왔습니다.';
 return '새로운 주문이 접수되었습니다.';
}
function enqueueOrderAnnouncement(order){
 announcementQueue=announcementQueue.then(async()=>{
  if(!soundEnabled)return;
  await playTripleDing();
  await speakText(orderAnnouncementText(order));
 }).catch(e=>console.warn('주문 음성 안내 실패',e));
 return announcementQueue;
}

let newOrderRepeatTimer=null;
function hasUnacceptedOrders(){return orders.some(o=>['payment_pending','new'].includes(o.status))}
function unacceptedOrders(){return orders.filter(o=>['payment_pending','new'].includes(o.status))}
function stopNewOrderRepeat(){
 if(newOrderRepeatTimer)clearInterval(newOrderRepeatTimer);
 newOrderRepeatTimer=null;
}
function startNewOrderRepeat(){
 stopNewOrderRepeat();
 if(!soundEnabled||!hasUnacceptedOrders())return;
 newOrderRepeatTimer=setInterval(()=>{
   if(!soundEnabled||!hasUnacceptedOrders()){stopNewOrderRepeat();return}
   announcementQueue=announcementQueue.then(async()=>{await playTripleDing();await speakText('미접수 주문이 있습니다. 확인해 주세요.');}).catch(()=>{});
 },10000);
}

async function notifyNewOrders(added){
 if(!added.length)return;
 added.forEach(showToast);
 document.title=`🔴 미접수 주문(${unacceptedOrders().length}) · 관리자`;
 try{
  if(soundEnabled){
   await ensureAudio();
   added.forEach(order=>enqueueOrderAnnouncement(order));
   startNewOrderRepeat();
  }
 }catch(e){
  console.warn('새 주문 알림음 재생 실패',e);
  soundButton.classList.add('attention');soundButton.textContent='🔔 화면을 눌러 알림음 활성화';
 }
}
function showToast(order){document.getElementById('toastText').textContent=`${orderNumberLabel(order.customerNumber||order.orderNo)} · ${money(order.total)}`;const toast=document.getElementById('toast');toast.hidden=false;toast.classList.add('show');setTimeout(()=>{toast.classList.remove('show');toast.hidden=true},5000)}
function callCustomer(orderNo,language){playPreset('cafe');setTimeout(()=>enqueueCustomerCall(orderNo,language),420)}
window.callCustomer=callCustomer;window.setStatus=setStatus;

soundButton.textContent=soundEnabled?'🔔 알림음 켜짐':'🔕 알림음 꺼짐';
soundButton.addEventListener('click',async()=>{soundEnabled=!soundEnabled;localStorage.setItem('pjAdminSoundEnabled',String(soundEnabled));if(soundEnabled){await ensureAudio();soundButton.textContent='🔔 알림음 켜짐';await playPreset();setTimeout(()=>speak('알림음이 켜졌습니다.'),450);if(hasUnacceptedOrders())startNewOrderRepeat()}else{stopNewOrderRepeat();window.speechSynthesis?.cancel();soundButton.textContent='🔕 알림음 꺼짐'}});
soundSettingsButton.addEventListener('click',()=>{settingsModal.hidden=false});
document.getElementById('closeSoundSettings').addEventListener('click',()=>settingsModal.hidden=true);
settingsModal.addEventListener('click',e=>{if(e.target===settingsModal)settingsModal.hidden=true});
soundVolume.addEventListener('input',()=>volumeValue.textContent=soundVolume.value+'%');
customSoundFile.addEventListener('change',()=>{const f=customSoundFile.files?.[0];if(!f)return;if(customAudioUrl)URL.revokeObjectURL(customAudioUrl);customAudioUrl=URL.createObjectURL(f);customSoundName.textContent=f.name;soundPreset.value='custom'});
document.getElementById('previewSound').addEventListener('click',async()=>{settings={preset:soundPreset.value,volume:Number(soundVolume.value)/100,voice:voiceEnabled.checked};if(!soundEnabled){soundEnabled=true;soundButton.textContent='🔔 알림음 켜짐'}await playPreset();setTimeout(()=>enqueueSpeech('다이닝 주문이 들어왔습니다.'),settings.preset==='voice'?0:550)});
document.getElementById('saveSoundSettings').addEventListener('click',()=>{settings={preset:soundPreset.value,volume:Number(soundVolume.value)/100,voice:voiceEnabled.checked};localStorage.setItem('pjAdminSoundSettings',JSON.stringify(settings));settingsModal.hidden=true});
document.getElementById('filters').addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;activeFilter=b.dataset.filter;document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('active',x===b));render()});



const showOrdersTab=document.getElementById('showOrdersTab');
const showSeatsTab=document.getElementById('showSeatsTab');
const ordersPanel=document.getElementById('ordersPanel');
const seatsPanel=document.getElementById('seatsPanel');
function showAdminPanel(name){
 const orders=name==='orders';
 ordersPanel.hidden=!orders;
 seatsPanel.hidden=orders;
 showOrdersTab.classList.toggle('active',orders);
 showSeatsTab.classList.toggle('active',!orders);
}
showOrdersTab?.addEventListener('click',()=>showAdminPanel('orders'));
showSeatsTab?.addEventListener('click',()=>showAdminPanel('seats'));

let waitingEntries=[];
let waitingInitialLoad=true;
const waitingList=document.getElementById('waitingList');
const showWaitingTab=document.getElementById('showWaitingTab');
const waitingPanel=document.getElementById('waitingPanel');

function renderWaiting(){
 if(!waitingList)return;
 const active=waitingEntries.filter(w=>w.status==='waiting').sort((a,b)=>(a.createdAt?.seconds||0)-(b.createdAt?.seconds||0));
 if(!active.length){waitingList.innerHTML='<div class="empty">현재 대기 중인 고객이 없습니다.</div>';return}
 waitingList.innerHTML=active.map(w=>`<article class="waiting-admin-card">
   <div><strong>${w.seatName||'좌석'}</strong><span>대기 ${w.queueNo||'-'}번 · ${w.partySize||1}명 · ${w.phoneMasked||''}</span></div>
   <div class="waiting-admin-actions">
     <button onclick="callWaiting('${w.id}')">호출</button>
     <button onclick="completeWaiting('${w.id}')">입장</button>
     <button onclick="cancelWaiting('${w.id}')">취소</button>
   </div>
 </article>`).join('');
}
async function callWaiting(id){
 await db.collection('waitlist').doc(id).set({status:'called',calledAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
 await playPreset();setTimeout(()=>speak('대기 고객을 호출합니다.'),500);
}
async function completeWaiting(id){
 await db.collection('waitlist').doc(id).set({status:'seated',seatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}
async function cancelWaiting(id){
 await db.collection('waitlist').doc(id).set({status:'cancelled',cancelledAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
}

function showAdminPanel(name){
 const orders=name==='orders',seats=name==='seats',waiting=name==='waiting';
 ordersPanel.hidden=!orders;
 seatsPanel.hidden=!seats;
 waitingPanel.hidden=!waiting;
 showOrdersTab.classList.toggle('active',orders);
 showSeatsTab.classList.toggle('active',seats);
 showWaitingTab.classList.toggle('active',waiting);
}
showWaitingTab?.addEventListener('click',()=>showAdminPanel('waiting'));
document.getElementById('refreshWaiting')?.addEventListener('click',()=>renderWaiting());

// v40.17: 관리자 상태 흐름 결제대기 → 접수 → 조리중 → 완료

document.getElementById('channelFilters')?.addEventListener('click',e=>{const b=e.target.closest('button[data-channel]');if(!b)return;activeChannel=b.dataset.channel;document.querySelectorAll('#channelFilters button').forEach(x=>x.classList.toggle('active',x===b));render()});
window.PJAdminOrders=()=>orders;
