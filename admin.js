const adminGate=document.getElementById('adminLoginGate');
const adminLoginForm=document.getElementById('adminLoginForm');
const adminEmail=document.getElementById('adminEmail');
const adminPassword=document.getElementById('adminPassword');
const adminLoginError=document.getElementById('adminLoginError');
const {FORCE_COMPLETE_STATUSES,OCCUPIED_EXPIRY_MS,ADMIN_SEAT_STATUSES,normalizeAdminSeatStatus,getAdminSeatActions,transitionAdminSeatState,orphanHeldSeatState,recoverOrphanHeldSeatTransaction,seatSnapshotRecord,classifySeatOrderMismatch,forceConfirmationValue,createCounterTakeoutTransaction,startTakeoutPreparationTransaction,autoCompleteTakeoutTransaction,createAutoReadyCoordinator,reservationPickupMillis,reservationPrepStartMillis,reservationLifecycleEligible,transitionLifecycleId,startReservationLifecycleTransaction,advanceReservationLifecycleTransaction,createReservationLifecycleCoordinator,completeTakeoutTransaction,completeTakeoutPickupTransaction,cancelAuditedTakeoutTransaction,forceCompleteTransaction,displayIdentity,expiredSeatGroups:findExpiredSeatGroups,releaseExpiredSeatGroupTransaction}=PJAdminOperations;
const ADMIN_APP_VERSION='admin-v49.1.1';
const ADMIN_CLIENT_INSTANCE_KEY='pj-admin-client-instance-v1';
function adminClientInstanceId(){let value='';try{value=sessionStorage.getItem(ADMIN_CLIENT_INSTANCE_KEY)||'';if(!value){value=globalThis.crypto?.randomUUID?.()||`admin_${Date.now()}_${Math.random().toString(36).slice(2)}`;sessionStorage.setItem(ADMIN_CLIENT_INSTANCE_KEY,value)}}catch(error){value=globalThis.crypto?.randomUUID?.()||`admin_${Date.now()}_${Math.random().toString(36).slice(2)}`}return value}
const ADMIN_CLIENT_INSTANCE_ID=adminClientInstanceId();
function transitionAuditContext(transitionSource,startedAt=Date.now()){return {transitionSource,transactionStartedAt:firebase.firestore.Timestamp.fromMillis(startedAt),clientInstanceId:ADMIN_CLIENT_INSTANCE_ID,appVersion:ADMIN_APP_VERSION,actorRole:'admin'}}
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
let seatExpiryTimer=null,seatExpiryDebounce=null,seatExpiryRunning=false;
const pendingAdminSeatTargets=new Map();
const adminClockBaseline={wall:Date.now(),monotonic:typeof performance!=='undefined'?performance.now():0};

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
 if(seatExpiryTimer){clearInterval(seatExpiryTimer);seatExpiryTimer=null}
 if(seatExpiryDebounce){clearTimeout(seatExpiryDebounce);seatExpiryDebounce=null}
 subscriptionsStarted=false;
}

