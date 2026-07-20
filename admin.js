const adminGate=document.getElementById('adminLoginGate');
const adminLoginForm=document.getElementById('adminLoginForm');
const adminEmail=document.getElementById('adminEmail');
const adminPassword=document.getElementById('adminPassword');
const adminLoginError=document.getElementById('adminLoginError');
async function verifyAdminUser(user){if(!user)return false;const token=await user.getIdTokenResult(true);return token.claims.admin===true}

let unsubscribeOrders=null;
let unsubscribeWaitlist=null;
let subscriptionsStarted=false;

function stopRealtimeSubscriptions(){
 if(unsubscribeOrders){unsubscribeOrders();unsubscribeOrders=null}
 if(unsubscribeWaitlist){unsubscribeWaitlist();unsubscribeWaitlist=null}
 subscriptionsStarted=false;
}

function startRealtimeSubscriptions(){
 if(subscriptionsStarted)return;
 subscriptionsStarted=true;
 initialLoad=true;
 waitingInitialLoad=true;

 unsubscribeOrders=db.collection('orders').limit(200).onSnapshot(snapshot=>{
 connectionBadge.textContent='실시간 연결';
 connectionBadge.className='connection live';
 const added=[];
 snapshot.docChanges().forEach(change=>{
   if(change.type==='added')added.push({id:change.doc.id,...change.doc.data()});
 });
 const toMillis=o=>{
   const v=o.createdAt||o.createdAtClient;
   if(v?.toMillis)return v.toMillis();
   if(v?.seconds)return v.seconds*1000;
   const ms=new Date(v||0).getTime();
   return Number.isNaN(ms)?0:ms;
 };
 const statusPriority={payment_pending:0,new:0,accepted:1,paid:1,cooking:2,ready:3,completed:3,cancelled:4};
 orders=snapshot.docs
   .map(doc=>({id:doc.id,...doc.data()}))
   .sort((a,b)=>(statusPriority[a.status]??9)-(statusPriority[b.status]??9)||toMillis(b)-toMillis(a))
   .slice(0,100);
 render();
 assignMissingOrderSequences(orders).catch(error=>console.error('영업일 순번 배정 실패',error));
 if(!initialLoad)notifyNewOrders(added.filter(o=>o.status==='payment_pending'));
 if(soundEnabled&&hasUnacceptedOrders())startNewOrderRepeat();
 else if(!hasUnacceptedOrders())stopNewOrderRepeat();
 initialLoad=false;
},error=>{
 console.error(error);
 connectionBadge.textContent='연결 오류';
 connectionBadge.className='connection error';
 orderList.innerHTML=`<div class="empty">Firestore 연결 오류: ${esc(error.message)}</div>`;
});

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
const formatTime=value=>{const d=value?.toDate?value.toDate():value?new Date(value):null;if(!d||Number.isNaN(d.getTime()))return '-';return new Intl.DateTimeFormat('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d)};
function seoulBusinessDayKey(value=new Date()){
 const date=value?.toDate?value.toDate():new Date(value);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 let businessDate=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),12));
 if(Number(parts.hour)<9)businessDate.setUTCDate(businessDate.getUTCDate()-1);
 return businessDate.toISOString().slice(0,10);
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
function productName(id,category,legacyMaster=[]){return ORDER_CATALOG[category]?.[id]||legacyMaster.find(x=>x.id===id)?.name||id}

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
function adminCrustDoughLabel(item){
 const dough=normalizedOption(item?.dough||item?.doughType);
 const crust=normalizedOption(item?.crust||item?.crustType);
 const labels=[];
 if(dough.includes('thin')||dough.includes('씬'))labels.push('TH');
 else if(dough.includes('croissant')||dough.includes('크루아상')||dough==='cro')labels.push('CRO');
 else if(dough&&!dough.includes('original')&&!dough.includes('오리지널'))labels.push(item.dough||item.doughType);
 if(crust.includes('cheeseroll')||crust.includes('치즈롤')||crust==='ch')labels.push('치즈롤');
 else if(crust.includes('goldring')||crust.includes('골드링')||crust==='g')labels.push('골드링');
 else if(crust&&!crust.includes('original')&&!crust.includes('오리지널')&&!labels.length)labels.push(item.crust||item.crustType);
 if(!labels.length)labels.push('오리지널');
 return labels.join(' ');
}
function adminCustomerSizeLabel(item){const raw=String(item?.size||'').toUpperCase();return raw==='F'?'패밀리사이즈':raw==='L'?'라지사이즈':raw==='R'?'레귤러사이즈':adminSizeLabel(item)}
function adminCustomerDoughLabel(item){const raw=String(item?.dough||item?.doughType||'오리지널');if(raw.includes('씬')||raw.toLowerCase().includes('thin'))return '씬도우';if(raw.includes('크루아상')||raw.toLowerCase().includes('cro'))return '크루아상';return '오리지널'}
function adminCustomerCrustLabel(item){const raw=String(item?.crust||item?.crustType||'오리지널');if(raw.includes('골드링')||raw.toLowerCase().includes('gold'))return '골드링';if(raw.includes('치즈롤')||raw.toLowerCase().includes('cheese'))return '치즈롤';if(raw.includes('씬')||raw.toLowerCase().includes('thin'))return '씬도우';if(raw.includes('크루아상')||raw.toLowerCase().includes('cro'))return '크루아상';return '오리지널'}
function adminPizzaName(item){
 const leftId=item?.pizzaLeft||item?.pizza;
 const rightId=item?.pizzaRight;
 if(!leftId)return '추가 상품';
 const left=productName(leftId,'pizzas',PIZZAS);
 return (item?.pizzaMode||item?.mode)==='half'&&rightId?`${left} / ${productName(rightId,'pizzas',PIZZAS)}`:left;
}
function adminPizzaLine(item){return [adminCustomerSizeLabel(item),adminCustomerDoughLabel(item),adminCustomerCrustLabel(item),adminPizzaName(item)].filter(Boolean).join(' · ')}
function selectedNames(map,category,legacyMaster=[]){return Object.entries(map||{}).filter(([,q])=>Number(q)>0).map(([id,q])=>`${productName(id,category,legacyMaster)} ×${Number(q)}`).join(', ')}
function selectedDrinks(map){return Object.entries(map||{}).filter(([,q])=>Number(q)>0).map(([id,q])=>`${productName(id,ORDER_CATALOG.sauces?.[id]?'sauces':'drinks',DRINKS)} ×${Number(q)}`).join(', ')}
function itemHTML(item){
 const benefit=item.set?`${Number(item.set)||0}인 세트`:item.promo==='upup'?'UP & UP':item.promo==='takeout'?'포장 20%':'일반주문';
 const top=selectedNames(item.toppings,'toppings',TOPPINGS),includedSides=selectedNames(item.includedSides,'sides',SIDES),includedDrinks=selectedDrinks(item.includedDrinks),extraSides=selectedNames(item.sides,'sides',SIDES),extraDrinks=selectedDrinks(item.drinks);
 const half=(item.pizzaMode||item.mode)==='half',discount=Number(item.discountAmount||0),additional=[extraSides&&`사이드 ${extraSides}`,extraDrinks&&`음료·소스 ${extraDrinks}`].filter(Boolean).join(' / ');
 const rows=[['피자',`${adminPizzaName(item)} ×${Number(item.qty)||1}${half?' (Half & Half)':''}`],['사이즈',adminCustomerSizeLabel(item)||'-'],['도우',adminCustomerDoughLabel(item)],['크러스트',adminCustomerCrustLabel(item)],['토핑',top||'없음'],['사이드',includedSides||'없음'],['음료',includedDrinks||'없음'],['추가상품',additional||'없음'],['할인내역',discount?`${item.discountLabel||benefit} −${money(discount)}`:'없음'],['상품금액',money(item.total||0)]];
 return `<div class="order-item"><strong>${esc(benefit)}</strong><div class="adminItemSections">${rows.map(([label,value])=>`<div class="adminItemLine ${label==='할인내역'&&discount?'discount':''}"><b>${label}</b><span>${esc(value)}</span></div>`).join('')}</div></div>`;
}
function orderBenefitLabel(order){return [...new Set((order.items||[]).map(item=>item.set?`${Number(item.set)||0}인 세트`:item.promo==='upup'?'UP & UP':item.promo==='takeout'?'포장 20%':item.promo==='happy'?'해피아워':'일반주문'))].join(' + ')||'-'}
function orderDetailsHTML(order){
 const lines=[['순번',order.sequence||order.dailySequence||'배정 중'],['주문번호',order.customerNumber||order.orderNo||'-'],['주문시간',formatTime(order.createdAt||order.createdAtClient)],['주문채널',PJCommon.legacyChannel(order)==='mobile'?'모바일':'PC'],['이용방법',order.orderType==='takeout'?'포장':'먹고가기'],['예약',order.pickup?.time||'바로 주문'],['인원',order.partySize?order.partySize+'명':'-'],['구역',order.seat?orderZoneLabel(order):'-'],['좌석',orderSeatLabel(order)||'-'],['연락처',order.phoneMasked||'-'],['적용혜택',orderBenefitLabel(order)],['결제수단',order.payment?.methodName||'-'],['분할결제',order.payment?.splitCount>1?order.payment.splitCount+'명 · '+(order.payment.splitAmounts||[]).map(money).join(' / '):'-'],['상품정상금액',money(order.normalAmount||order.total)],['할인금액',order.discountAmount?'−'+money(order.discountAmount):money(0)],['결제금액',money(order.total)]];
 return `<div class="order-detail" id="detail-${order.id}" hidden><div class="detail-grid">${lines.map(([k,v])=>`<div><b>${k}</b><span>${v}</span></div>`).join('')}</div><h4>전체 주문 구성</h4><div class="detail-items">${(order.items||[]).map(itemHTML).join('')||'<p>저장된 상품 상세가 없습니다.</p>'}</div></div>`
}
function toggleOrderDetail(id,button){const box=document.getElementById('detail-'+id);if(!box)return;box.hidden=!box.hidden;button.textContent=box.hidden?'상세보기':'상세접기'}
window.toggleOrderDetail=toggleOrderDetail;
function filterOrders(order){const channel=PJCommon.legacyChannel(order);if(activeChannel!=='all'&&channel!==activeChannel)return false;if(activeFilter==='all')return true;if(activeFilter==='payment_pending')return ['payment_pending','new'].includes(order.status);if(activeFilter==='accepted')return ['accepted','paid'].includes(order.status);if(activeFilter==='completed')return ['completed','ready'].includes(order.status);return order.status===activeFilter}
function render(){
 const filtered=orders.filter(filterOrders);
 orderList.innerHTML=filtered.length?filtered.map(order=>`<article class="order-card ${order.status}"><div class="order-head"><span class="channel-badge ${PJCommon.legacyChannel(order)}">${PJCommon.legacyChannel(order)==="mobile"?"모바일":"PC"}</span><div><div class="order-no">#${esc(order.customerNumber||order.orderNo||order.phoneMasked||'-')}</div><small>${formatTime(order.createdAt||order.createdAtClient)}</small></div><span class="status-badge ${order.status}">${esc(statusNames[order.status]||order.status)}</span></div><div class="order-meta"><span>${order.orderType==='takeout'?'🥡 포장':'🍽️ 먹고가기'}</span>${order.partySize?`<span>👥 ${Number(order.partySize)||0}명</span>`:''}${orderSeatLabel(order)?`<span>🪑 ${esc(orderSeatLabel(order))}${order.seat?.groupSize?` · ${order.seat.groupSize}명`:''}</span>`:''}${order.pickup?.time?`<span>🕒 오늘 ${order.pickup.time}${order.pickup.isHappyHour?' · 해피아워':''}</span>`:''}${order.phoneMasked?`<span>☎️ ${esc(order.phoneMasked)}</span>`:''}${order.payment?.methodName?`<span>💳 ${esc(order.payment.methodName)}${order.payment.splitCount>1?` · ${order.payment.splitCount}명 분할`:''}</span>`:''}<span>상품 ${order.itemCount||0}개</span></div><div class="order-items">${(order.items||[]).map(itemHTML).join('')}</div><button type="button" class="detail-toggle" data-action="toggle-detail" data-order-id="${esc(order.id)}">상세보기</button>${orderDetailsHTML(order)}<div class="order-foot"><div class="order-total"><span>결제금액</span><strong>${money(order.total)}</strong></div><div class="actions">${['payment_pending','new'].includes(order.status)?`<button type="button" class="accept" data-action="set-status" data-order-id="${esc(order.id)}" data-status="accepted">접수</button>`:''}${['accepted','paid'].includes(order.status)?`<button type="button" class="cook" data-action="set-status" data-order-id="${esc(order.id)}" data-status="cooking">조리 시작</button>`:''}${order.status==='cooking'?`<button type="button" class="ready" data-action="set-status" data-order-id="${esc(order.id)}" data-status="completed">완료</button>`:''}${['ready','completed'].includes(order.status)?`<button type="button" class="call" data-action="call-customer" data-order-no="${esc(order.customerNumber||order.orderNo||'')}">📢 고객 호출</button>`:''}${!['cancelled','completed'].includes(order.status)?`<button type="button" class="cancel" data-action="set-status" data-order-id="${esc(order.id)}" data-status="cancelled">취소</button>`:''}</div></div></article>`).join(''):'<div class="empty">해당 상태의 주문이 없습니다.</div>';
 const count=s=>orders.filter(o=>s.includes(o.status)).length;
 document.getElementById('newCount').textContent=count(['payment_pending','new']);document.getElementById('cookingCount').textContent=count(['paid','accepted','cooking']);document.getElementById('doneCount').textContent=count(['ready','completed']);
 const pendingCount=count(['payment_pending','new']);document.title=pendingCount?`🔴 미접수 주문(${pendingCount}) · 관리자`:'파파존스 주문 관리자';
 const today=new Date();today.setHours(0,0,0,0);const sales=orders.filter(o=>{const d=o.createdAt?.toDate?o.createdAt.toDate():new Date(o.createdAtClient||0);return d>=today&&o.status!=='cancelled'}).reduce((s,o)=>s+Number(o.total||0),0);document.getElementById('todaySales').textContent=money(sales);
}
const statusUpdateLocks=new Set();
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
  if(status==='accepted')stopNewOrderRepeat();
  await db.collection('orders').doc(id).update({status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  showAdminMessage(status==='accepted'?'주문이 접수되었습니다.':status==='cooking'?'조리를 시작했습니다.':status==='completed'?'주문을 완료했습니다.':'주문 상태가 변경되었습니다.');
  if(!['payment_pending','new'].includes(status))setTimeout(()=>{if(hasUnacceptedOrders())startNewOrderRepeat();else stopNewOrderRepeat()},300);
  const seatIds=orderSeatIds(order);
  if(seatIds.length&&['completed','cancelled'].includes(status)){
   const seatStatus=status==='completed'?'cleaning':'empty';
   const batch=db.batch();
   seatIds.forEach(seatId=>batch.set(db.collection('seats').doc(seatId),{
    status:seatStatus,
    orderId:null,orderNo:null,partySize:null,groupId:null,
    occupiedAt:null,heldAt:null,heldUntil:null,
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
   },{merge:true}));
   await batch.commit();
  }
  if(status==='completed'&&order){playPreset('cafe');enqueueSpeech(`${order.customerNumber||order.orderNo} 고객님 주문 조리가 완료되었습니다.`)}
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

orderList?.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-action]');
 if(!button||!orderList.contains(button))return;
 event.preventDefault();
 event.stopPropagation();
 const action=button.dataset.action;
 if(action==='toggle-detail'){
  toggleOrderDetail(button.dataset.orderId,button);
  return;
 }
 if(action==='call-customer'){
  callCustomer(button.dataset.orderNo||'');
  return;
 }
 if(action==='set-status'){
  await setStatus(button.dataset.orderId,button.dataset.status,button);
 }
});

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
function chooseKoreanVoice(){
 const voices=window.speechSynthesis?.getVoices?.()||[];
 const korean=voices.filter(v=>/^ko(-|_)?KR/i.test(v.lang)||/^ko/i.test(v.lang));
 return korean.find(v=>/female|여성|yuna|sora|sunhi|google 한국어/i.test(`${v.name} ${v.voiceURI}`))||korean[0]||null;
}
function speakText(text){
 return new Promise(resolve=>{
  if(!soundEnabled||!settings.voice||!('speechSynthesis'in window)){resolve();return}
  const u=new SpeechSynthesisUtterance(text);
  u.lang='ko-KR';u.rate=1.08;u.pitch=1.48;u.volume=1;
  const voice=chooseKoreanVoice();if(voice)u.voice=voice;
  u.onend=resolve;u.onerror=resolve;
  window.speechSynthesis.speak(u);
 });
}
function enqueueSpeech(text){speechQueue=speechQueue.then(()=>speakText(text)).catch(()=>{});return speechQueue}
function speak(text){return enqueueSpeech(text)}

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
function showToast(order){document.getElementById('toastText').textContent=`#${order.orderNo} · ${money(order.total)}`;const toast=document.getElementById('toast');toast.hidden=false;toast.classList.add('show');setTimeout(()=>{toast.classList.remove('show');toast.hidden=true},5000)}
function callCustomer(orderNo){playPreset('cafe');setTimeout(()=>speak(`${orderNo}번 고객님, 주문이 준비되었습니다.`),420)}
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
