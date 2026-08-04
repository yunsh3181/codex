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
let adminAuthenticated=false;
let initialOrdersLoaded=false;
let requestedSeatEntryHandled=false;
let publicDisplayBusinessDayBackfill=null;

function hasValidBusinessDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const [year,month,day]=value.split('-').map(Number);
 const date=new Date(Date.UTC(year,month-1,day));
 return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
}

function requestedAdminSeatId(){
 if(typeof URLSearchParams!=='function'||typeof location==='undefined')return '';
 return String(new URLSearchParams(location.search||'').get('seatId')||'');
}
function clearRequestedAdminSeatId(){
 if(typeof URL!=='function'||typeof history==='undefined'||typeof location==='undefined')return;
 const url=new URL(location.href);
 url.searchParams.delete('seatId');
 history.replaceState(history.state,'',`${url.pathname}${url.search}${url.hash}`);
}
function openRequestedSeatOrder(){
 if(requestedSeatEntryHandled||!adminAuthenticated||!initialOrdersLoaded)return false;
 const seatId=requestedAdminSeatId();
 if(!seatId||!ADMIN_SEATS.some(seat=>seat.id===seatId))return false;
 requestedSeatEntryHandled=true;
 clearRequestedAdminSeatId();
 return openSeatOrderDetail(seatId);
}

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

function backfillPublicDisplayBusinessDays(list){
 if(publicDisplayBusinessDayBackfill)return publicDisplayBusinessDayBackfill;
 publicDisplayBusinessDayBackfill=(async()=>{
  const snapshot=await db.collection('publicOrderDisplays').get();
  const ordersById=new Map((list||[]).map(order=>[String(order.id),order]));
  const candidates=new Map();
  snapshot.docs.forEach(doc=>{
   const savedBusinessDay=doc.data().businessDay;
   if(hasValidBusinessDay(savedBusinessDay)||savedBusinessDay!=null&&savedBusinessDay!=='')return;
   const businessDay=orderBusinessDayKey(ordersById.get(doc.id));
   if(!hasValidBusinessDay(businessDay))return;
   candidates.set(doc.id,{ref:doc.ref,businessDay});
  });
  const results=await Promise.allSettled(Array.from(candidates.values(),({ref,businessDay})=>db.runTransaction(async transaction=>{
   const current=await transaction.get(ref);
   if(!current.exists)return;
   const savedBusinessDay=current.data().businessDay;
   if(hasValidBusinessDay(savedBusinessDay)||savedBusinessDay!=null&&savedBusinessDay!=='')return;
   transaction.update(ref,{businessDay,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  })));
  if(results.some(result=>result.status==='rejected'))console.warn('일부 고객 TV 영업일 보정 건을 건너뛰었습니다.');
 })().catch(error=>console.error('고객 TV 영업일 보정 실패',error)).finally(()=>{publicDisplayBusinessDayBackfill=null});
 return publicDisplayBusinessDayBackfill;
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
 initialOrdersLoaded=false;
 waitingInitialLoad=true;

 unsubscribeOrders=db.collection('orders').onSnapshot(snapshot=>{
 connectionBadge.textContent='실시간 연결';
 connectionBadge.className='connection live';
 const added=[];
 snapshot.docChanges().forEach(change=>{
   if(change.type==='added')added.push({id:change.doc.id,...change.doc.data()});
 });
 receivedOrders=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));
 backfillPublicDisplayBusinessDays(receivedOrders);
 const now=new Date();
 refreshVisibleOrders(now);
 if(!initialLoad)notifyNewOrders(added.filter(o=>['payment_pending','new'].includes(o.status)&&isCurrentBusinessDayOrder(o,now)));
 if(soundEnabled&&hasUnacceptedOrders())startNewOrderRepeat();
 else if(!hasUnacceptedOrders())stopNewOrderRepeat();
 initialLoad=false;
 initialOrdersLoaded=true;
 openRequestedSeatOrder();
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
   adminAuthenticated=true;
   setAuthenticatedTestModeUI(true);
   startAdminTestModeRemote(user);
   startRealtimeSubscriptions();
  }else{
   adminAuthenticated=false;
   setAuthenticatedTestModeUI(false);
   stopAdminTestModeRemote();
   stopRealtimeSubscriptions();
   if(user){
    adminLoginError.textContent='관리자 권한이 없는 계정입니다.';
    await firebase.auth().signOut();
   }
  }
 }catch(error){
  adminAuthenticated=false;
  stopRealtimeSubscriptions();
  adminLoginError.textContent='관리자 권한 확인 실패: '+error.message;
 }
});
adminLoginForm?.addEventListener('submit',async e=>{e.preventDefault();adminLoginError.textContent='';try{const result=await firebase.auth().signInWithEmailAndPassword(adminEmail.value.trim(),adminPassword.value);if(!await verifyAdminUser(result.user))throw new Error('관리자 권한이 없습니다.')}catch(error){adminLoginError.textContent=error.message}});
const soundButton=document.getElementById('soundButton');
const soundSettingsButton=document.getElementById('soundSettingsButton');
const connectionBadge=document.getElementById('connectionBadge');
const testModeButton=document.getElementById('testModeButton');
const testModeConnection=document.getElementById('testModeConnection');
const retryTestMode=document.getElementById('retryTestMode');
const testModeModal=document.getElementById('testModeModal');
const testModeModalTitle=document.getElementById('testModeModalTitle');
const testModeModalDescription=document.getElementById('testModeModalDescription');
const testModeDiagnostics=document.getElementById('testModeDiagnostics');
const cancelTestMode=document.getElementById('cancelTestMode');
const confirmTestMode=document.getElementById('confirmTestMode');
const takeoutPending=document.getElementById('takeoutPending');
const takeoutProcessing=document.getElementById('takeoutProcessing');
const seatOverviewGrid=document.getElementById('seatOverviewGrid');
const orderDetailModal=document.getElementById('orderDetailModal');
const orderDetailContent=document.getElementById('orderDetailContent');
const closeOrderDetailButton=document.getElementById('closeOrderDetail');
const settingsModal=document.getElementById('soundSettingsModal');
const soundPreset=document.getElementById('soundPreset');