function refreshVisibleOrders(now=new Date()){
 orders=visibleBusinessDayOrders(receivedOrders,now);
 render();
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
 reconcileAutoReadyOrders(receivedOrders);
 reconcileReservationLifecycleOrders(receivedOrders);
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
 orderList.innerHTML=`<tr><td colspan="11" class="central-order-empty">Firestore 연결 오류: ${esc(error.message)}</td></tr>`;
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
  pendingAdminSeatTargets.forEach((target,id)=>{if(normalizeAdminSeatStatus(seatDocuments[id]?.status)===target){pendingAdminSeatTargets.delete(id);statusUpdateLocks.delete(`seat:${id}`)}});
  const badge=document.getElementById('seatOverviewConnection');
  if(badge){badge.textContent='실시간 연결';badge.className='live'}
  renderSeatOverview();
  renderCentralOrderList();
  scheduleExpiredSeatRelease();
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
   startExpiredSeatChecks();
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
const orderList=document.getElementById('orderList');
const businessDayOrderCount=document.getElementById('businessDayOrderCount');
const businessDayNotice=document.getElementById('businessDayNotice');
const orderPagination=document.getElementById('orderPagination');
const selectedOrderDetail=document.getElementById('selectedOrderDetail');
const orderDetailModal=document.getElementById('orderDetailModal');
const orderDetailContent=document.getElementById('orderDetailContent');
const closeOrderDetailButton=document.getElementById('closeOrderDetail');
const forceCompleteModal=document.getElementById('forceCompleteModal');
const forceCompleteDetails=document.getElementById('forceCompleteDetails');
const forceCompleteCode=document.getElementById('forceCompleteCode');
const forceCompleteCodeHint=document.getElementById('forceCompleteCodeHint');
const forceCompleteError=document.getElementById('forceCompleteError');
const confirmForceComplete=document.getElementById('confirmForceComplete');
const closeForceCompleteButton=document.getElementById('closeForceComplete');
const cancelForceCompleteButton=document.getElementById('cancelForceComplete');
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
const CENTRAL_ORDER_PAGE_SIZE=15;
let centralOrderPage=1;
let selectedCentralOrderId=null;
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
const statusNames={payment_pending:'결제대기',new:'결제대기',reservation_pending:'예약중',paid:'접수',accepted:'접수',cooking:'조리중',ready:'완료',completed:'완료',cancelled:'취소'};
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
 {id:'room-1',name:'단체석1',zone:'room',row:6,column:1},
 {id:'room-2',name:'단체석2',zone:'room',row:6,column:2},
 {id:'room-3',name:'단체석3',zone:'room',row:6,column:3}
];
const seatStatusNames={empty:'빈자리',held:'주문중',occupied:'사용중',reserved:'예약',unknown:'확인 필요'};
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
 if(Number(order?.adminDisplaySequence)>0)return String(order.adminDisplaySequence);
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
 return String(a?.id||'').localeCompare(String(b?.id||''),'en');
}
function seoulBusinessDayKey(value=new Date()){
 const date=value?.toDate?value.toDate():new Date(value);
 if(Number.isNaN(date.getTime()))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 let businessDate=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),12));
 if(Number(parts.hour)<9)businessDate.setUTCDate(businessDate.getUTCDate()-1);
 return businessDate.toISOString().slice(0,10);
}
const ACTIVE_ORDER_STATUSES=new Set(['payment_pending','new','reservation_pending','accepted','paid','cooking']);
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
 return orderBusinessDay===seoulBusinessDayKey(now);
}
function visibleBusinessDayOrders(list,now=new Date()){
 const sorted=(list||[])
  .filter(order=>shouldShowBusinessDayOrder(order,now))
  .sort(compareOrdersOldestFirst);
 return sorted.map((order,index)=>({...order,adminDisplaySequence:index+1}));
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
 'annex-1':'별관1','annex-2':'별관2','annex-3':'별관3','annex-4':'별관4',
 'room-1':'단체석1','room-2':'단체석2','room-3':'단체석3'
};
const ADMIN_ZONE_NAMES={papa:'파파존',outdoor:'야외석',annex:'별관',room:'별관 단체석'};
function normalizeLegacySeatLabel(value){
 const raw=String(value||'').trim(),compact=raw.toLowerCase().replace(/[\s·_-]+/g,'');
 const room=compact.match(/(?:room|룸|단체석)([123])/);if(room)return `단체석${room[1]}`;
 const annex=compact.match(/(?:annex|papabottle|파파보틀|보틀존|보틀석|별관석|별관)([1234])/);if(annex)return `별관${annex[1]}`;
 if(['보틀존','보틀석','파파보틀','별관석','papabottle','annex'].includes(compact))return '별관';
 if(['보틀룸','보틀룸존','별관룸','room'].includes(compact))return '별관 단체석';
 return raw
}
function orderSeatIds(order){
 const tables=Array.isArray(order?.seat?.tables)?order.seat.tables.filter(Boolean):[];
 if(tables.length)return [...new Set(tables)];
 return order?.seat?.id?[order.seat.id]:[];
}
function orderSeatLabel(order){
 const ids=orderSeatIds(order);
 if(ids.length)return ids.map(id=>ADMIN_SEAT_NAMES[id]||normalizeLegacySeatLabel(id)).join(' + ');
 return order?.seat?.name?normalizeLegacySeatLabel(order.seat.name):'-';
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
 const itemPromoLabels=pizzas.map(item=>storedPizzaBenefitLabel(item?.promo,null,order?.orderType)).filter(Boolean);
 const orderPromoLabel=[order?.promo,order?.benefit].map(promo=>storedPizzaBenefitLabel(promo,null,order?.orderType)).find(Boolean)||'';
 const promoLabels=itemPromoLabels.length?itemPromoLabels:(orderPromoLabel?[orderPromoLabel]:[]);
 const itemSetLabels=pizzas.map(item=>storedPizzaBenefitLabel('set',item?.set,order?.orderType)).filter(Boolean);
 const orderSetLabel=storedPizzaBenefitLabel('set',order?.set,order?.orderType);
 const setLabels=itemSetLabels.length?itemSetLabels:(orderSetLabel?[orderSetLabel]:[]);
 return [...new Set([...promoLabels,...setLabels])].sort((left,right)=>(left==='UP&UP'?0:1)-(right==='UP&UP'?0:1));
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
function adminCustomerName(order){return order?.customerIdentityType==='name'&&typeof order?.customerDisplayName==='string'?safeCustomerCallName(order.customerDisplayName):''}
function adminCustomerIdentityLabel(order){return adminCustomerName(order)||displayText(order?.phone||order?.phoneMasked)}
function customerCallDataAttributes(order){const name=adminCustomerName(order);return `data-order-no="${esc(displayText(order?.customerNumber||order?.orderNo,''))}" data-order-language="${esc(displayText(order?.language,''))}" data-customer-name="${esc(name)}" data-customer-identity-type="${esc(name?'name':displayText(order?.customerIdentityType,''))}"`}
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
  phone:adminCustomerIdentityLabel(order),
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
function reservationPaymentLabel(order){if(!isReservationOrder(order))return '';if(order.reservationPaymentType==='prepaid')return '결제완료 예약';if(order.reservationPaymentType==='pay_on_pickup')return '후결제 예약';return '결제유형 확인 필요'}
function orderOperationsHTML(order){
 const {original,discount,paid}=safeAmounts(order),split=splitPaymentSummary(order,paid);
 const phone=adminCustomerIdentityLabel(order);
 const takeout=order.orderType==='takeout';
 const seat=takeout?'포장':displayText(orderSeatLabel(order));
 const party=Number(order.partySize)>0?`${Number(order.partySize)}인`:'-';
 const splitHTML=split?`<div class="payment-metric split-metric"><span>1인당 결제금액</span><strong>${money(split.groups[0].amount)}</strong><small>${split.groups.map(group=>`${money(group.amount)} × ${group.count}명`).join(' · ')}${split.matchesPaid?'':' · 저장 합계 '+money(split.total)}</small></div>`:'';
 const reservationPayment=reservationPaymentLabel(order);
 return `<div class="key-info"><div><span>인원</span><strong>${party}</strong></div><div><span>${takeout?'이용방법':'좌석'}</span><strong>${esc(seat)}</strong></div><div class="phone-info"><span>고객</span><strong>${esc(phone)}</strong>${phone!=='-'?`<button type="button" data-action="copy-phone" data-phone="${esc(phone)}">복사</button>`:''}</div></div><div class="order-context"><span>${PJCommon.legacyChannel(order)==='mobile'?'모바일':'PC'}</span><span>${takeout?'포장':'매장식사'}</span><span>${esc(order.pickup?.time?`예약 ${order.pickup.time}`:'바로 주문')}</span>${reservationPayment?`<span>${esc(reservationPayment)}</span>`:''}<span>언어 ${esc(String(order.language||'ko').toUpperCase())}</span><span>${esc(orderBenefitLabel(order))}</span></div><div class="payment-grid"><div class="payment-metric"><span>결제수단</span><strong>${esc(displayText(order.payment?.methodName))}</strong>${split?`<small>${split.count}명 분할결제</small>`:''}</div>${splitHTML}<div class="payment-metric"><span>원 금액</span><strong>${money(original)}</strong></div><div class="payment-metric discount"><span>할인금액</span><strong>${discount?`−${money(discount)}`:money(0)}</strong></div><div class="payment-metric paid"><span>결제금액</span><strong>${money(paid)}</strong></div></div>`;
}
function filterOrders(order){const channel=PJCommon.legacyChannel(order);if(activeChannel!=='all'&&channel!==activeChannel)return false;if(activeFilter==='all')return true;if(activeFilter==='payment_pending')return ['payment_pending','new','reservation_pending'].includes(order.status);if(activeFilter==='accepted')return ['accepted','paid','cooking'].includes(order.status);if(activeFilter==='completed')return ['completed','ready'].includes(order.status);return order.status===activeFilter}
function ordersForMainList(list){
 return (list||[]).filter(order=>order.orderType!=='takeout'||activeFilter==='completed').filter(filterOrders);
}
function reservationStatusLabel(order){if(!isReservationOrder(order))return '';if(order.status==='reservation_pending')return `예약중 (${reservationCountdownLabel(order)})`;if(order.status==='cooking')return '조리중 (예약)';if(order.status==='ready')return '조리완료 (예약)';if(order.status==='completed')return '픽업완료 (예약)';return displayText(statusNames[order.status],'예약 상태 확인 필요')}
function adminStatusName(order){const reservationStatus=reservationStatusLabel(order);if(reservationStatus){const payment=reservationPaymentLabel(order);return `${reservationStatus}${payment?` · ${payment}`:''}`}if(order.orderType!=='takeout'&&['accepted','paid','cooking'].includes(order.status))return '사용중';return statusNames[order.status]||order.status}
function isCounterTakeout(order){return order?.orderType==='takeout'&&order?.source==='admin_counter'}
function adminStatusVisual(order){if(['payment_pending','new'].includes(order.status))return {className:'seat-ordering',icon:'🟡'};if(order.orderType!=='takeout'&&['accepted','paid','cooking'].includes(order.status))return {className:'seat-occupied',icon:'🔴'};if(order.orderType==='takeout'&&['accepted','paid','cooking','ready','completed'].includes(order.status))return {className:'seat-available',icon:'🟢'};if(['ready','completed'].includes(order.status))return {className:'seat-available',icon:'🟢'};return {className:'',icon:''}}
function adminOrderActions(order){
 const includeCall=arguments.length<2||arguments[1]!==false;
 const pending=['payment_pending','new'].includes(order.status),inProgress=['accepted','paid','cooking'].includes(order.status),done=['ready','completed'].includes(order.status),takeout=order.orderType==='takeout';
 const reservation=typeof reservationTimeLabel==='function'?reservationTimeLabel(order):'';
 const primary=pending?`<div class="main-primary-action"><button type="button" class="accept payment-pending-action" data-action="set-status" data-order-id="${esc(order.id)}" data-status="accepted">결제대기 · 주문 접수</button>${reservation?`<strong class="reservation-time">${esc(reservation)}</strong>`:''}</div>`:inProgress?`<button type="button" class="${takeout?'ready':'occupied-action'}" data-action="set-status" data-order-id="${esc(order.id)}" data-status="${takeout?'ready':'completed'}">${takeout?'주문 완료':'조리완료'}</button>`:'';
 return `${primary}${includeCall&&(inProgress||done)?`<button type="button" class="call" data-action="call-customer" data-order-no="${esc(order.customerNumber||order.orderNo||'')}" data-order-language="${esc(order.language||'')}" data-customer-name="${esc(order.customerDisplayName||'')}" data-customer-identity-type="${esc(order.customerIdentityType||'')}">📢 고객 호출</button>`:''}${!['cancelled','completed'].includes(order.status)?`<button type="button" class="cancel" data-action="set-status" data-order-id="${esc(order.id)}" data-status="cancelled">취소</button>`:''}`;
}
function mainOrderCard(order,{takeoutAcceptance=false}={}){
 const takeout=order.orderType==='takeout',reservation=isReservationOrder(order),visual=adminStatusVisual(order);
 const {original,discount,paid}=safeAmounts(order),phone=displayText(order.phone||order.phoneMasked);
 const party=Number(order.partySize)>0?`${Number(order.partySize)}인`:'-';
 const seat=takeout?'-':displayText(orderSeatLabel(order));
 const paymentMethod=displayText(order?.payment?.methodName||order?.payment?.method),mealTicketHighlight=mealTicketHighlightHTML(order,paid);
 const reservationTime=reservationTimeLabel(order);
 const actions=takeoutAcceptance
  ?order.status==='reservation_pending'?`<div class="main-primary-action"><strong class="reservation-time">예약중 (${esc(reservationCountdownLabel(order))}) · ${order.reservationPaymentType==='pay_on_pickup'?'후결제 예약':'결제완료 예약'}</strong></div>`:`<div class="main-primary-action"><button type="button" class="accept payment-pending-action" data-action="${reservation?'select-reservation-payment':'select-preparation-time'}" data-order-id="${esc(order.id)}">결제대기 · 주문 접수</button>${reservationTime?`<strong class="reservation-time">${esc(reservationTime)}</strong>`:''}</div>`
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
   <button type="button" class="main-customer-call" data-action="call-customer" ${customerCallDataAttributes(order)}>📣 고객 호출</button>
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
function centralOrderTime(order){
 const millis=orderTimeMillis(order?.createdAt)??orderTimeMillis(order?.createdAtClient);
 if(millis==null)return '-';
 return new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(millis));
}
function centralPaymentMethod(order){
 const paid=safeAmounts(order).paid,split=splitPaymentSummary(order,paid);
 const method=displayText(order?.payment?.methodName||order?.payment?.method);
 return split?`${method}/${split.count}인`:method;
}
function disposablesVisual(value){
 if(value===true)return {text:'O',className:'fork-yes',ariaLabel:'일회용 포크 필요: O'};
 if(value===false)return {text:'X',className:'fork-no',ariaLabel:'일회용 포크 불필요: X'};
 return {text:'확인 필요',className:'fork-review',ariaLabel:'일회용 포크 정보 확인 필요'};
}
function disposablesStatusHTML(value,className='fork-status'){
 const visual=disposablesVisual(value);
 return `<span class="${className} ${visual.className}" aria-label="${visual.ariaLabel}">${visual.text}</span>`;
}
function isPendingOrder(order){return ['payment_pending','new'].includes(order?.status)}
function isCompletedOrder(order){return ['ready','completed'].includes(order?.status)}
function classifyCurrentSeatOrderMismatch(order,seats=seatDocuments){return classifySeatOrderMismatch(order,seats)}
function centralPaymentAction(order){
 const mismatch=classifyCurrentSeatOrderMismatch(order);
 if(mismatch.forceEligible){const enabled=Boolean(forceConfirmationValue(order));return `<button type="button" class="central-status-action force-complete" data-action="force-complete" data-order-id="${esc(order.id)}" aria-label="${esc(adminOrderNumberLabel(order))}번 주문 강제완료" ${enabled?'':'disabled aria-disabled="true" title="주문번호를 확인할 수 없어 상세 확인이 필요합니다."'}>강제완료</button>`}
 if(isPendingOrder(order)){const reservation=reservationPickupMillis(order)!==null;return `<button type="button" class="central-status-action payment-pending" data-action="${order.orderType==='takeout'?(reservation?'select-reservation-payment':'select-preparation-time'):'set-status'}" data-order-id="${esc(order.id)}" data-status="accepted" ${order.orderType==='takeout'?'':'data-confirm="결제를 확인하고 주문을 조리중으로 접수하시겠습니까?"'} aria-label="${esc(adminOrderNumberLabel(order))}번 주문 결제 확인">결제대기</button>`}
 if(order?.status==='reservation_pending')return `<span class="central-status-badge reservation-pending">예약중 (${esc(reservationCountdownLabel(order))}) · ${esc(reservationPaymentLabel(order))}</span>`;
 if(order?.orderType==='takeout'&&['accepted','paid','cooking'].includes(order?.status)){let label='주문 완료';if(order.status==='cooking'&&order.autoReadyEnabled===true){const due=order.readyDueAt&&typeof order.readyDueAt.toMillis==='function'?order.readyDueAt.toMillis():null;if(Number.isFinite(due)){const remaining=due-Date.now();label=remaining<=0?'조리완료 처리 중':remaining<60000?'조리중 · 1분 미만':`조리중 · ${Math.ceil(remaining/60000)}분 남음`}}return `<button type="button" class="central-status-action takeout-complete" data-action="confirm-takeout-complete" data-order-id="${esc(order.id)}" title="수동 조리완료" aria-label="${esc(adminOrderNumberLabel(order))}번 포장 조리완료">${esc(label)}</button>`}
 if(order?.orderType==='takeout'&&order?.status==='ready')return `<button type="button" class="central-status-action takeout-pickup" data-action="confirm-takeout-pickup" data-order-id="${esc(order.id)}" aria-label="${esc(adminOrderNumberLabel(order))}번 포장 픽업 완료">픽업 완료</button>`;
 if(['accepted','paid','cooking','ready','completed'].includes(order?.status))return '<span class="central-status-badge payment-complete" aria-label="결제완료">결제완료</span>';
 if(order?.status==='cancelled')return '<span class="central-status-badge payment-cancelled" aria-label="결제 상태 취소">취소</span>';
 return '<span class="central-status-badge payment-review" aria-label="결제 상태 확인 필요">확인 필요</span>';
}
function centralSeatAction(order){
 if(order.orderType==='takeout')return '-';
 if(isCompletedOrder(order))return '<span class="central-status-badge seat-complete">완료</span>';
 const ids=orderSeatIds(order),linked=ids.length>0&&ids.every(id=>seatDocuments[id]?.status==='occupied'&&String(seatDocuments[id]?.orderId||'')===String(order.id));
 if(!['accepted','paid','cooking'].includes(order.status))return '';
 return `<button type="button" class="central-status-action seat-occupied" data-action="set-status" data-order-id="${esc(order.id)}" data-status="completed" data-confirm="주문을 완료하고 연결된 좌석을 빈자리로 변경하시겠습니까?" ${linked?'':'disabled aria-disabled="true" title="현재 주문에 연결된 사용중 좌석만 완료할 수 있습니다."'}>사용중</button>`;
}
function centralOrderRow(order){
 const takeout=order.orderType==='takeout',reservation=isReservationOrder(order),selected=String(order.id)===String(selectedCentralOrderId);
 const party=!takeout&&Number(order.partySize)>0?`${Number(order.partySize)}명`:'-';
 const seat=takeout?'-':displayText(orderSeatLabel(order));
 const phone=displayText(order.phone||order.phoneMasked),orderNo=displayText(order.customerNumber||order.orderNo);
 const visual=adminStatusVisual(order),status=statusNames[order.status]?displayText(adminStatusName(order)):'확인 필요';
 const paid=safeAmounts(order).paid,paymentAmount=paid?money(paid):'-';
 return `<tr class="central-order-row order-detail-trigger ${reservation?'reservation':''} ${visual.className} ${selected?'selected':''}" data-order-id="${esc(order.id)}" tabindex="0" aria-selected="${selected}" aria-label="순번 ${esc(order.adminDisplaySequence)}, ${reservation?'예약':'즉시'}, ${esc(status)} 주문. Enter 키로 상세보기"><td><strong>${esc(order.adminDisplaySequence)}</strong>${isPendingOrder(order)?'<span class="central-new-order">신규주문</span>':''}</td><td><span class="central-kind ${reservation?'reservation':''}">${reservation?'예약':'즉시'}</span><small>${esc(status)}</small></td><td>${esc(centralOrderTime(order))}</td><td title="${esc(phone)}">${esc(phone)}</td><td title="${esc(orderNo)}">${esc(orderNo)}</td><td>${takeout?(isCounterTakeout(order)?'대면 포장':'포장'):'매장식사'}</td><td>${disposablesStatusHTML(order.disposables)}</td><td title="${esc(seat)}"><span class="central-cell-value">${esc(seat)}</span>${centralSeatAction(order)}</td><td>${party}</td><td><span class="central-cell-value">${paymentAmount}</span>${centralPaymentAction(order)}</td><td title="${esc(centralPaymentMethod(order))}">${esc(centralPaymentMethod(order))}</td></tr>`;
}
function nextBusinessDayBoundaryLabel(now=new Date()){
 const key=seoulBusinessDayKey(now),[year,month,day]=key.split('-').map(Number);
 const boundary=new Date(Date.UTC(year,month-1,day+1,0,0,0));
 return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(boundary);
}
function renderCentralOrderList(){
 const latest=[...orders].sort((a,b)=>compareOrdersOldestFirst(b,a));
 const pages=Math.max(1,Math.ceil(latest.length/CENTRAL_ORDER_PAGE_SIZE));
 centralOrderPage=Math.min(Math.max(1,centralOrderPage),pages);
 const visible=latest.slice((centralOrderPage-1)*CENTRAL_ORDER_PAGE_SIZE,centralOrderPage*CENTRAL_ORDER_PAGE_SIZE);
 businessDayOrderCount.textContent=`총 ${latest.length}건`;
 orderList.innerHTML=visible.length?visible.map(centralOrderRow).join(''):'<tr><td colspan="11" class="central-order-empty">현재 영업일 주문이 없습니다.</td></tr>';
 orderPagination.innerHTML=`<button type="button" data-order-page="${centralOrderPage-1}" ${centralOrderPage===1?'disabled':''}>이전</button><span>${centralOrderPage} / ${pages}</span><button type="button" data-order-page="${centralOrderPage+1}" ${centralOrderPage===pages?'disabled':''}>다음</button>`;
 syncCentralOrderSelection();
 businessDayNotice.textContent=`영업시간: 09:00 ~ 22:00 | 오늘 주문 초기화: ${nextBusinessDayBoundaryLabel()} 09:00`;
}
function syncCentralOrderSelection(focusRow=null){
 const selectedOrder=selectedCentralOrderId?orderById(selectedCentralOrderId):null;
 if(!selectedOrder)selectedCentralOrderId=null;
 let selectedRow=null;
 orderList.querySelectorAll('.central-order-row[data-order-id]').forEach(row=>{
  const selected=selectedCentralOrderId!==null&&String(row.dataset.orderId)===String(selectedCentralOrderId);
  row.classList.toggle('selected',selected);row.setAttribute('aria-selected',String(selected));
  if(selected)selectedRow=row;
 });
 selectedOrderDetail.disabled=!selectedRow;
 selectedOrderDetail.title=selectedCentralOrderId&&!selectedRow?'선택한 주문은 다른 페이지에 있습니다. 해당 페이지에서 다시 선택해 주세요.':'';
 if(focusRow?.isConnected)focusRow.focus();
 return selectedRow;
}
function manualCustomerCallCard(call){
 const ready=call.displayStatus==='ready';
 return `<article class="takeout-small manual" data-manual-call-id="${esc(call.id)}"><div class="takeout-small-number">${esc(orderNumberLabel(call.orderNumber))}</div><span class="manual-badge">대면접수</span><strong>대면 포장</strong><span>현재 상태 · ${ready?'조리완료':'조리중'}</span><span>접수 시각 ${formatTime(call.createdAt)}</span><button type="button" class="${ready?'pickup':'ready'}" data-action="set-manual-status" data-call-id="${esc(call.id)}" data-status="${ready?'picked-up':'ready'}">${ready?'픽업완료':'조리완료'}</button></article>`;
}
function normalizedSeatStatus(status){return normalizeAdminSeatStatus(status)}
function timestampMillis(value){if(value&&typeof value.toMillis==='function')return value.toMillis();if(value instanceof Date&&Number.isFinite(value.getTime()))return value.getTime();return null}
function occupiedElapsedLabel(data,now=Date.now()){
 if(data?.status!=='occupied')return '';
 const started=timestampMillis(data.occupiedAt);if(started==null)return '점유시간 확인 필요';
 const elapsed=Math.max(0,now-started);if(elapsed>=OCCUPIED_EXPIRY_MS)return '자동 해제 대상';
 return `사용중 · ${Math.floor(elapsed/3600000)}시간 ${Math.floor(elapsed%3600000/60000)}분`;
}
function renderSeatOverview(){
 if(!seatOverviewGrid)return;
 seatOverviewGrid.innerHTML=ADMIN_SEATS.map(seat=>{
  const data=seatDocuments[seat.id]||{},status=normalizedSeatStatus(data.status);
  const orderNumber=orderNumberLabel(data.orderNo||data.customerNumber||data.orderId||'');
  const elapsed=occupiedElapsedLabel(data);
  const pending=statusUpdateLocks.has(`seat:${seat.id}`),actions=getAdminSeatActions(status);
  const content=`<strong>${esc(seat.name)}</strong><span class="seat-overview-status"><i aria-hidden="true"></i>${ADMIN_SEAT_STATUSES[status].label}</span>${status!=='empty'&&orderNumber?`<small>${esc(orderNumber)}</small>`:''}${elapsed?`<small class="seat-occupied-elapsed">${esc(elapsed)}</small>`:''}`;
  const recovery=orphanHeldSeatState(data),buttons=status==='held'&&data.orderId?`<div class="admin-seat-actions"><button type="button" class="admin-seat-action empty" data-action="open-seat-order" data-seat-id="${esc(seat.id)}" aria-label="${esc(seat.name)} 주문 상세">주문 상세</button></div>`:status==='held'&&recovery.recoverable?`<div class="admin-seat-actions"><button type="button" class="admin-seat-action empty" data-action="recover-orphan-hold" data-seat-id="${esc(seat.id)}" ${pending?'disabled':''} aria-label="${esc(seat.name)} 만료된 주문 없는 좌석 강제 빈자리">강제 빈자리</button></div>`:actions.length?`<div class="admin-seat-actions" aria-busy="${pending}">${actions.map(action=>`<button type="button" class="admin-seat-action ${action.className}" data-action="transition-seat" data-seat-id="${esc(seat.id)}" data-seat-from="${status}" data-seat-to="${action.target}" ${pending?'disabled':''} aria-label="${esc(seat.name)} ${ADMIN_SEAT_STATUSES[status].label}. ${action.label}">${action.label}</button>`).join('')}</div>`:'';
  return `<article class="seat-overview-card seat-zone-${seat.zone} ${status}" style="grid-row-start:${seat.row};grid-column-start:${seat.column}" data-seat-id="${esc(seat.id)}" aria-label="${esc(seat.name)} ${ADMIN_SEAT_STATUSES[status].label}">${content}${buttons}</article>`;
 }).join('');
}
function render(){
 if(takeoutPending)takeoutPending.innerHTML='';
 renderCentralOrderList();
 if(orderDetailOpenOrderId&&!orderDetailModal.hidden){
  const current=orderById(orderDetailOpenOrderId);
  if(current)orderDetailContent.innerHTML=renderOrderDetail(current,orderDetailSourceSeatId);
  else{closeOrderDetail();showAdminMessage('주문이 삭제되었거나 현재 영업일 목록에서 확인할 수 없습니다.',true)}
 }
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
const MANUAL_CALL_STORE_ID='pangyo2-techno-valley';
const manualCallLocks=new Set();
function validManualCustomerNumber(value){return /^[0-9]{4}$/.test(String(value??'').trim())}
function manualCallDocumentId(orderNumber,businessDay=seoulBusinessDayKey()){return PJAdminOperations.counterTakeoutOrderId(orderNumber,businessDay)}
async function createManualCustomerCall(orderNumber,status,buttons=[]){
 const number=String(orderNumber??'').trim();
 if(!validManualCustomerNumber(number)){showAdminMessage('전화번호 뒤 4자리 숫자를 정확히 입력해 주세요.',true);return false}
 const businessDay=seoulBusinessDayKey(),id=manualCallDocumentId(number,businessDay);
 if(manualCallLocks.has(id))return false;
 manualCallLocks.add(id);buttons.forEach(button=>{button.disabled=true;button.setAttribute('aria-busy','true')});
 try{
  await createCounterTakeoutTransaction({db,orderNumber:number,status,businessDay,storeId:MANUAL_CALL_STORE_ID,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin'});
  showAdminMessage(`${number}번 대면 포장 주문을 ${status==='ready'?'완료':'조리중'} 상태로 등록했습니다.`);
  return true;
 }catch(error){
  showAdminMessage(error.code==='counter/duplicate'?error.message:`대면 포장 주문접수 실패: ${error.message}`,true);
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
  const localOrder=orders.find(o=>o.id===id);
  if(!localOrder)throw new Error('주문 정보를 찾을 수 없습니다. 화면을 새로고침해 주세요.');
  let committedOrder=null,pickupDisplayMissing=false;
  if(status==='ready'&&localOrder.orderType==='takeout'){
   const result=await completeTakeoutTransaction({db,orderId:id,expectedStatus:localOrder.status,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin',resolveBusinessDay:orderBusinessDayKey,...transitionAuditContext('admin_manual_ready')});
   committedOrder=result.order;
  }else if(status==='completed'&&localOrder.orderType==='takeout'){
   const result=await completeTakeoutPickupTransaction({db,orderId:id,expectedStatus:localOrder.status,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin',...transitionAuditContext('admin_manual_pickup')});
   committedOrder=result.order;
   pickupDisplayMissing=result.displayMissing;
  }else if(status==='cancelled'&&localOrder.orderType==='takeout'&&transitionLifecycleId(localOrder)){
   const result=await cancelAuditedTakeoutTransaction({db,orderId:id,expectedStatus:localOrder.status,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin',...transitionAuditContext('admin_manual_cancel')});
   committedOrder=result.order;
  }else await db.runTransaction(async transaction=>{
   const orderRef=db.collection('orders').doc(id);
   const orderSnapshot=await transaction.get(orderRef);
   if(!orderSnapshot.exists)throw Object.assign(new Error('주문이 삭제되었습니다.'),{code:'order/not-found'});
   const order={id,...orderSnapshot.data()},current=order.status;
   const allowed=status==='accepted'||status==='cooking'
    ?['payment_pending','new'].includes(current)
    :status==='ready'||status==='completed'
     ?['accepted','paid','cooking'].includes(current)
     :status==='cancelled'&&!['cancelled','completed'].includes(current);
   if(!allowed)throw Object.assign(new Error('다른 관리자가 이미 주문 상태를 변경했습니다. 최신 상태를 확인해 주세요.'),{code:'order/stale-state'});
   if(status==='cooking'&&order.orderType!=='takeout')throw Object.assign(new Error('매장 주문은 접수 상태로만 전환할 수 있습니다.'),{code:'order/invalid-transition'});
   if(status==='ready'&&order.orderType!=='takeout')throw Object.assign(new Error('매장 주문은 주문 완료로 처리해야 합니다.'),{code:'order/invalid-transition'});
   const seatIds=order.orderType==='takeout'?[]:orderSeatIds(order),seatRefs=seatIds.map(seatId=>db.collection('seats').doc(seatId));
   const seatSnapshots=await Promise.all(seatRefs.map(ref=>transaction.get(ref)));
   const acceptingDineIn=(status==='accepted'&&order.orderType!=='takeout');
   const completingDineIn=(status==='completed'&&order.orderType!=='takeout');
   if((acceptingDineIn||completingDineIn)&&!seatIds.length)throw Object.assign(new Error('주문에 연결된 좌석이 없습니다.'),{code:'seat/not-linked'});
   seatSnapshots.forEach((snapshot,index)=>{
    const seat=snapshot.exists?snapshot.data():null,seatId=seatIds[index];
    if(!seat||String(seat.orderId||'')!==String(id)){
     const records=Object.fromEntries(seatSnapshots.map((item,seatIndex)=>[seatIds[seatIndex],seatSnapshotRecord(item)]));
     const mismatch=classifyCurrentSeatOrderMismatch(order,records);
     throw Object.assign(new Error(`${seatId} 좌석이 현재 주문에 연결되어 있지 않습니다.`),{code:'seat/order-mismatch',forceEligible:mismatch.forceEligible});
    }
    if(acceptingDineIn&&seat.status!=='held')throw Object.assign(new Error(`${seatId} 좌석이 주문중 상태가 아닙니다.`),{code:'seat/not-held'});
    if(completingDineIn&&seat.status!=='occupied')throw Object.assign(new Error(`${seatId} 좌석이 사용중 상태가 아닙니다.`),{code:'seat/not-occupied'});
    if(seat.status==='reserved')throw Object.assign(new Error(`${seatId} 예약 좌석은 변경할 수 없습니다.`),{code:'seat/reserved'});
   });
   const reservationCancel=status==='cancelled'&&order.status==='reservation_pending'?{reservationLifecycleEnabled:false,reservationUpdatedAt:firebase.firestore.FieldValue.serverTimestamp(),reservationUpdatedBy:firebase.auth().currentUser?.uid||'admin'}:{};
   transaction.update(orderRef,{status,...reservationCancel,updatedAt:firebase.firestore.FieldValue.serverTimestamp()});
   const displayRef=order.orderType==='takeout'?db.collection('publicOrderDisplays').doc(id):null;
   if(order.orderType==='takeout'){
    if(['accepted','paid','cooking','ready'].includes(status)){
     const businessDay=orderBusinessDayKey(order);
     if(businessDay)transaction.set(displayRef,{
     orderNumber:String(order.customerNumber||order.orderNo||adminOrderNumberLabel(order)),
     ...displayIdentity(order),
     displayStatus:status==='ready'?'ready':'cooking',
     storeId:String(order.storeId||'pangyo2-techno-valley'),
     businessDay,
     updatedAt:firebase.firestore.FieldValue.serverTimestamp()
    },{merge:true});
    }else transaction.delete(displayRef);
   }
   if(acceptingDineIn)seatRefs.forEach(ref=>transaction.set(ref,{
    status:'occupied',heldBy:null,heldUntil:null,
    occupiedAt:firebase.firestore.FieldValue.serverTimestamp(),
    updatedAt:firebase.firestore.FieldValue.serverTimestamp()
   },{merge:true}));
   if(completingDineIn||(status==='cancelled'&&seatIds.length))seatRefs.forEach(ref=>transaction.set(ref,seatReleasePayload(),{merge:true}));
   committedOrder=order;
  });
  if((status==='accepted'&&committedOrder.orderType!=='takeout')||(status==='cooking'&&committedOrder.orderType==='takeout'))stopNewOrderRepeat();
  showAdminMessage(status==='accepted'&&committedOrder.orderType!=='takeout'?'좌석을 사용중으로 변경했습니다.':status==='completed'&&committedOrder.orderType==='takeout'?(pickupDisplayMissing?'픽업 완료했습니다. 고객 대기화면 문서는 이미 제거되어 있었습니다.':'픽업 완료로 처리했습니다.'):status==='completed'?'주문 완료와 좌석 해제를 처리했습니다.':'주문 상태가 변경되었습니다.');
  if(!['payment_pending','new'].includes(status))setTimeout(()=>{if(hasUnacceptedOrders())startNewOrderRepeat();else stopNewOrderRepeat()},300);
  if(status==='ready')enqueueAutomaticTakeoutCall(committedOrder);
  return true;
 }catch(error){
  console.error('상태 변경 실패',error);
  if(error.code==='seat/order-mismatch'&&error.forceEligible){openForceCompleteModal(orders.find(order=>String(order.id)===String(id)));return false}
  showAdminMessage(`상태 변경 실패 (${error.code||'unknown'}): ${error.message}`,true);
  return false;
 }finally{
  statusUpdateLocks.delete(id);
  if(button&&button.isConnected){button.disabled=false;button.textContent=originalText;button.removeAttribute('aria-busy')}
 }
}

if(typeof setInterval==='function')setInterval(()=>{if(receivedOrders.some(order=>order.orderType==='takeout'&&((order.status==='cooking'&&order.autoReadyEnabled===true)||order.status==='reservation_pending')))render()},15000);
const autoReadyCoordinator=createAutoReadyCoordinator({
 getCurrentOrder:id=>receivedOrders.find(order=>String(order.id)===String(id)),
 execute:async (order,{retry=false}={})=>{const result=await autoCompleteTakeoutTransaction({db,orderId:order.id,expectedReadyDueAt:order.readyDueAt,expectedPreparationStartedAt:order.preparationStartedAt,nowMillis:Date.now(),serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin',resolveBusinessDay:orderBusinessDayKey,...transitionAuditContext(retry?'takeout_auto_retry':'takeout_auto_ready')});enqueueAutomaticTakeoutCall(result.order);return result},
 onPermanentError:(error,order)=>{console.error('포장 주문 자동 완료 실패',error);showAdminMessage(`${adminOrderNumberLabel(order)}번 자동 조리완료 실패 (${error.code||'unknown'}): 수동 조리완료를 확인해 주세요.`,true)}
});
const autoReadyTimers=autoReadyCoordinator.timers,autoReadyLocks=autoReadyCoordinator.locks;
function runAutoReady(order){return autoReadyCoordinator.run(order)}
function reconcileAutoReadyOrders(list){autoReadyCoordinator.reconcile(list)}

function reservationCountdownLabel(order,now=Date.now()){
 const deadline=reservationPrepStartMillis(order);if(deadline===null)return '';
 const remaining=Math.max(0,deadline-now);if(remaining<60000)return remaining<=0?'곧 조리 시작':`${Math.ceil(remaining/1000)}초 남음`;
 const minutes=Math.ceil(remaining/60000);return minutes>=60?`${Math.floor(minutes/60)}시간 ${minutes%60}분 남음`:`${minutes}분 남음`;
}
async function executeReservationLifecycle(order,{catchUp=false}={}){const startedAt=Date.now(),result=await advanceReservationLifecycleTransaction({db,orderId:order.id,expectedLifecycleId:order.reservationLifecycleId,expectedPickupAt:order.pickup.pickupAt,nowMillis:startedAt,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin',resolveBusinessDay:orderBusinessDayKey,...transitionAuditContext(catchUp?'reservation_catch_up':'reservation_timer',startedAt)});if(result.announcement==='prep')enqueueSpeech('예약 주문 조리 시간입니다.');if(result.announcement==='ready')enqueueAutomaticTakeoutCall(result.order);return result}
const reservationLifecycleCoordinator=createReservationLifecycleCoordinator({getCurrentOrder:id=>receivedOrders.find(order=>String(order.id)===String(id)),execute:executeReservationLifecycle,onPermanentError:(error,order)=>showAdminMessage(`${adminOrderNumberLabel(order)}번 예약 자동 처리 실패 (${error.code||'unknown'}): 상태를 확인해 주세요.`,true)});
function reconcileReservationLifecycleOrders(list){reservationLifecycleCoordinator.reconcile(list)}

let reservationPaymentOrderId=null,reservationPaymentReturnFocus=null,reservationPaymentBusy=false;
const reservationPaymentModal=typeof document==='undefined'?null:document.getElementById('reservationPaymentModal');
function openReservationPaymentModal(order,trigger=document.activeElement){if(!order||!isReservationOrder(order)||reservationPickupMillis(order)===null||!['payment_pending','new'].includes(order.status))return false;reservationPaymentOrderId=order.id;reservationPaymentReturnFocus=trigger;reservationPaymentBusy=false;reservationPaymentModal.hidden=false;document.body.classList.add('reservation-payment-open');reservationPaymentModal.querySelector('[data-reservation-payment="prepaid"]')?.focus();return true}
function closeReservationPaymentModal(){if(reservationPaymentBusy||reservationPaymentModal?.hidden)return false;reservationPaymentModal.hidden=true;document.body.classList.remove('reservation-payment-open');reservationPaymentOrderId=null;const target=reservationPaymentReturnFocus;reservationPaymentReturnFocus=null;if(target?.isConnected)target.focus();return true}
async function confirmReservationPayment(type,button){if(reservationPaymentBusy||!reservationPaymentOrderId)return false;reservationPaymentBusy=true;button.disabled=true;try{const order=orderById(reservationPaymentOrderId);await startReservationLifecycleTransaction({db,orderId:order.id,paymentType:type,expectedPickupAt:order.pickup.pickupAt,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,timestampFromMillis:firebase.firestore.Timestamp.fromMillis,adminId:firebase.auth().currentUser?.uid||'admin'});reservationPaymentBusy=false;reservationPaymentModal.hidden=true;document.body.classList.remove('reservation-payment-open');reservationPaymentOrderId=null;reservationPaymentReturnFocus=null;stopNewOrderRepeat();showAdminMessage(type==='prepaid'?'결제완료 예약으로 등록했습니다.':'후결제 예약으로 등록했습니다.');return true}catch(error){reservationPaymentBusy=false;showAdminMessage(`예약 등록 실패 (${error.code||'unknown'}): ${error.message}`,true);return false}finally{button.disabled=false}}

let preparationOrderId=null,preparationMinutes=15,preparationReturnFocus=null,preparationBusy=false;
const preparationTimeModal=typeof document==='undefined'?null:document.getElementById('preparationTimeModal');
const preparationTimeValue=typeof document==='undefined'?null:document.getElementById('preparationTimeValue');
const decreasePreparationTime=typeof document==='undefined'?null:document.getElementById('decreasePreparationTime');
const increasePreparationTime=typeof document==='undefined'?null:document.getElementById('increasePreparationTime');
const confirmPreparationTime=typeof document==='undefined'?null:document.getElementById('confirmPreparationTime');
function syncPreparationTime(){preparationTimeValue.textContent=`${preparationMinutes}분`;decreasePreparationTime.disabled=preparationMinutes<=5;increasePreparationTime.disabled=preparationMinutes>=60}
function openPreparationTimeModal(order,trigger=document.activeElement){
 if(!order||order.orderType!=='takeout'||!['payment_pending','new'].includes(order.status))return false;
 preparationOrderId=order.id;preparationMinutes=15;preparationReturnFocus=trigger;preparationBusy=false;syncPreparationTime();preparationTimeModal.hidden=false;document.body.classList.add('preparation-time-open');decreasePreparationTime.focus();return true;
}
function closePreparationTimeModal({restoreFocus=true}={}){if(preparationBusy||preparationTimeModal?.hidden)return false;preparationTimeModal.hidden=true;document.body.classList.remove('preparation-time-open');preparationOrderId=null;if(restoreFocus&&preparationReturnFocus?.isConnected)preparationReturnFocus.focus();preparationReturnFocus=null;return true}
async function confirmPreparationStart(){
 if(preparationBusy||!preparationOrderId)return;
 preparationBusy=true;confirmPreparationTime.disabled=true;const original=confirmPreparationTime.textContent;confirmPreparationTime.textContent='처리 중…';
 try{await startTakeoutPreparationTransaction({db,orderId:preparationOrderId,preparationMinutes,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,timestampFromMillis:firebase.firestore.Timestamp.fromMillis,nowMillis:Date.now(),adminId:firebase.auth().currentUser?.uid||'admin',resolveBusinessDay:orderBusinessDayKey});preparationBusy=false;closePreparationTimeModal({restoreFocus:false});stopNewOrderRepeat();showAdminMessage('결제를 완료하고 조리를 시작했습니다.')}
 catch(error){preparationBusy=false;showAdminMessage(`조리 시작 실패 (${error.code||'unknown'}): ${error.message}`,true)}
 finally{confirmPreparationTime.disabled=false;confirmPreparationTime.textContent=original}
}

let forceCompleteOrderId=null,forceCompleteReturnFocus=null,forceCompleteBusy=false;
let takeoutCompleteOrderId=null,takeoutCompleteReturnFocus=null,takeoutCompleteBusy=false;
let takeoutPickupOrderId=null,takeoutPickupReturnFocus=null,takeoutPickupBusy=false;
const takeoutCompleteModal=typeof document==='undefined'?null:document.getElementById('takeoutCompleteModal');
const takeoutCompleteDescription=typeof document==='undefined'?null:document.getElementById('takeoutCompleteDescription');
const confirmTakeoutComplete=typeof document==='undefined'?null:document.getElementById('confirmTakeoutComplete');
const takeoutPickupModal=typeof document==='undefined'?null:document.getElementById('takeoutPickupModal');
const takeoutPickupDescription=typeof document==='undefined'?null:document.getElementById('takeoutPickupDescription');
const confirmTakeoutPickup=typeof document==='undefined'?null:document.getElementById('confirmTakeoutPickup');
function openTakeoutCompleteModal(order,trigger=document.activeElement){
 if(!order||order.orderType!=='takeout'||!['accepted','paid','cooking'].includes(order.status))return false;
 takeoutCompleteOrderId=order.id;takeoutCompleteReturnFocus=trigger;takeoutCompleteBusy=false;
 takeoutCompleteDescription.textContent=`주문번호 ${displayText(order.customerNumber||order.orderNo||adminOrderNumberLabel(order))}번 (${isCounterTakeout(order)?'대면 포장':'키오스크 포장'})을 포장 완료 처리하고 고객 화면에 안내합니다.`;
 takeoutCompleteModal.hidden=false;document.body.classList.add('takeout-complete-open');confirmTakeoutComplete.focus();return true;
}
function closeTakeoutCompleteModal(){
 if(takeoutCompleteBusy)return;takeoutCompleteModal.hidden=true;document.body.classList.remove('takeout-complete-open');
 const target=takeoutCompleteReturnFocus;takeoutCompleteOrderId=null;takeoutCompleteReturnFocus=null;if(target?.isConnected)target.focus();
}
async function completeTakeoutFromModal(){
 if(takeoutCompleteBusy||!takeoutCompleteOrderId)return;
 takeoutCompleteBusy=true;confirmTakeoutComplete.disabled=true;confirmTakeoutComplete.textContent='처리 중…';
 const success=await setStatus(takeoutCompleteOrderId,'ready',confirmTakeoutComplete);
 takeoutCompleteBusy=false;confirmTakeoutComplete.disabled=false;confirmTakeoutComplete.textContent='주문 완료';
 if(success){takeoutCompleteModal.hidden=true;document.body.classList.remove('takeout-complete-open');takeoutCompleteOrderId=null;takeoutCompleteReturnFocus=null}
}
function openTakeoutPickupModal(order,trigger=document.activeElement){
 if(!order||order.orderType!=='takeout'||order.status!=='ready')return false;
 takeoutPickupOrderId=order.id;takeoutPickupReturnFocus=trigger;takeoutPickupBusy=false;
 takeoutPickupDescription.textContent=`주문번호 ${displayText(order.customerNumber||order.orderNo||adminOrderNumberLabel(order))}번 (${isCounterTakeout(order)?'대면 포장':'키오스크 포장'})을 픽업 완료 처리하고 고객 대기화면에서 제거합니다.`;
 takeoutPickupModal.hidden=false;document.body.classList.add('takeout-pickup-open');confirmTakeoutPickup.focus();return true;
}
function closeTakeoutPickupModal(){
 if(takeoutPickupBusy)return;takeoutPickupModal.hidden=true;document.body.classList.remove('takeout-pickup-open');
 const target=takeoutPickupReturnFocus;takeoutPickupOrderId=null;takeoutPickupReturnFocus=null;if(target?.isConnected)target.focus();
}
async function completeTakeoutPickupFromModal(){
 if(takeoutPickupBusy||!takeoutPickupOrderId)return;
 takeoutPickupBusy=true;confirmTakeoutPickup.disabled=true;confirmTakeoutPickup.textContent='처리 중…';
 const success=await setStatus(takeoutPickupOrderId,'completed',confirmTakeoutPickup);
 takeoutPickupBusy=false;confirmTakeoutPickup.disabled=false;confirmTakeoutPickup.textContent='픽업 완료';
 if(success){takeoutPickupModal.hidden=true;document.body.classList.remove('takeout-pickup-open');takeoutPickupOrderId=null;takeoutPickupReturnFocus=null}
}
function seatStateDescription(record,orderId){
 if(!record?.exists)return '문서 누락 · orderId 없음';
 const owner=record.orderId?`orderId 있음 (${String(record.orderId)===String(orderId)?'현재 주문':'다른 주문'})`:'orderId 없음';
 return `${displayText(record.status)} · ${owner}${record.orderId&&String(record.orderId)!==String(orderId)?' · 다른 주문이 사용 중':''}`;
}
function closeForceCompleteModal(){
 if(forceCompleteBusy)return;
 forceCompleteModal.hidden=true;document.body.classList.remove('force-complete-open');
 const target=forceCompleteReturnFocus;forceCompleteOrderId=null;forceCompleteReturnFocus=null;forceCompleteCode.value='';forceCompleteError.textContent='';
 if(target?.isConnected)target.focus();
}
function syncForceCompleteConfirmation(){
 const order=orderById(forceCompleteOrderId),expected=forceConfirmationValue(order),matches=Boolean(expected)&&forceCompleteCode.value.trim()===expected;
 confirmForceComplete.disabled=forceCompleteBusy||!matches;confirmForceComplete.setAttribute('aria-disabled',String(confirmForceComplete.disabled));
}
function openForceCompleteModal(order,trigger=document.activeElement){
 if(!order||!classifyCurrentSeatOrderMismatch(order).forceEligible)return false;
 const expected=forceConfirmationValue(order);if(!expected){showAdminMessage('주문번호를 안전하게 확인할 수 없습니다. 상세 확인이 필요합니다.',true);return false}
 forceCompleteOrderId=order.id;forceCompleteReturnFocus=trigger;forceCompleteBusy=false;
 const mismatch=classifyCurrentSeatOrderMismatch(order),phone=displayText(order.phone||order.phoneMasked),savedSeats=orderSeatLabel(order);
 forceCompleteDetails.innerHTML=[['순번',adminOrderNumberLabel(order)],['주문번호',displayText(order.customerNumber||order.orderNo)],['주문시간',formatTime(order.createdAt||order.createdAtClient)],['전화번호',phone],['주문유형','매장식사'],['저장 좌석',savedSeats],['현재 주문 상태',displayText(order.status)],...mismatch.records.map(record=>[`현재 좌석 ${record.id}`,seatStateDescription(record,order.id)])].map(([term,value])=>`<div><dt>${esc(term)}</dt><dd>${esc(value)}</dd></div>`).join('');
 forceCompleteCode.value='';forceCompleteCodeHint.textContent=`화면의 주문번호 마지막 ${expected.length}자리 “${expected}”를 입력하세요.`;forceCompleteError.textContent='';
 forceCompleteModal.hidden=false;document.body.classList.add('force-complete-open');syncForceCompleteConfirmation();forceCompleteCode.focus();return true;
}
async function forceCompleteOrder(){
 const id=forceCompleteOrderId,localOrder=orderById(id),expected=forceConfirmationValue(localOrder);
 if(!id||forceCompleteBusy||!expected||forceCompleteCode.value.trim()!==expected)return false;
 forceCompleteBusy=true;forceCompleteError.textContent='';confirmForceComplete.textContent='처리 중…';confirmForceComplete.setAttribute('aria-busy','true');syncForceCompleteConfirmation();
 try{
  await forceCompleteTransaction({db,orderId:id,expectedStatus:localOrder.status,expectedConfirmation:expected,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp});
  forceCompleteBusy=false;closeForceCompleteModal();showAdminMessage('주문을 강제완료했습니다. 결제와 현재 좌석 상태는 변경하지 않았습니다.');return true;
 }catch(error){forceCompleteError.textContent=`강제완료 실패 (${error.code||'unknown'}): ${error.message}`;return false}
 finally{forceCompleteBusy=false;confirmForceComplete.textContent='강제완료 확인';confirmForceComplete.removeAttribute('aria-busy');syncForceCompleteConfirmation()}
}

function adminClockIsReliable(){
 if(typeof performance==='undefined')return true;
 return Math.abs((Date.now()-adminClockBaseline.wall)-(performance.now()-adminClockBaseline.monotonic))<5*60*1000;
}
function expiredSeatGroups(now=Date.now()){
 return findExpiredSeatGroups(seatDocuments,now);
}
async function releaseExpiredSeatGroup(group,now){
 const result=await releaseExpiredSeatGroupTransaction({db,group,now,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp});return result.released;
}
async function releaseExpiredSeats(){
 if(seatExpiryRunning||!adminAuthenticated||document.hidden)return 0;
 if(!adminClockIsReliable()){showAdminMessage('PC 시각 변경이 감지되어 좌석 자동 해제를 중단했습니다. Windows 시간 동기화를 확인해 주세요.',true);return 0}
 seatExpiryRunning=true;let released=0;const now=Date.now();
 try{for(const group of expiredSeatGroups(now)){try{released+=await releaseExpiredSeatGroup(group,now)}catch(error){if(error.code!=='seat/stale-expiry')console.error('만료 좌석 자동 해제 실패',error)}}if(released)showAdminMessage(`3시간이 지난 사용중 좌석 ${released}개를 빈자리로 변경했습니다.`);return released}
 finally{seatExpiryRunning=false}
}
function scheduleExpiredSeatRelease(){if(seatExpiryDebounce)clearTimeout(seatExpiryDebounce);seatExpiryDebounce=setTimeout(()=>{seatExpiryDebounce=null;releaseExpiredSeats()},350)}
function startExpiredSeatChecks(){if(!seatExpiryTimer)seatExpiryTimer=setInterval(releaseExpiredSeats,60000);scheduleExpiredSeatRelease()}

let orderDetailSourceSeatId=null;
let orderDetailReturnFocus=null;
let orderDetailOpenOrderId=null;
function orderById(id){return orders.find(order=>String(order.id)===String(id))}
function paymentStatusLabel(order){
 return displayText(order?.paymentStatus||order?.payment?.status,'저장 정보 없음');
}
function isReservationOrder(order){
 const mode=String(order?.pickup?.mode||'').trim().toLowerCase();
 return mode==='reserve'||(mode!=='now'&&Boolean(displayText(order?.pickup?.time,'')))||Boolean(order?.pickup?.pickupAt&&mode!=='now');
}
function reservationTimeLabel(order){
 if(!isReservationOrder(order))return '';
 const raw=order?.pickup?.pickupAt??order?.pickup?.time;
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
 const raw=order?.pickup?.pickupAt??order?.pickup?.time;
 if(typeof raw==='string'){
  const time=raw.trim().match(/^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if(time){
   const hour=Number(time[1]);
   return `${hour<12?'오전':'오후'} ${hour%12||12}:${time[2]}`;
  }
 }
 let value=null;
 if(typeof raw?.toDate==='function'){
  try{value=raw.toDate()}catch{return ''}
 }else if(Object.prototype.toString.call(raw)==='[object Date]')value=raw;
 if(Object.prototype.toString.call(value)!=='[object Date]')return '';
 let timestamp;
 try{timestamp=Date.prototype.getTime.call(value)}catch{return ''}
 if(!Number.isFinite(timestamp))return '';
 const parts=new Intl.DateTimeFormat('en-US',{
  timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',hourCycle:'h23'
 }).formatToParts(value).reduce((result,part)=>(result[part.type]=part.value,result),{});
 if(!parts.year||!parts.month||!parts.day||!parts.hour||!parts.minute)return '';
 const month=String(Number(parts.month)).padStart(2,'0');
 const day=String(Number(parts.day)).padStart(2,'0');
 const hour=Number(parts.hour);
 if(!Number.isInteger(hour)||hour<0||hour>23)return '';
 return `${parts.year}. ${month}. ${day}. ${hour<12?'오전':'오후'} ${hour%12||12}:${parts.minute}`;
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
 return `<div class="detail-fork-card"><span>일회용 포크</span>${disposablesStatusHTML(order?.disposables,'detail-fork-status')}</div>`;
}
const transitionSourceLabels={reservation_timer:'자동',reservation_catch_up:'재접속 자동',admin_manual_ready:'관리자 수동',admin_manual_pickup:'관리자 수동',admin_manual_cancel:'관리자 수동',takeout_auto_ready:'자동',takeout_auto_retry:'자동 재시도'};
function transitionDelayLabel(entry){const actual=orderTimeMillis(entry?.transitionedAt),expected=orderTimeMillis(entry?.expectedTransitionAt);if(actual===null||expected===null)return '예정 대비 확인 불가';const seconds=Math.round((actual-expected)/1000);if(seconds===0)return '예정 시각과 동일';const amount=Math.abs(seconds),value=amount>=60?`${Math.floor(amount/60)}분 ${amount%60}초`:`${amount}초`;return seconds>0?`${value} 지연`:`${value} 조기`}
function lifecycleAuditHTML(entries){const heading='<h3>상태 변경 기록</h3>';if(!entries.length)return `${heading}<p class="lifecycle-audit-empty">이 주문은 상태 변경 감사기록 도입 이전 주문입니다.</p>`;return `${heading}<ol class="lifecycle-audit-list">${entries.map(entry=>`<li><time>${formatTime(entry.transitionedAt)}</time><strong>${esc(displayText(statusNames[entry.fromStatus],entry.fromStatus))} → ${esc(displayText(statusNames[entry.toStatus],entry.toStatus))}</strong><span>${esc(transitionSourceLabels[entry.transitionSource]||entry.transitionSource)}</span><small>처리 관리자 ${esc(displayText(entry.actorUid))}</small><small>예정 ${formatTime(entry.expectedTransitionAt)} · ${esc(transitionDelayLabel(entry))}</small></li>`).join('')}</ol>`}
async function loadLifecycleAudit(orderId){const panel=orderDetailContent?.querySelector(`[data-lifecycle-audit-order="${CSS.escape(String(orderId))}"]`);if(!panel)return;try{const snapshot=await db.collection('orders').doc(String(orderId)).collection('lifecycleAudit').orderBy('transitionedAt','asc').get(),entries=snapshot.docs.map(doc=>({id:doc.id,...doc.data()}));if(panel.isConnected&&orderDetailOpenOrderId===String(orderId))panel.innerHTML=lifecycleAuditHTML(entries)}catch(error){console.error('상태 변경 감사기록 조회 실패',error);if(panel.isConnected)panel.innerHTML='<p class="lifecycle-audit-error">상태 변경 기록을 불러오지 못했습니다.</p>'}}
function renderOrderDetail(order,seatId=null){
 const takeout=order.orderType==='takeout';
 const seatLabel=takeout?'-':displayText(orderSeatLabel(order));
 const reservation=isReservationOrder(order);
 const {original,discount,paid}=safeAmounts(order);
 const customerName=adminCustomerName(order),customer=customerName||displayText(order.phone||order.phoneMasked),customerLabel=customerName?'고객명':'연락처';
 const party=Number(order.partySize)>0?`${Number(order.partySize)}인`:'-';
 const completed=['ready','completed'].includes(order.status);
 const reservationValue=reservationDetailValue(order);
 const reservationStatus=reservationStatusLabel(order),reservationPayment=reservationPaymentLabel(order);
 const paymentMethod=displayText(order?.payment?.methodName||order?.payment?.method),mealTicketHighlight=mealTicketHighlightHTML(order,paid);
 return `<div class="admin-detail-screen">
 <div class="admin-detail-topbar">
  <div class="detail-order-identity">${reservation?'<span class="detail-reservation">예약</span>':''}<strong>${esc(adminOrderNumberLabel(order))}</strong><span class="detail-order-type ${takeout?'takeout':'dinein'}">${takeout?'포장':'매장식사'}</span></div>
  <div class="detail-top-card"><span>인원</span><strong>${party}</strong></div>
  <div class="detail-top-card seat"><span>좌석</span><strong>${esc(seatLabel)}</strong></div>
  <div class="detail-top-card phone"><span>${customerLabel}</span><strong>${esc(customer)}</strong>${!customerName&&customer!=='-'?`<button type="button" data-action="copy-phone" data-phone="${esc(customer)}">복사</button>`:''}</div>
  <div class="detail-top-card paid"><span>결제금액</span><strong>${money(paid)}</strong></div>
  ${reservation?`<div class="detail-reservation-time"><span>예약주문</span><strong><small>예약시간</small>${esc(reservationValue||'확인 필요')}<small>예약상태</small>${esc(reservationStatus||'확인 필요')}<small>결제유형</small>${esc(reservationPayment||'확인 필요')}</strong></div>`:''}
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
   <button type="button" class="detail-customer-call" data-action="call-customer" ${customerCallDataAttributes(order)}>📣 고객 호출</button>
   ${mealTicketHighlight}
   ${reservation?`<section class="lifecycle-audit" data-lifecycle-audit-order="${esc(order.id)}"><h3>상태 변경 기록</h3><p>기록을 불러오는 중…</p></section>`:''}
  </div>
 </div>
 ${seatId?`<div class="order-detail-seat-actions"><button type="button" data-action="clear-seat" data-seat-id="${esc(seatId)}">이 테이블 빈자리로 변경</button></div>`:''}
 </div>`;
}
function showOrderDetail(order,seatId=null,trigger=null){
 if(!order||!orderDetailModal||!orderDetailContent)return false;
 orderDetailSourceSeatId=seatId;
 orderDetailOpenOrderId=String(order.id);
 orderDetailReturnFocus=trigger||document.activeElement;
 orderDetailContent.innerHTML=renderOrderDetail(order,seatId);
 document.getElementById('orderDetailTitle').textContent=`${adminOrderNumberLabel(order)}번 · ${order.orderType==='takeout'?'포장':'먹고 가기'}`;
 orderDetailModal.hidden=false;
 document.body.classList.add('order-detail-open');
 closeOrderDetailButton?.focus();
 if(isReservationOrder(order))loadLifecycleAudit(order.id);
 return true;
}
function closeOrderDetail(){
 if(!orderDetailModal||orderDetailModal.hidden)return;
 const currentRow=orderDetailOpenOrderId?orderList.querySelector(`[data-order-id="${CSS.escape(orderDetailOpenOrderId)}"].central-order-row`):null;
 orderDetailModal.hidden=true;orderDetailContent.innerHTML='';orderDetailSourceSeatId=null;
 orderDetailOpenOrderId=null;document.body.classList.remove('order-detail-open');
 if(orderDetailReturnFocus?.isConnected)orderDetailReturnFocus.focus();else if(currentRow?.isConnected)currentRow.focus();
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
  if(trigger?.classList.contains('central-order-row')){
   selectedCentralOrderId=trigger.dataset.orderId;syncCentralOrderSelection(trigger);
  }else if(trigger&&document.getElementById('ordersPanel').contains(trigger))openOrderDetail(trigger.dataset.orderId,trigger);
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
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{await callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage,button.dataset.customerName,button.dataset.customerIdentityType)}finally{if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy')}}
  return;
 }
 if(action==='set-status'){
  if(button.dataset.confirm&&!confirm(button.dataset.confirm))return;
  await setStatus(button.dataset.orderId,button.dataset.status,button);
  return;
 }
 if(action==='select-preparation-time'){openPreparationTimeModal(orderById(button.dataset.orderId),button);return}
 if(action==='select-reservation-payment'){openReservationPaymentModal(orderById(button.dataset.orderId),button);return}
 if(action==='confirm-takeout-complete'){openTakeoutCompleteModal(orderById(button.dataset.orderId),button);return}
 if(action==='confirm-takeout-pickup'){openTakeoutPickupModal(orderById(button.dataset.orderId),button);return}
 if(action==='force-complete'){openForceCompleteModal(orderById(button.dataset.orderId),button);return}
 if(action==='set-manual-status'){
  await setManualCustomerCallStatus(button.dataset.callId,button.dataset.status,button);
  return;
 }
 if(action==='open-seat-order'){
  openSeatOrderDetail(button.dataset.seatId,button);
  return;
 }
 if(action==='recover-orphan-hold'){
  await recoverOverviewOrphanHold(button.dataset.seatId,button);
  return;
 }
 if(action==='transition-seat'){
  await transitionOverviewSeat(button.dataset.seatId,button.dataset.seatFrom,button.dataset.seatTo,button);
  return;
 }
 if(action==='clear-seat'){
  await clearSeat(button.dataset.seatId,button);
 }
});
document.getElementById('ordersPanel')?.addEventListener('dblclick',event=>{
 if(event.target.closest('button[data-action]'))return;
 const trigger=event.target.closest('.central-order-row[data-order-id]');
 if(trigger)openOrderDetail(trigger.dataset.orderId,trigger);
});
document.getElementById('ordersPanel')?.addEventListener('keydown',event=>{
 if(!['Enter',' '].includes(event.key)||event.target.closest('button[data-action]'))return;
 const trigger=event.target.closest('[data-order-id].order-detail-trigger');
 if(!trigger)return;
 event.preventDefault();openOrderDetail(trigger.dataset.orderId,trigger);
});
closeOrderDetailButton?.addEventListener('click',closeOrderDetail);
decreasePreparationTime?.addEventListener('click',()=>{preparationMinutes=Math.max(5,preparationMinutes-5);syncPreparationTime()});
increasePreparationTime?.addEventListener('click',()=>{preparationMinutes=Math.min(60,preparationMinutes+5);syncPreparationTime()});
document.getElementById('cancelPreparationTime')?.addEventListener('click',()=>closePreparationTimeModal());
confirmPreparationTime?.addEventListener('click',confirmPreparationStart);
preparationTimeModal?.addEventListener('keydown',event=>{
 if(event.key==='Escape'){event.preventDefault();closePreparationTimeModal();return}
 if(event.key!=='Tab')return;
 const focusable=Array.from(preparationTimeModal.querySelectorAll('button:not(:disabled)')),first=focusable[0],last=focusable[focusable.length-1];
 if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
});
reservationPaymentModal?.addEventListener('click',event=>{const choice=event.target.closest('[data-reservation-payment]');if(choice){event.preventDefault();confirmReservationPayment(choice.dataset.reservationPayment,choice);return}if(event.target===reservationPaymentModal)closeReservationPaymentModal()});
reservationPaymentModal?.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();closeReservationPaymentModal();return}if(event.key!=='Tab')return;const focusable=Array.from(reservationPaymentModal.querySelectorAll('button:not(:disabled)')),first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}});
document.getElementById('cancelReservationPayment')?.addEventListener('click',closeReservationPaymentModal);
confirmTakeoutComplete?.addEventListener('click',completeTakeoutFromModal);
document.getElementById('cancelTakeoutComplete')?.addEventListener('click',closeTakeoutCompleteModal);
takeoutCompleteModal?.addEventListener('click',event=>{if(event.target===takeoutCompleteModal)closeTakeoutCompleteModal()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!takeoutCompleteModal?.hidden){event.preventDefault();closeTakeoutCompleteModal()}});
confirmTakeoutPickup?.addEventListener('click',completeTakeoutPickupFromModal);
document.getElementById('cancelTakeoutPickup')?.addEventListener('click',closeTakeoutPickupModal);
takeoutPickupModal?.addEventListener('click',event=>{if(event.target===takeoutPickupModal)closeTakeoutPickupModal()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!takeoutPickupModal?.hidden){event.preventDefault();closeTakeoutPickupModal()}});
forceCompleteCode?.addEventListener('input',syncForceCompleteConfirmation);
confirmForceComplete?.addEventListener('click',forceCompleteOrder);
closeForceCompleteButton?.addEventListener('click',closeForceCompleteModal);
cancelForceCompleteButton?.addEventListener('click',closeForceCompleteModal);
forceCompleteModal?.addEventListener('click',event=>{if(event.target===forceCompleteModal)closeForceCompleteModal()});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!forceCompleteModal?.hidden){event.preventDefault();closeForceCompleteModal()}});
window.addEventListener('focus',scheduleExpiredSeatRelease);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleExpiredSeatRelease()});
window.addEventListener('beforeunload',()=>{if(seatExpiryTimer)clearInterval(seatExpiryTimer);if(seatExpiryDebounce)clearTimeout(seatExpiryDebounce)});
selectedOrderDetail?.addEventListener('click',()=>{const trigger=syncCentralOrderSelection();if(trigger)openOrderDetail(selectedCentralOrderId,trigger)});
orderPagination?.addEventListener('click',event=>{const button=event.target.closest('button[data-order-page]');if(!button||button.disabled)return;centralOrderPage=Number(button.dataset.orderPage)||1;renderCentralOrderList()});
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
  button.disabled=true;button.setAttribute('aria-busy','true');
  try{await callCustomer(button.dataset.orderNo||'',button.dataset.orderLanguage,button.dataset.customerName,button.dataset.customerIdentityType)}finally{if(button.isConnected){button.disabled=false;button.removeAttribute('aria-busy')}}
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
 const expected=normalizeAdminSeatStatus(seatDocuments[id]?.status);
 if(!['occupied','reserved'].includes(expected))return false;
 return transitionOverviewSeat(id,expected,'empty',button);
}

async function transitionOverviewSeat(id,expected,target,button){
 const lockId=`seat:${id}`,seat=ADMIN_SEATS.find(item=>item.id===id),metadata=getAdminSeatActions(expected).find(action=>action.target===target);
 if(!seat||!metadata||statusUpdateLocks.has(lockId)||!confirm(metadata.confirmation))return false;
 statusUpdateLocks.add(lockId);pendingAdminSeatTargets.set(id,target);renderSeatOverview();
 try{
  await transitionAdminSeatState({db,seatId:id,expectedStatus:expected,targetStatus:target,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,supportedSeatIds:ADMIN_SEATS.map(item=>item.id)});
  return true;
 }catch(error){
  pendingAdminSeatTargets.delete(id);statusUpdateLocks.delete(lockId);renderSeatOverview();console.error('좌석 상태 변경 실패',error);showAdminMessage(error.message||'좌석 상태를 변경하지 못했습니다.',true);return false;
 }
}
async function recoverOverviewOrphanHold(id,button){
 const lockId=`seat:${id}`,seat=ADMIN_SEATS.find(item=>item.id===id),current=seatDocuments[id];
 if(!seat||!current||statusUpdateLocks.has(lockId)||!orphanHeldSeatState(current).recoverable)return false;
 if(!confirm(`${seat.name}은 주문과 연결되지 않은 만료 좌석입니다. transaction으로 다시 확인한 뒤 강제 빈자리로 변경할까요?`))return false;
 statusUpdateLocks.add(lockId);pendingAdminSeatTargets.set(id,'empty');renderSeatOverview();
 try{
  await recoverOrphanHeldSeatTransaction({db,seatId:id,expectedHeldBy:current.heldBy,expectedHeldUntil:current.heldUntil,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin',activeSessionRefs:[db.collection('runtimeControls').doc(MANUAL_CALL_STORE_ID).collection('kiosks').doc('mobile-01')]});
  showAdminMessage(`${seat.name}의 주문 없는 만료 hold를 빈자리로 복구했습니다.`);return true
 }catch(error){pendingAdminSeatTargets.delete(id);statusUpdateLocks.delete(lockId);renderSeatOverview();showAdminMessage(error.message||'좌석을 복구하지 못했습니다.',true);return false}
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
const automaticallyCalledTakeoutOrders=new Set();
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
 if(['vi','vi-vn'].includes(normalized))return 'vi';
 return 'ko'
}
function safeCustomerCallName(value){return String(value??'').replace(/[\u0000-\u001f\u007f-\u009f]/gu,'').replace(/<[^>]*>/gu,'').replace(/\s+/gu,' ').trim().slice(0,80)}
function customerCallSpeech(orderNo,language,customerDisplayName,identityType){
 const normalized=customerCallLanguage(language);
 const name=identityType==='name'?safeCustomerCallName(customerDisplayName):'';
 const number=spokenOrderNumber(orderNo);
 const koreanNumber=spokenKoreanOrderNumber(orderNo);
 if(!name&&(!String(number).match(/\d/)||!koreanNumber))return null;
 const speech={
  ko:{lang:'ko-KR',text:`${koreanNumber} 번 고객님, 주문하신 메뉴가 준비되었습니다. 카운터에서 받아가 주세요.`},
  en:{lang:'en-US',text:name?`${name}, your order is ready. Please come to the counter.`:`Customer number ${number}, your order is ready. Please come to the counter.`},
  es:{lang:'es-ES',text:name?`${name}, su pedido está listo. Por favor, acérquese al mostrador.`:`Cliente número ${number}, su pedido está listo. Por favor, acérquese al mostrador.`},
  ja:{lang:'ja-JP',text:name?`${name}様、ご注文の商品ができあがりました。カウンターまでお越しください。`:`お客様番号${number}番、ご注文の商品ができあがりました。カウンターまでお越しください。`},
  zh:{lang:'zh-CN',text:name?`${name}，您的餐品已经准备好了，请到柜台取餐。`:`号码为${number}的顾客，您的餐品已经准备好了，请到柜台取餐。`},
  vi:{lang:'vi-VN',text:name?`${name}, món ăn của quý khách đã sẵn sàng. Vui lòng nhận tại quầy.`:`Khách hàng số ${number}, món ăn của quý khách đã sẵn sàng. Vui lòng nhận tại quầy.`}
 }[normalized];
 return {...speech,voicePrefix:normalized}
}
async function speakCustomerCall(orderNo,language,customerDisplayName,identityType){
 if(!soundEnabled||!settings.voice||!('speechSynthesis'in window))return;
 const preparedVoice=await prepareAdminCustomerCallVoice().catch(()=>null);
 return new Promise(resolve=>{
  const speech=customerCallSpeech(orderNo,language,customerDisplayName,identityType);
  if(!speech){resolve();return}
  const utterance=PJSpeech.createSpeechUtterance(speech.text,{lang:speech.lang});
  if(speech.lang==='ko-KR'&&preparedVoice)utterance.voice=preparedVoice;
  Object.assign(utterance,ADMIN_CALL_SPEECH_SETTINGS);
  if(speech.lang==='ko-KR')console.info('[Admin customer call voice]',{voiceName:utterance.voice?.name||'browser default',lang:utterance.voice?.lang||utterance.lang,localService:utterance.voice?.localService??null,rate:utterance.rate,pitch:utterance.pitch,orderNumber:spokenOrderNumber(orderNo),spokenText:speech.text});
  utterance.onend=resolve;utterance.onerror=resolve;
  window.speechSynthesis.speak(utterance);
 });
}
async function performCustomerCall(orderNo,language,customerDisplayName,identityType){await playPreset('cafe');await wait(720);await speakCustomerCall(orderNo,language,customerDisplayName,identityType)}
function enqueueCustomerCall(orderNo,language,customerDisplayName,identityType){speechQueue=speechQueue.then(()=>performCustomerCall(orderNo,language,customerDisplayName,identityType)).catch(()=>{console.error('고객 호출 음성 재생 실패')});return speechQueue}
function enqueueAutomaticTakeoutCall(order){
 const id=String(order?.id||'');
 if(!id||order?.orderType!=='takeout'||order?.status!=='cooking'||automaticallyCalledTakeoutOrders.has(id))return false;
 automaticallyCalledTakeoutOrders.add(id);enqueueCustomerCall(order.customerNumber||order.orderNo||'',order.language,order.customerDisplayName,order.customerIdentityType);return true;
}
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
function callCustomer(orderNo,language,customerDisplayName,identityType){return enqueueCustomerCall(orderNo,language,customerDisplayName,identityType)}
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
document.getElementById('filters')?.addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;activeFilter=b.dataset.filter;document.querySelectorAll('.filters button').forEach(x=>x.classList.toggle('active',x===b));render()});



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
   <div><strong>${esc(ADMIN_SEAT_NAMES[w.seatId]||normalizeLegacySeatLabel(w.seatName)||'좌석')}</strong><span>대기 ${w.queueNo||'-'}번 · ${w.partySize||1}명 · ${w.phoneMasked||''}</span></div>
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