let adminTestModeAuthenticated=false;
let adminTestModeConnected=false;
let adminTestModePhase='waiting';
let adminTestModeErrorCode=null;
let adminTestModeRemote=null;
function testModeMinutes(state){
 return Math.max(1,Math.ceil((state.expiresAt-Date.now())/60000))
}
function renderAdminTestMode(state=adminTestModeController.getState()){
 if(!testModeButton)return;
 testModeButton.hidden=!adminTestModeAuthenticated;
 testModeConnection.hidden=!adminTestModeAuthenticated;
 testModeButton.classList.toggle('enabled',state.enabled);
 testModeButton.textContent=state.enabled?`⚠️ 테스트 모드 켜짐 · ${testModeMinutes(state)}분 남음`:'테스트 모드 꺼짐';
 testModeButton.setAttribute('aria-pressed',String(state.enabled));
 const phaseLabels={connected:'키오스크 연결됨 · mobile-01','requesting-enable':'테스트 모드 활성화 요청 중 · mobile-01','enabled-confirmed':'테스트 모드 적용됨 · mobile-01','requesting-disable':'테스트 모드 종료 요청 중 · mobile-01','disabled-confirmed':'테스트 모드 종료 확인 · mobile-01',waiting:'키오스크 연결 대기 · 실시간 세션 없음 · mobile-01','no-response':'ACK 대기 시간 초과 · mobile-01',rejected:'키오스크 적용 거부 · mobile-01',error:adminTestModeErrorCode==='permission-denied'?'Firestore 권한 거부 · mobile-01':'command 전송 또는 조회 실패 · mobile-01'};
 testModeConnection.textContent=phaseLabels[adminTestModePhase]||phaseLabels.waiting;
 const confirmed=['connected','enabled-confirmed','disabled-confirmed'].includes(adminTestModePhase);
 testModeConnection.className=`test-mode-connection ${confirmed?'connected':'waiting'}`;
 retryTestMode.hidden=!adminTestModeAuthenticated||adminTestModePhase!=='no-response';
}
function setAuthenticatedTestModeUI(authenticated){
 adminTestModeAuthenticated=authenticated;
 if(!authenticated&&adminTestModeController?.isEnabled())adminTestModeController.disable('admin-sign-out');
 renderAdminTestMode();
}
function handleAdminRemoteStatus(status){
 adminTestModePhase=status.phase;
 adminTestModeErrorCode=status.error?.code||status.diagnostics?.errorCode||null;
 adminTestModeConnected=['connected','requesting-enable','enabled-confirmed','requesting-disable','disabled-confirmed'].includes(status.phase);
 renderAdminTestMode();
 renderTestModeDiagnostics(status.diagnostics);
}
function renderTestModeDiagnostics(diagnostics=adminTestModeRemote?.getStatus?.().diagnostics){
 if(!testModeDiagnostics)return;
 const value=diagnostics||{};
 testModeDiagnostics.textContent=[
  `storeId: ${displayText(value.storeId)}`,
  `kioskId: ${displayText(value.kioskId)}`,
  `Firebase projectId: ${displayText(typeof firebase.app==='function'?firebase.app().options.projectId:firebaseConfig.projectId)}`,
  `presence 경로: ${displayText(value.path)}`,
  `활성 세션 수: ${value.activeSessionCount??0}`,
  `선택 sessionId: ${displayText(value.selectedSessionId)}`,
  `마지막 heartbeat: ${value.heartbeatAt?new Date(value.heartbeatAt).toISOString():'-'}`,
  `stale: ${value.stale===true?'예':value.stale===false?'아니오':'-'}`,
  `제외 사유: ${(value.exclusionReasons||[]).join(', ')||'없음'}`,
  `마지막 commandId: ${displayText(value.lastCommandId)}`,
  `ACK 상태: ${displayText(value.ackStatus)}`,
  `실패 operation: ${displayText(value.failedOperation)}`,
  `Firestore error code: ${displayText(value.errorCode)}`
 ].join('\n')
}
function startAdminTestModeRemote(user){
 stopAdminTestModeRemote();
 adminTestModeRemote=window.PJ_TEST_MODE_REMOTE.createAdminChannel({
  db,firebase,user,controller:adminTestModeController,
  storeId:'pangyo2-techno-valley',kioskId:'mobile-01',
  onStatus:handleAdminRemoteStatus
 });
 adminTestModeRemote.start();
}
function stopAdminTestModeRemote(){
 adminTestModeRemote?.stop();
 adminTestModeRemote=null;
 adminTestModeConnected=false;
 adminTestModePhase='waiting';
 adminTestModeErrorCode=null;
}
function disposeAdminTestModeSession(){
 adminTestModeRemote?.stop();
 adminTestModeRemote=null;
 adminTestModeController?.dispose();
}
function openTestModeConfirmation(){
 const enabled=adminTestModeController.isEnabled();
 testModeModalTitle.textContent=enabled?'테스트 모드를 종료하시겠습니까?':'영업시간 외 테스트 모드를 켜시겠습니까?';
 testModeModalDescription.textContent=enabled
  ?'현재 테스트 중인 Cart가 초기화되고, 영업 종료 시간이면 키오스크가 영업 종료 화면으로 돌아갑니다.'
  :'테스트 모드에서는 포장 및 다이닝 주문 화면을 확인할 수 있습니다. 실제 결제, 주문 저장 및 프린터 출력은 진행되지 않습니다. 테스트가 끝나면 반드시 테스트 모드를 꺼주세요. 테스트 모드는 30분 후 자동 종료됩니다.';
 confirmTestMode.textContent=enabled?'테스트 모드 종료':'테스트 모드 켜기';
 confirmTestMode.dataset.action=enabled?'disable':'enable';
 testModeModal.hidden=false;
 renderTestModeDiagnostics();
}
const adminTestModeController=window.PJ_AFTER_HOURS_TEST_MODE.createController({
 role:'admin',
 acceptRemoteMessages:false,
 onChange:state=>{if(!state.enabled&&adminTestModePhase==='enabled-confirmed')adminTestModePhase='disabled-confirmed';renderAdminTestMode(state)},
 onConnection:status=>{adminTestModeConnected=status.connected;renderAdminTestMode()}
});
adminTestModeController.start();
testModeButton?.addEventListener('click',()=>{if(adminTestModeAuthenticated)openTestModeConfirmation()});
cancelTestMode?.addEventListener('click',()=>{testModeModal.hidden=true});
confirmTestMode?.addEventListener('click',async()=>{
 if(!adminTestModeAuthenticated)return;
 confirmTestMode.disabled=true;
 try{
  if(confirmTestMode.dataset.action==='enable'){
   console.info('[remote-test-mode][admin-ui] enable-click',{
    kioskId:'mobile-01',
    sessionId:adminTestModeRemote?.getStatus?.().targetSessionId||null,
    remoteStatus:adminTestModeRemote?.getStatus?.()||null
   });
   await adminTestModeRemote.requestEnable();
  }
  else await adminTestModeRemote.requestDisable();
  testModeModal.hidden=true;
 }catch(error){showAdminMessage(error.message||'테스트 모드 요청에 실패했습니다.',true)}
 finally{confirmTestMode.disabled=false}
});
retryTestMode?.addEventListener('click',async()=>{retryTestMode.disabled=true;try{await adminTestModeRemote?.retry()}catch(error){showAdminMessage(error.message,true)}finally{retryTestMode.disabled=false}});
testModeModal?.addEventListener('click',event=>{if(event.target===testModeModal)testModeModal.hidden=true});
window.addEventListener('pagehide',disposeAdminTestModeSession,{once:true});
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
 {id:'papa-2',name:'커플석',zone:'papa',row:1,column:1},
 {id:'papa-bar4',name:'바테이블',zone:'papa',row:1,column:2},
 {id:'outdoor-1',name:'야외석1',zone:'outdoor',row:2,column:1},
 {id:'outdoor-2',name:'야외석2',zone:'outdoor',row:2,column:2},
 {id:'outdoor-3',name:'야외석3',zone:'outdoor',row:2,column:3},
 {id:'outdoor-4',name:'야외석4',zone:'outdoor',row:3,column:1},
 {id:'annex-1',name:'별관1',zone:'annex',row:4,column:1},
 {id:'annex-2',name:'별관2',zone:'annex',row:4,column:2},
 {id:'annex-3',name:'별관3',zone:'annex',row:4,column:3},
 {id:'annex-4',name:'별관4',zone:'annex',row:5,column:1},
 {id:'room-1',name:'룸1',zone:'room',row:6,column:1},
 {id:'room-2',name:'룸2',zone:'room',row:6,column:2},
 {id:'room-3',name:'룸3',zone:'room',row:6,column:3}
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
const KOREAN_DIGIT_SPEECH=Object.freeze(['영','일','이','삼','사','오','육','칠','팔','구']);
function spokenKoreanOrderNumber(value){
 if(value==null||value==='')return '';
 const raw=String(value).trim().replace(/^[PD](?=\s*[\d,\s]+$)/i,'').replace(/[,\s]/g,'');
 if(!/^\d+$/.test(raw))return '';
 const number=Number(raw);
 if(!Number.isInteger(number)||number<0||number>9999)return '';
 if(number===0)return KOREAN_DIGIT_SPEECH[0];
 const units=['천','백','십',''];
 return String(number).padStart(4,'0').split('').map((digit,index)=>{
  const amount=Number(digit);if(!amount)return '';
  return `${amount===1&&index<3?'':KOREAN_DIGIT_SPEECH[amount]}${units[index]}`
 }).join('')
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
function categorizedDrinkEntries(map){
 const entries={drinks:[],sauces:[]};
 Object.entries(map||{}).filter(([,q])=>Number(q)>0).forEach(([id,q])=>{
  const category=ORDER_CATALOG.sauces?.[id]?'sauces':'drinks';
  entries[category].push({name:productName(id,category,DRINKS),quantity:Number(q)||1});
 });
 return entries;
}
function itemListHTML(entries){return `<div class="admin-detail-list">${entries.map(entry=>`<div class="admin-product-row"><span class="admin-item-name">${esc(entry.name)}</span>${quantityHTML(entry.quantity)}</div>`).join('')}</div>`}
function itemHTML(item){
 const benefit=item.set?`${Number(item.set)||0}인 세트`:item.promo==='upup'?'UP & UP':item.promo==='takeout'?'포장 20%':'일반주문';
 const toppings=selectionEntries(item.toppings,'toppings',TOPPINGS);
 const optionParts=[
  adminSizeLabel(item)?`사이즈 ${adminSizeLabel(item)}`:'',
  item.dough||item.doughType?`도우 ${item.dough||item.doughType}`:'',
  item.crust||item.crustType?`크러스트 ${item.crust||item.crustType}`:'',
  (item.pizzaMode||item.mode)==='half'?'하프앤하프':''
 ].filter(Boolean);
 return `<div class="order-item admin-pizza-item"><div class="admin-product-row admin-pizza-row"><strong class="admin-pizza-heading">${renderPizzaDisplayCode(formatPizzaDisplayCode(item))}<span class="admin-pizza-name">${esc(adminPizzaName(item))}</span></strong>${quantityHTML(item.qty)}</div>${optionParts.length?`<div class="admin-option-summary">${optionParts.map(part=>`<span>${esc(part)}</span>`).join('')}</div>`:''}${toppings.length?`<div class="admin-toppings"><b>토핑</b>${itemListHTML(toppings)}</div>`:''}<small>${esc(benefit)} · ${money(item.total||0)}</small></div>`;
}
function orderBenefitLabel(order){return [...new Set((order.items||[]).map(item=>item.set?`${Number(item.set)||0}인 세트`:item.promo==='upup'?'UP & UP':item.promo==='takeout'?'포장 20%':item.promo==='happy'?'해피아워':'일반주문'))].join(' + ')||'-'}
function safeAmounts(order){
 const candidates=[order?.originalAmount,order?.normalAmount,order?.subtotal,order?.totalAmount,order?.total];
 const original=Math.max(0,Number(candidates.find(value=>Number.isFinite(Number(value))))||0);
 const paidCandidates=[order?.finalAmount,order?.totalAmount,order?.total,order?.amount,original];
 const paid=Math.max(0,Number(paidCandidates.find(value=>Number.isFinite(Number(value))))||0);
 const discount=Math.max(0,original-paid);
 return {original,discount,paid};
}
function paymentMethodIsMealTicket(payment){
 return [payment?.method,payment?.methodName].some(value=>String(value||'').trim().toLowerCase().replace(/[\s_-]+/g,'')==='mealticket'||String(value||'').includes('식권대장'));
}
function mealTicketPaymentSource(order,paid){
 const payment=order?.payment||{};
 const methods=Array.isArray(payment.methods)?payment.methods:[];
 if(methods.length>1){
  const tickets=methods.filter(value=>value&&typeof value==='object'&&paymentMethodIsMealTicket(value));
  if(tickets.length!==1)return null;
  const ticket=tickets[0];
  const explicit=[ticket.total,ticket.amount,ticket.paidAmount,ticket.totalAmount].find(value=>value!==null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0);
  const stored=Array.isArray(ticket.splitAmounts)?ticket.splitAmounts.map(Number):[];
  if(stored.some(value=>!Number.isFinite(value)||value<0))return null;
  const storedTotal=stored.length>1?stored.reduce((sum,value)=>sum+value,0):null;
  if(explicit===undefined&&storedTotal===null)return null;
  if(explicit!==undefined&&storedTotal!==null&&Number(explicit)!==storedTotal)return null;
  return {payment:ticket,paid:explicit===undefined?storedTotal:Number(explicit)};
 }
 return paymentMethodIsMealTicket(payment)?{payment,paid}:null;
}
function splitPaymentSummary(order,paid=safeAmounts(order).paid){
 const source=mealTicketPaymentSource(order,paid);
 if(!source)return null;
 const {payment}=source;
 paid=source.paid;
 const stored=Array.isArray(payment.splitAmounts)?payment.splitAmounts.map(Number).filter(value=>Number.isFinite(value)&&value>=0):[];
 const requested=Number(payment.splitCount);
 const count=Number.isInteger(requested)&&requested>1?requested:stored.length>1?stored.length:0;
 if(count<2)return null;
 const amounts=stored.length===count?stored:Number.isFinite(paid)&&paid>=0&&paid%count===0?Array(count).fill(paid/count):[];
 if(amounts.length!==count)return null;
 const groups=[];
 amounts.forEach(amount=>{const found=groups.find(group=>group.amount===amount);if(found)found.count++;else groups.push({amount,count:1})});
 return {count,amounts,groups,total:amounts.reduce((sum,value)=>sum+value,0),matchesPaid:amounts.reduce((sum,value)=>sum+value,0)===paid};
}
function splitPaymentDetail(order,paid=safeAmounts(order).paid){
 const split=splitPaymentSummary(order,paid);
 if(!split)return '';
 const parts=split.groups.length===1?`${money(split.groups[0].amount)} × ${split.count}인`:split.amounts.map(money).join(' + ');
 return `${money(split.total)} · ${parts}`;
}
function mealTicketHighlightHTML(order,paid=safeAmounts(order).paid){
 const split=splitPaymentSummary(order,paid);
 if(!split)return '';
 const detail=split.groups.length===1?`${money(split.groups[0].amount)} × ${split.count}인`:split.amounts.map(money).join(' + ');
 return `<div class="meal-ticket-highlight"><strong>식권대장 ${money(split.total)}</strong><span>${esc(detail)}</span></div>`
}
function storedPizzaBenefitLabel(promo,set,orderType){
 if(promo==='upup')return 'UP&UP';
 if(promo==='happy')return '해피아워';
 if(promo==='takeout')return '포장 20%';
 if(promo==='set'&&[2,3,4].includes(set))return `${set}인 세트`;
 if(promo==='normal'&&orderType==='takeout')return '포장';
 return '';
}
function orderPizzaBenefitLabels(order){
 const pizzas=(Array.isArray(order?.items)?order.items:[]).filter(item=>item&&(item.pizza||item.pizzaLeft||item.pizzaRight));
 const hasItemBenefitData=pizzas.some(item=>typeof item?.promo==='string'&&item.promo.length>0);
 const sources=hasItemBenefitData?pizzas:[{promo:order?.promo??order?.benefit,set:order?.set}];
 const labels=[];
 for(const source of sources){
  const label=storedPizzaBenefitLabel(source?.promo,source?.set,order?.orderType);
  if(label&&!labels.includes(label))labels.push(label);
 }
 return labels;
}
function pizzaSectionHeadingHTML(order){
 const benefits=orderPizzaBenefitLabels(order);
 return `<div class="pizza-section-heading"><h4>피자</h4>${benefits.length?`<span>${esc(benefits.join(' + '))}</span>`:''}</div>`;
}
function orderMenuHTML(order){
 const items=Array.isArray(order.items)?order.items:[];
 const sides=items.flatMap(item=>[...selectionEntries(item.includedSides,'sides',SIDES),...selectionEntries(item.sides,'sides',SIDES)]);
 const extras=items.reduce((result,item)=>{
  for(const map of [item.includedDrinks,item.drinks]){
   const categorized=categorizedDrinkEntries(map);
   result.drinks.push(...categorized.drinks);result.sauces.push(...categorized.sauces);
  }
  return result;
 },{drinks:[],sauces:[]});
 return `${items.length?`<section>${pizzaSectionHeadingHTML(order)}<div class="detail-items">${items.map(itemHTML).join('')}</div></section>`:'<p class="empty-items">저장된 피자 정보가 없습니다.</p>'}${sides.length?`<section><h4>사이드메뉴</h4>${itemListHTML(sides)}</section>`:''}${extras.drinks.length?`<section><h4>음료</h4>${itemListHTML(extras.drinks)}</section>`:''}${extras.sauces.length?`<section><h4>곁들이</h4>${itemListHTML(extras.sauces)}</section>`:''}`;
}
function combinedEntries(entries){
 const totals=new Map();
 (entries||[]).forEach(entry=>{
  const name=displayText(entry?.name,'');
  if(name)totals.set(name,(totals.get(name)||0)+Math.max(1,Number(entry.quantity)||1));
 });
 return [...totals].map(([name,quantity])=>({name,quantity}));
}
function compactEntriesText(entries){
 return combinedEntries(entries).map(entry=>`${entry.name}×${entry.quantity}`).join(' ')||'-';
}
function compactNewOrderData(order){
 const items=Array.isArray(order?.items)?order.items:[];
 const pizzas=items.map(item=>{
  const heading=`[${formatPizzaDisplayCode(item)} ${adminPizzaName(item)}]`;
  const toppings=combinedEntries(selectionEntries(item.toppings,'toppings',TOPPINGS)).map(entry=>`${entry.name}${entry.quantity}`).join(' + ');
  return toppings?`${heading} + ${toppings}`:heading;
 });
 const sides=items.flatMap(item=>[...selectionEntries(item.includedSides,'sides',SIDES),...selectionEntries(item.sides,'sides',SIDES)]);
 const extras=items.reduce((result,item)=>{
  for(const map of [item.includedDrinks,item.drinks]){
   const categorized=categorizedDrinkEntries(map);
   result.drinks.push(...categorized.drinks);
   result.sauces.push(...categorized.sauces);
  }
  return result;
 },{drinks:[],sauces:[]});
 const amounts=safeAmounts(order);
 return {
  phone:displayText(order.phone||order.phoneMasked),
  pizzas:pizzas.join(' / ')||'-',
  sides:compactEntriesText(sides),
  drinks:[compactEntriesText(extras.drinks),extras.sauces.length?`소스 ${compactEntriesText(extras.sauces)}`:''].filter(value=>value&&value!=='-').join(' · ')||'-',
  orderType:order.orderType==='takeout'?'포장주문':'먹고가기',
  seat:order.orderType==='takeout'?'-':displayText(orderSeatLabel(order)),
  benefit:orderBenefitLabel(order),
  discount:`할인 ${money(amounts.discount)}`,
  payment:`결제 ${money(amounts.paid)}`
 };
}
function newOrderCard(order){
 return mainOrderCard(order);
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
function ordersForMainList(list){
 return (list||[]).filter(order=>order.orderType!=='takeout'||activeFilter==='completed').filter(filterOrders);
}
function adminStatusName(order){if(order.orderType!=='takeout'&&['accepted','paid','cooking'].includes(order.status))return '사용중';return statusNames[order.status]||order.status}
function adminStatusVisual(order){if(['payment_pending','new'].includes(order.status))return {className:'seat-ordering',icon:'🟡'};if(order.orderType!=='takeout'&&['accepted','paid','cooking'].includes(order.status))return {className:'seat-occupied',icon:'🔴'};if(order.orderType==='takeout'&&['accepted','paid','cooking','ready','completed'].includes(order.status))return {className:'seat-available',icon:'🟢'};if(['ready','completed'].includes(order.status))return {className:'seat-available',icon:'🟢'};return {className:'',icon:''}}
function adminOrderActions(order){
 const includeCall=arguments.length<2||arguments[1]!==false;
 const pending=['payment_pending','new'].includes(order.status),inProgress=['accepted','paid','cooking'].includes(order.status),done=['ready','completed'].includes(order.status),takeout=order.orderType==='takeout';
 const reservation=typeof reservationTimeLabel==='function'?reservationTimeLabel(order):'';
 const primary=pending?`<div class="main-primary-action"><button type="button" class="accept payment-pending-action" data-action="set-status" data-order-id="${esc(order.id)}" data-status="accepted">결제대기 · 주문 접수</button>${reservation?`<strong class="reservation-time">${esc(reservation)}</strong>`:''}</div>`:inProgress?`<button type="button" class="${takeout?'ready':'occupied-action'}" data-action="set-status" data-order-id="${esc(order.id)}" data-status="completed">조리완료</button>`:'';
 return `${primary}${includeCall&&(inProgress||done)?`<button type="button" class="call" data-action="call-customer" data-order-no="${esc(order.customerNumber||order.orderNo||'')}" data-order-language="${esc(order.language||'')}">📢 고객 호출</button>`:''}${!['cancelled','completed'].includes(order.status)?`<button type="button" class="cancel" data-action="set-status" data-order-id="${esc(order.id)}" data-status="cancelled">취소</button>`:''}`;
}
function mainOrderCard(order,{takeoutAcceptance=false}={}){
 const takeout=order.orderType==='takeout',reservation=isReservationOrder(order),visual=adminStatusVisual(order);
 const {original,discount,paid}=safeAmounts(order),phone=displayText(order.phone||order.phoneMasked);
 const party=Number(order.partySize)>0?`${Number(order.partySize)}인`:'-';
 const seat=takeout?'-':displayText(orderSeatLabel(order));
 const paymentMethod=displayText(order?.payment?.methodName||order?.payment?.method),mealTicketHighlight=mealTicketHighlightHTML(order,paid);
 const reservationTime=reservationTimeLabel(order);
 const actions=takeoutAcceptance
  ?`<div class="main-primary-action"><button type="button" class="accept payment-pending-action" data-action="set-status" data-order-id="${esc(order.id)}" data-status="cooking">결제대기 · 주문 접수</button>${reservationTime?`<strong class="reservation-time">${esc(reservationTime)}</strong>`:''}</div>`
  :adminOrderActions(order,false);
 return `<article class="order-card main-order-card order-detail-trigger ${order.status}" data-order-id="${esc(order.id)}" role="button" tabindex="0" aria-label="${esc(adminOrderNumberLabel(order))}번 주문 상세보기">
 <header class="main-order-summary">
  <div class="main-order-identity">${reservation?'<span class="main-reservation">예약</span>':''}<strong>${esc(adminOrderNumberLabel(order))}</strong><span class="main-order-type ${takeout?'takeout':'dinein'}">${takeout?'포장':'매장식사'}</span><span class="status-badge ${order.status} ${visual.className}">${visual.icon?`${visual.icon} `:''}${esc(adminStatusName(order))}</span><time>주문시간 ${formatTime(order.createdAt||order.createdAtClient)}</time></div>
  <div class="main-order-fact"><span>인원</span><strong>${party}</strong></div>
  <div class="main-order-fact"><span>좌석</span><strong>${esc(seat)}</strong></div>
  <div class="main-order-fact phone"><span>연락처</span><strong>${esc(phone)}</strong>${phone!=='-'?`<button type="button" data-action="copy-phone" data-phone="${esc(phone)}">복사</button>`:''}</div>
  <div class="main-order-fact paid"><span>결제금액</span><strong>${money(paid)}</strong></div>
 </header>
 <div class="main-order-body">
  <div class="main-order-menu">${orderDetailMenuHTML(order)}${orderDetailForkHTML(order)}</div>
  <div class="main-order-operations">
   <div class="main-payment-grid"><div class="payment-method"><span>결제수단</span><strong>${esc(paymentMethod)}</strong></div><div><span>원 금액</span><strong>${money(original)}</strong></div><div class="discount"><span>할인금액</span><strong>${discount?`−${money(discount)}`:money(0)}</strong></div><div class="paid"><span>결제금액</span><strong>${money(paid)}</strong></div></div>
   <button type="button" class="main-customer-call" data-action="call-customer" data-order-no="${esc(order.customerNumber||order.orderNo||'')}" data-order-language="${esc(order.language||'')}">📣 고객 호출</button>
   ${mealTicketHighlight}
   ${actions?`<div class="actions main-order-actions">${actions}</div>`:''}
  </div>
 </div>
 </article>`;
}
function takeoutItemCount(order){
 return Number(order.itemCount)||(order.items||[]).reduce((sum,item)=>sum+Math.max(1,Number(item.qty)||1),0);
}
function takeoutPendingCard(order){
 return mainOrderCard(order,{takeoutAcceptance:true});
}
function takeoutProgressAction(order){
 if(['accepted','paid','cooking'].includes(order.status))return {label:'조리완료',status:'ready',className:'ready'};
 return {label:'픽업완료',status:'completed',className:'pickup'};
}
function takeoutProcessingCard(order){
 const action=takeoutProgressAction(order);
 return `<article class="takeout-small order-detail-trigger" data-order-id="${esc(order.id)}" data-order-status="${esc(order.status)}" role="button" tabindex="0" aria-label="${esc(adminOrderNumberLabel(order))}번 포장 주문 상세보기"><div class="takeout-small-number">${esc(adminOrderNumberLabel(order))}</div><strong>포장 주문</strong><span>주문시간 ${formatTime(order.createdAt||order.createdAtClient)}</span><span>상품 ${takeoutItemCount(order)}개</span><button type="button" class="${action.className}" data-action="set-status" data-order-id="${esc(order.id)}" data-status="${action.status}">${action.label}</button></article>`;
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
  const attributes=`class="seat-overview-card seat-zone-${seat.zone} ${status}" style="grid-row-start:${seat.row};grid-column-start:${seat.column}" data-seat-id="${esc(seat.id)}"`;
  const action=status==='held'?'open-seat-order':'toggle-seat';
  const actionLabel=status==='empty'?'사용중으로 변경':status==='occupied'?'빈자리로 변경':'주문 상세보기';
  return `<button type="button" ${attributes} data-action="${action}" aria-label="${esc(seat.name)} ${seatStatusNames[status]}. ${actionLabel}">${content}</button>`;
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
 const filtered=ordersForMainList(orders).map((order,index)=>({order,index})).sort((a,b)=>compareOrdersOldestFirst(a.order,b.order)||a.index-b.index).map(entry=>entry.order);
 orderList.innerHTML=filtered.length?filtered.map(order=>mainOrderCard(order)).join(''):'<div class="empty">해당 상태의 주문이 없습니다.</div>';
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
   transaction.set(ref,{orderNumber:number,displayStatus:status,storeId:MANUAL_CALL_STORE_ID,businessDay:seoulBusinessDayKey(),announceVersion:status==='ready'?1:0,createdAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
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
  const displayRef=order.orderType==='takeout'?db.collection('publicOrderDisplays').doc(id):null;
  const batch=db.batch();
  batch.update(db.collection('orders').doc(id),{status,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
  if(order.orderType==='takeout'){
   if(['accepted','paid','cooking','ready'].includes(status)){
    const businessDay=orderBusinessDayKey(order);
    if(businessDay)batch.set(displayRef,{
     orderNumber:String(order.customerNumber||order.orderNo||adminOrderNumberLabel(order)),
     displayStatus:status==='ready'?'ready':'cooking',
     storeId:String(order.storeId||'pangyo2-techno-valley'),
     businessDay,
     updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
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

let orderDetailSourceSeatId=null;
let orderDetailReturnFocus=null;
function orderById(id){return orders.find(order=>String(order.id)===String(id))}
function paymentStatusLabel(order){
 return displayText(order?.paymentStatus||order?.payment?.status,'저장 정보 없음');
}
function isReservationOrder(order){
 const mode=String(order?.pickup?.mode||'').trim().toLowerCase();
 return mode==='reserve'||(mode!=='now'&&Boolean(displayText(order?.pickup?.time,'')));
}
function reservationTimeLabel(order){
 if(!isReservationOrder(order))return '';
 const raw=order?.pickup?.time;
 if(typeof raw==='string'){
  const match=raw.trim().match(/^(?:[01]\d|2[0-3]):[0-5]\d(?:[:][0-5]\d)?$/);
  if(match)return `${match[0].slice(0,5)} 예약`;
 }
 const value=raw?.toDate?raw.toDate():raw instanceof Date?raw:null;
 if(value&&!Number.isNaN(value.getTime()))return `${String(value.getHours()).padStart(2,'0')}:${String(value.getMinutes()).padStart(2,'0')} 예약`;
 return '';
}
function reservationDetailValue(order){
 if(!isReservationOrder(order))return '';
 const raw=order?.pickup?.time;
 if(typeof raw==='string'){
  const time=raw.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if(time){
   const hour=Number(time[1]);
   return `${hour<12?'오전':'오후'} ${hour%12||12}:${time[2]}`;
  }
 }
 const value=raw?.toDate?raw.toDate():raw instanceof Date?raw:null;
 if(!value||Number.isNaN(value.getTime()))return '';
 const parts=new Intl.DateTimeFormat('ko-KR',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'numeric',minute:'2-digit',hour12:true
 }).formatToParts(value).reduce((result,part)=>(result[part.type]=part.value,result),{});
 if(!parts.year||!parts.month||!parts.day||!parts.dayPeriod||!parts.hour||!parts.minute)return '';
 return `${parts.year}. ${parts.month}. ${parts.day}. ${parts.dayPeriod} ${parts.hour}:${parts.minute}`;
}
function storedLineAmount(entry){
 for(const value of [entry?.total,entry?.amount,entry?.lineTotal]){
  if(value!==null&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0)return Number(value);
 }
 return null;
}
function safeDisplayQuantity(value){
 const quantity=Number(value);
 return Number.isInteger(quantity)&&quantity>0?quantity:1;
}
function catalogUnitPrice(id,legacyMaster=[]){
 const price=legacyMaster.find(entry=>entry?.id===id)?.price;
 return Number.isFinite(Number(price))&&Number(price)>=0?Number(price):null;
}
function storedSelectionEntries(map,category,legacyMaster=[],{included=false,parentQuantity=1}={}){
 return Object.entries(map||{}).flatMap(([id,value])=>{
  const quantity=typeof value==='object'&&value!==null?Number(value.quantity??value.qty):Number(value);
  if(!(quantity>0))return [];
  const storedName=typeof value==='object'&&value!==null?value.name:'';
  const storedAmount=storedLineAmount(value),unitPrice=typeof value==='object'&&value!==null?storedLineAmount({amount:value.unitPrice??value.price}):catalogUnitPrice(id,legacyMaster);
  const amount=included?0:storedAmount??(unitPrice===null?null:unitPrice*quantity*safeDisplayQuantity(parentQuantity));
  return [{name:displayText(storedName,productName(id,category,legacyMaster)),quantity,amount}];
 });
}
function combinedStoredEntries(entries){
 const totals=new Map();
 (entries||[]).forEach(entry=>{
  const name=displayText(entry?.name,'');
  if(!name)return;
  const quantity=Math.max(1,Number(entry.quantity)||1),amount=storedLineAmount(entry);
  const current=totals.get(name)||{name,quantity:0,amount:0,hasAmount:true};
  current.quantity+=quantity;
  if(amount===null)current.hasAmount=false;else current.amount+=amount;
  totals.set(name,current);
 });
 return [...totals.values()].map(entry=>({...entry,amount:entry.hasAmount?entry.amount:null}));
}
function detailQuantityHTML(quantity){
 const qty=safeDisplayQuantity(quantity);
 return `<span class="detail-menu-quantity">×${qty}</span>`;
}
function detailPriceHTML(amount){
 return amount===null?'':`<strong class="detail-menu-price">${money(amount)}</strong>`;
}
function orderDetailMenuLine(entry,className='extra'){
 return `<div class="detail-menu-line ${className}"><span class="detail-menu-name">${esc(entry.name)}</span>${detailQuantityHTML(entry.quantity)}${detailPriceHTML(entry.amount)}</div>`;
}
function orderDetailPizzaLine(item){
 const quantity=safeDisplayQuantity(item?.qty);
 const toppings=combinedStoredEntries(storedSelectionEntries(item?.toppings,'toppings',TOPPINGS,{parentQuantity:quantity}));
 const toppingText=toppings.length?`<span class="detail-pizza-options">${toppings.map(entry=>orderDetailMenuLine({...entry,name:`+ ${entry.name}`} ,'option')).join('')}</span>`:'';
 const amount=storedLineAmount(item)??(()=>{const unit=storedLineAmount({amount:item?.unitPrice??item?.price});return unit===null?null:unit*quantity})();
 return `<div class="detail-pizza-item"><div class="detail-menu-line pizza"><span class="detail-pizza-title">${renderPizzaDisplayCode(formatPizzaDisplayCode(item))}<span class="detail-pizza-name">${esc(adminPizzaName(item))}</span></span>${detailQuantityHTML(quantity)}${detailPriceHTML(amount)}</div>${toppingText}</div>`;
}
function orderDetailMenuHTML(order){
 const items=Array.isArray(order?.items)?order.items:[];
 const sides=combinedStoredEntries(items.flatMap(item=>[
  ...storedSelectionEntries(item?.includedSides,'sides',SIDES,{included:true,parentQuantity:item?.qty}),
  ...storedSelectionEntries(item?.sides,'sides',SIDES,{parentQuantity:item?.qty})
 ]));
 const extras=items.reduce((result,item)=>{
  for(const map of [item?.includedDrinks,item?.drinks]){
   Object.entries(map||{}).forEach(([id,value])=>{
    const category=ORDER_CATALOG.sauces?.[id]?'accompaniments':ORDER_CATALOG.drinks?.[id]?'drinks':'unknown';
    const lookupCategory=category==='accompaniments'?'sauces':category;
    const included=map===item?.includedDrinks;
    result[category].push(...storedSelectionEntries({[id]:value},lookupCategory,DRINKS,{included,parentQuantity:item?.qty}));
   });
  }
  return result;
 },{drinks:[],accompaniments:[],unknown:[]});
 const otherLines=[...sides,...combinedStoredEntries(extras.drinks),...combinedStoredEntries(extras.accompaniments),...combinedStoredEntries(extras.unknown)];
 const pizzaSection=items.length?`<section class="detail-menu-section detail-pizza-section">${pizzaSectionHeadingHTML(order)}<div class="detail-menu-list">${items.map(orderDetailPizzaLine).join('')}</div></section>`:'';
 const otherSection=otherLines.length?`<section class="detail-menu-section detail-other-section"><h4>사이드 / 음료 / 곁들이</h4><div class="detail-menu-list">${otherLines.map(entry=>orderDetailMenuLine(entry)).join('')}</div></section>`:'';
 return `${pizzaSection}${otherSection}`;
}
function orderDetailForkHTML(order){
 const required=order?.disposables===true;
 return `<div class="detail-fork-card"><span>일회용 포크</span><strong>${required?'O':'X'}</strong></div>`;
}
function renderOrderDetail(order,seatId=null){
 const takeout=order.orderType==='takeout';
 const seatLabel=takeout?'-':displayText(orderSeatLabel(order));
 const reservation=isReservationOrder(order);
 const {original,discount,paid}=safeAmounts(order);
 const phone=displayText(order.phone||order.phoneMasked);
 const party=Number(order.partySize)>0?`${Number(order.partySize)}인`:'-';
 const completed=['ready','completed'].includes(order.status);
 const reservationValue=reservationDetailValue(order);
 const paymentMethod=displayText(order?.payment?.methodName||order?.payment?.method),mealTicketHighlight=mealTicketHighlightHTML(order,paid);
 return `<div class="admin-detail-screen">
 <div class="admin-detail-topbar">
  <div class="detail-order-identity">${reservation?'<span class="detail-reservation">예약</span>':''}<strong>${esc(adminOrderNumberLabel(order))}</strong><span class="detail-order-type ${takeout?'takeout':'dinein'}">${takeout?'포장':'매장식사'}</span></div>
  <div class="detail-top-card"><span>인원</span><strong>${party}</strong></div>
  <div class="detail-top-card seat"><span>좌석</span><strong>${esc(seatLabel)}</strong></div>
  <div class="detail-top-card phone"><span>연락처</span><strong>${esc(phone)}</strong>${phone!=='-'?`<button type="button" data-action="copy-phone" data-phone="${esc(phone)}">복사</button>`:''}</div>
  <div class="detail-top-card paid"><span>결제금액</span><strong>${money(paid)}</strong></div>
  ${reservationValue?`<div class="detail-reservation-time"><span>예약주문</span><strong><small>예약시간</small>${esc(reservationValue)}</strong></div>`:''}
  <div class="detail-completion">${completed?'<strong><i></i>완료</strong>':''}<span>주문시간 ${formatTime(order.createdAt||order.createdAtClient)}</span></div>
 </div>
 <div class="admin-detail-body">
  <div class="admin-detail-menu">${orderDetailMenuHTML(order)}${orderDetailForkHTML(order)}</div>
  <div class="admin-detail-operations">
   <div class="detail-payment-grid">
    <div class="payment-method"><span>결제수단</span><strong>${esc(paymentMethod)}</strong></div>
    <div><span>원 금액</span><strong>${money(original)}</strong></div>
    <div class="discount"><span>할인금액</span><strong>${discount?`−${money(discount)}`:money(0)}</strong></div>
    <div class="paid"><span>결제금액</span><strong>${money(paid)}</strong></div>
   </div>
   <button type="button" class="detail-customer-call" data-action="call-customer" data-order-no="${esc(order.customerNumber||order.orderNo||'')}" data-order-language="${esc(order.language||'')}">📣 고객 호출</button>
   ${mealTicketHighlight}
  </div>
 </div>
 ${seatId?`<div class="order-detail-seat-actions"><button type="button" data-action="clear-seat" data-seat-id="${esc(seatId)}">이 테이블 빈자리로 변경</button></div>`:''}
 </div>`;
}
function showOrderDetail(order,seatId=null,trigger=null){
 if(!order||!orderDetailModal||!orderDetailContent)return false;
 orderDetailSourceSeatId=seatId;
 orderDetailReturnFocus=trigger||document.activeElement;
 orderDetailContent.innerHTML=renderOrderDetail(order,seatId);
 document.getElementById('orderDetailTitle').textContent=`${adminOrderNumberLabel(order)}번 · ${order.orderType==='takeout'?'포장':'먹고 가기'}`;
 orderDetailModal.hidden=false;
 closeOrderDetailButton?.focus();
 return true;
}
function closeOrderDetail(){
 if(!orderDetailModal||orderDetailModal.hidden)return;
 orderDetailModal.hidden=true;orderDetailContent.innerHTML='';orderDetailSourceSeatId=null;
 if(orderDetailReturnFocus?.isConnected)orderDetailReturnFocus.focus();
 orderDetailReturnFocus=null;
}
function openOrderDetail(orderId,trigger=null){return showOrderDetail(orderById(orderId),null,trigger)}
function activeOrdersForSeat(seatId){
 return orders.filter(order=>order.orderType!=='takeout'&&orderSeatIds(order).includes(seatId)&&ACTIVE_ORDER_STATUSES.has(order.status))
  .map((order,index)=>({order,index}))
  .sort((a,b)=>(orderTimeMillis(b.order.createdAt)??orderTimeMillis(b.order.createdAtClient)??0)-(orderTimeMillis(a.order.createdAt)??orderTimeMillis(a.order.createdAtClient)??0)||b.index-a.index)
  .map(entry=>entry.order);
}
function openSeatOrderDetail(seatId,trigger=null){
 const related=activeOrdersForSeat(seatId);
 if(!related.length){showAdminMessage('이 테이블에 연결된 활성 주문이 없습니다.');return false}
 if(related.length===1)return showOrderDetail(related[0],seatId,trigger);
 orderDetailSourceSeatId=seatId;orderDetailReturnFocus=trigger||document.activeElement;
 orderDetailContent.innerHTML=`<div class="seat-order-picker"><p>이 테이블에 연결된 활성 주문 ${related.length}건 중 확인할 주문을 선택하세요.</p>${related.map(order=>`<button type="button" data-action="select-seat-order" data-order-id="${esc(order.id)}"><strong>${esc(adminOrderNumberLabel(order))}번</strong><span>${formatTime(order.createdAt||order.createdAtClient)} · ${esc(adminStatusName(order))}</span></button>`).join('')}</div>`;
 document.getElementById('orderDetailTitle').textContent='테이블 주문 선택';
 orderDetailModal.hidden=false;closeOrderDetailButton?.focus();
 return true;
}

document.getElementById('ordersPanel')?.addEventListener('click',async event=>{
 const button=event.target.closest('button[data-action]');
 if(!button||!document.getElementById('ordersPanel').contains(button)){
  const trigger=event.target.closest('[data-order-id].order-detail-trigger');
  if(trigger&&document.getElementById('ordersPanel').contains(trigger))openOrderDetail(trigger.dataset.orderId,trigger);
  return;
 }
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
 if(action==='open-seat-order'){
  openSeatOrderDetail(button.dataset.seatId,button);
  return;
 }
 if(action==='toggle-seat'){
  await toggleOverviewSeat(button.dataset.seatId,button);
  return;
 }
 if(action==='clear-seat'){
  await clearSeat(button.dataset.seatId,button);
 }
});
document.getElementById('ordersPanel')?.addEventListener('keydown',event=>{
 if(!['Enter',' '].includes(event.key)||event.target.closest('button[data-action]'))return;
 const trigger=event.target.closest('[data-order-id].order-detail-trigger');
 if(!trigger)return;
 event.preventDefault();openOrderDetail(trigger.dataset.orderId,trigger);
});
closeOrderDetailButton?.addEventListener('click',closeOrderDetail);
orderDetailModal?.addEventListener('click',async event=>{
 if(event.target===orderDetailModal){closeOrderDetail();return}
 const button=event.target.closest('button[data-action]');
 if(!button)return;
 event.preventDefault();event.stopPropagation();
 if(button.dataset.action==='select-seat-order'){
  const order=orderById(button.dataset.orderId);
  if(order){orderDetailContent.innerHTML=renderOrderDetail(order,orderDetailSourceSeatId);document.getElementById('orderDetailTitle').textContent=`${adminOrderNumberLabel(order)}번 · 먹고 가기`}
  return;
 }
 if(button.dataset.action==='copy-phone'){
  try{await navigator.clipboard.writeText(button.dataset.phone||'');showAdminMessage('연락처가 복사되었습니다.')}catch(error){showAdminMessage('연락처를 복사하지 못했습니다.',true)}
  return;
 }
 if(button.dataset.action==='call-customer'){
  callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage);
  return;
 }
 if(button.dataset.action==='clear-seat'){
  const cleared=await clearSeat(button.dataset.seatId,button);
  if(cleared)closeOrderDetail();
 }
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!orderDetailModal?.hidden)closeOrderDetail()});

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

async function toggleOverviewSeat(id,button){
 const lockId=`seat:${id}`;
 const seat=ADMIN_SEATS.find(item=>item.id===id),data=seatDocuments[id]||{};
 const status=normalizedSeatStatus(data.status);
 if(!seat||status==='held'||statusUpdateLocks.has(lockId))return false;
 if(status==='occupied')return clearSeat(id,button);
 statusUpdateLocks.add(lockId);
 if(button){button.disabled=true;button.setAttribute('aria-busy','true')}
 try{
  await db.collection('seats').doc(id).set({
   status:'occupied',
   occupiedAt:firebase.firestore.FieldValue.serverTimestamp(),
   updatedAt:firebase.firestore.FieldValue.serverTimestamp()
  },{merge:true});
  showAdminMessage(`${seat.name}을 사용중으로 변경했습니다.`);
  return true;
 }catch(error){
  console.error('좌석 사용 시작 실패',error);
  showAdminMessage(`좌석 사용 시작 실패 (${error.code||'unknown'}): ${error.message}`,true);
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
const ADMIN_KOREAN_VOICE_PRIORITY=[/sunhi|선희/i,/heami|혜미/i,/seoyeon|서연/i,/natural|online|neural/i,/korean|한국/i];
const ADMIN_VOICE_STORAGE_KEY='pjAdminCustomerCallVoice';
const ADMIN_CALL_SPEECH_SETTINGS=Object.freeze({rate:.94,pitch:1.08,volume:1});
const adminVoiceSelect=document.getElementById('adminVoiceSelect');
const adminVoiceCurrent=document.getElementById('adminVoiceCurrent');
const adminVoiceStatus=document.getElementById('adminVoiceStatus');
const adminVoicePreview=document.getElementById('adminVoicePreview');
let adminKoreanVoice=null;
let adminVoiceRetryTimer=null;
let adminVoiceRetryCount=0;
let adminVoicePreparationPromise=null;
function adminVoiceKey(voice){return [voice?.name||'',voice?.lang||'',voice?.localService===true?'local':'remote'].join('|')}
function uniqueAdminVoices(voices){
 const byNameLanguage=new Map();
 voices.forEach(voice=>{const key=`${String(voice?.name||'').toLowerCase()}|${String(voice?.lang||'').toLowerCase()}`,current=byNameLanguage.get(key);if(!current||voice?.localService===true&&current?.localService!==true)byNameLanguage.set(key,voice)});
 return [...byNameLanguage.values()]
}
function storedAdminVoice(){try{return JSON.parse(localStorage.getItem(ADMIN_VOICE_STORAGE_KEY)||'null')}catch(e){return null}}
function selectAdminKoreanVoice(voices=window.speechSynthesis?.getVoices?.()||[]){
 const available=uniqueAdminVoices(voices),korean=available.filter(voice=>/^ko(?:[-_]KR)?$/i.test(String(voice?.lang||''))),stored=storedAdminVoice(),selectable=korean.length?korean:available;
 adminKoreanVoice=selectable.find(voice=>voice.name===stored?.name&&voice.lang===stored?.lang)
  ||ADMIN_KOREAN_VOICE_PRIORITY.map(pattern=>korean.find(voice=>pattern.test(String(voice.name||'')))).find(Boolean)
  ||korean.find(voice=>voice.localService===true)||korean[0]||available.find(voice=>voice.default)||null;
 return adminKoreanVoice
}
function renderAdminVoiceOptions(voices=window.speechSynthesis?.getVoices?.()||[]){
 const available=uniqueAdminVoices(voices),korean=available.filter(voice=>/^ko(?:[-_]KR)?$/i.test(String(voice?.lang||''))),shown=korean.length?korean:available;
 selectAdminKoreanVoice(available);
 adminVoiceSelect.replaceChildren();
 shown.forEach(voice=>{const option=document.createElement('option');option.value=adminVoiceKey(voice);option.textContent=`${voice.name} · ${voice.lang}${voice.localService?' · 기기':' · 온라인'}`;option.selected=voice===adminKoreanVoice;adminVoiceSelect.append(option)});
 adminVoiceSelect.disabled=!shown.length;
 adminVoiceStatus.textContent=!shown.length?'한국어 음성을 불러오는 중입니다…':!korean.length?'한국어 음성을 찾을 수 없음 · 대체 음성을 표시합니다.':korean.length===1?'현재 사용할 수 있는 한국어 음성이 1개뿐입니다. 다른 목소리를 사용하려면 Windows에 추가 한국어 음성을 설치해 주세요.':`한국어 음성 ${korean.length}개 사용 가능`;
 adminVoiceCurrent.textContent=adminKoreanVoice?`${adminKoreanVoice.name} · ${adminKoreanVoice.lang} · ${adminKoreanVoice.localService?'기기':'온라인'}`:'브라우저 기본 음성';
 return shown
}
function refreshAdminVoices(){
 const voices=window.speechSynthesis?.getVoices?.()||[];renderAdminVoiceOptions(voices);
 if(voices.length){if(adminVoiceRetryTimer)clearTimeout(adminVoiceRetryTimer);adminVoiceRetryTimer=null;return voices}
 if(!adminVoiceRetryTimer&&adminVoiceRetryCount<3)adminVoiceRetryTimer=setTimeout(()=>{adminVoiceRetryTimer=null;adminVoiceRetryCount++;refreshAdminVoices()},[250,750,1500][adminVoiceRetryCount]);
 return voices
}
function voiceBySelection(){return uniqueAdminVoices(window.speechSynthesis?.getVoices?.()||[]).find(voice=>adminVoiceKey(voice)===adminVoiceSelect.value)||selectAdminKoreanVoice()}
function describeAdminVoice(voice){return voice?`${voice.name} · ${voice.lang} · ${voice.localService?'기기':'온라인'}`:'브라우저 기본 음성'}
adminVoiceSelect.addEventListener('change',()=>{adminKoreanVoice=voiceBySelection();if(adminKoreanVoice)localStorage.setItem(ADMIN_VOICE_STORAGE_KEY,JSON.stringify({name:adminKoreanVoice.name,lang:adminKoreanVoice.lang}));adminVoiceCurrent.textContent=describeAdminVoice(adminKoreanVoice)});
window.speechSynthesis?.addEventListener?.('voiceschanged',refreshAdminVoices);
refreshAdminVoices();
function prepareAdminCustomerCallVoice(){
 const synth=window.speechSynthesis;if(!synth)return Promise.resolve(null);
 const ready=synth.getVoices?.()||[];if(ready.length){renderAdminVoiceOptions(ready);return Promise.resolve(selectAdminKoreanVoice(ready))}
 if(adminVoicePreparationPromise)return adminVoicePreparationPromise;
 adminVoicePreparationPromise=new Promise(resolve=>{
  const timers=[];let settled=false;
  const cleanup=()=>{timers.forEach(clearTimeout);synth.removeEventListener?.('voiceschanged',check)};
  const finish=voices=>{if(settled)return;settled=true;cleanup();if(voices.length)renderAdminVoiceOptions(voices);resolve(selectAdminKoreanVoice(voices))};
  const check=()=>{const voices=synth.getVoices?.()||[];if(voices.length)finish(voices)};
  synth.addEventListener?.('voiceschanged',check);
  [100,350,750,1100].forEach(delay=>timers.push(setTimeout(check,delay)));
  timers.push(setTimeout(()=>finish(synth.getVoices?.()||[]),1400));
 }).catch(()=>null).finally(()=>{adminVoicePreparationPromise=null});
 return adminVoicePreparationPromise
}
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
 const koreanNumber=spokenKoreanOrderNumber(orderNo);
 if(!String(number).match(/\d/)||!koreanNumber)return null;
 const speech={
  ko:{lang:'ko-KR',text:`${koreanNumber} 번 고객님.`},
  en:{lang:'en-US',text:`Customer number ${number}, your order is ready. Please come to the counter.`},
  es:{lang:'es-ES',text:`Cliente número ${number}, su pedido está listo. Por favor, acérquese al mostrador.`},
  ja:{lang:'ja-JP',text:`お客様番号${number}番、ご注文の商品ができあがりました。カウンターまでお越しください。`},
  zh:{lang:'zh-CN',text:`号码为${number}的顾客，您的餐品已经准备好了，请到柜台取餐。`}
 }[normalized];
 return {...speech,voicePrefix:normalized}
}
async function speakCustomerCall(orderNo,language){
 if(!soundEnabled||!settings.voice||!('speechSynthesis'in window))return;
 const preparedVoice=await prepareAdminCustomerCallVoice().catch(()=>null);
 return new Promise(resolve=>{
  const speech=customerCallSpeech(orderNo,language);
  if(!speech){resolve();return}
  const utterance=PJSpeech.createSpeechUtterance(speech.text,{lang:speech.lang});
  if(speech.lang==='ko-KR'&&preparedVoice)utterance.voice=preparedVoice;
  Object.assign(utterance,ADMIN_CALL_SPEECH_SETTINGS);
  if(speech.lang==='ko-KR')console.info('[Admin customer call voice]',{voiceName:utterance.voice?.name||'browser default',lang:utterance.voice?.lang||utterance.lang,localService:utterance.voice?.localService??null,rate:utterance.rate,pitch:utterance.pitch,orderNumber:spokenOrderNumber(orderNo),spokenText:speech.text});
  utterance.onend=resolve;utterance.onerror=resolve;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
 });
}
function enqueueCustomerCall(orderNo,language){speechQueue=speechQueue.then(()=>speakCustomerCall(orderNo,language)).catch(()=>{});return speechQueue}
adminVoicePreview.addEventListener('click',()=>enqueueCustomerCall('3181','ko'));

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
