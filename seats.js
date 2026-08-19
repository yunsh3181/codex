const master=[
 {id:'papa-2',zone:'papa',name:'2인석',displayName:'커플석',capacity:2},{id:'papa-bar4',zone:'papa',name:'4인 바테이블',displayName:'바테이블',capacity:4},
 {id:'outdoor-1',zone:'outdoor',name:'야외석 1번',displayName:'야외석1',capacity:4},{id:'outdoor-2',zone:'outdoor',name:'야외석 2번',displayName:'야외석2',capacity:4},{id:'outdoor-3',zone:'outdoor',name:'야외석 3번',displayName:'야외석3',capacity:4},{id:'outdoor-4',zone:'outdoor',name:'야외석 4번',displayName:'야외석4',capacity:4},
 {id:'annex-1',zone:'annex',name:'별관 1번',displayName:'별관1',capacity:2},{id:'annex-2',zone:'annex',name:'별관 2번',displayName:'별관2',capacity:4},{id:'annex-3',zone:'annex',name:'별관 3번',displayName:'별관3',capacity:4},{id:'annex-4',zone:'annex',name:'별관 4번',displayName:'별관4',capacity:2},
 {id:'room-1',zone:'room',name:'룸테이블 1',displayName:'룸1',capacity:4},{id:'room-2',zone:'room',name:'룸테이블 2',displayName:'룸2',capacity:4},{id:'room-3',zone:'room',name:'룸테이블 3',displayName:'룸3',capacity:4}
];
const {SLOT_COUNT,SEAT_IDS,copyDefault,validatePositions,moveSeat,slotEntries}=window.PJSeatLayout;
const seatLayoutRef=db.collection('adminSettings').doc('seatLayout');
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
const {ADMIN_SEAT_STATUSES,normalizeAdminSeatStatus,getAdminSeatActions,transitionAdminSeatState,orphanHeldSeatState,recoverOrphanHeldSeatTransaction}=PJAdminOperations;
const statusNames=Object.fromEntries(Object.entries(ADMIN_SEAT_STATUSES).map(([key,value])=>[key,value.label]));
const statusIcons={empty:'🟢',held:'🟡',occupied:'🔴',reserved:'🟣',unknown:'⚪'};
let docs={};let waitDocs=[];
let savedPositions=copyDefault(),draftPositions=copyDefault(),layoutRevision=0,editBaseRevision=null,layoutEditing=false,layoutSaving=false,layoutNeedsRecovery=false,remoteLayoutChanged=false,layoutWarning='',layoutWarningSticky=false,draggedSeatId=null,dragTargetSlot=null,unsubscribeSeatLayout=null;
let pendingOccupancySeatId=null;
let pendingOccupiedSeatId=null;
const pendingSeatActions=new Set();
const pendingSeatTargets=new Map();
const bottlePolicy=window.PJ_BOTTLE_SEAT_POLICY||{SUPPORTED_END_YEAR:9999,isBottleSeat:()=>false,getBottleSeatAvailability:()=>({available:true,reason:'open'}),millisecondsUntilNextBoundary:()=>86400000};let bottlePolicyTimer=null;
function bottleAvailability(){return bottlePolicy.getBottleSeatAvailability(new Date())}
function bottleActionAllowed(id){return !bottlePolicy.isBottleSeat(id)||bottleAvailability().available}
function bottleAdminReason(){const reason=bottleAvailability().reason;return reason==='holiday'?'공휴일 이용 불가':reason==='weekend'?'주말 이용 불가':reason==='unsupported-year'?'공휴일 데이터 갱신 필요':'운영시간 외'}
function toDate(value){if(!value)return null;if(typeof value.toDate==='function')return value.toDate();const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function normalizedSeatStatus(status){return normalizeAdminSeatStatus(status)}
function positionsEqual(a,b){return SEAT_IDS.every(id=>a[id]===b[id])}
function layoutDirty(){return layoutEditing&&(layoutNeedsRecovery||!positionsEqual(savedPositions,draftPositions))}
function setLayoutNotice(message,error=false){const notice=document.getElementById('seatLayoutNotice');if(!notice)return;notice.hidden=!message;notice.textContent=message||'';notice.className=`seat-layout-notice${error?' error':''}`}
function renderLayoutControls(){
 const edit=document.getElementById('editSeatLayout'),save=document.getElementById('saveSeatLayout'),reload=document.getElementById('reloadSeatLayout'),cancel=document.getElementById('cancelSeatLayout'),reset=document.getElementById('resetSeatLayout');
 if(!edit)return;edit.hidden=layoutEditing;save.hidden=cancel.hidden=reset.hidden=!layoutEditing;reload.hidden=!(remoteLayoutChanged||layoutWarningSticky&&Number.isInteger(layoutRevision)&&layoutRevision>=0);save.disabled=layoutSaving||!layoutDirty()||!Number.isInteger(editBaseRevision)||editBaseRevision<0;cancel.disabled=reset.disabled=reload.disabled=layoutSaving;
 document.body.classList.toggle('seat-layout-editing',layoutEditing);setLayoutNotice(layoutWarning||(!layoutEditing?'':layoutDirty()?'저장되지 않은 좌석 배열 변경이 있습니다.':'좌석을 드래그하거나 이동 핸들에서 방향키를 사용하세요.'),Boolean(layoutWarning));
}
function startLayoutEdit(){if(layoutSaving)return;closeOccupancyDialog();closeOccupiedSeatDialog();layoutEditing=true;editBaseRevision=layoutRevision;draftPositions={...savedPositions};remoteLayoutChanged=false;if(layoutWarningSticky&&Number.isInteger(layoutRevision)&&layoutRevision>=0){layoutWarning='';layoutWarningSticky=false}render();document.querySelector('[data-seat-move-handle]')?.focus()}
function cancelLayoutEdit(){if(layoutSaving)return;draftPositions={...savedPositions};layoutEditing=false;editBaseRevision=null;remoteLayoutChanged=false;draggedSeatId=null;render();document.getElementById('editSeatLayout')?.focus()}
function reloadLatestLayout(){if(layoutSaving||!Number.isInteger(layoutRevision)||layoutRevision<0)return;if(!layoutEditing){layoutWarning='';layoutWarningSticky=false;startLayoutEdit();return}draftPositions={...savedPositions};editBaseRevision=layoutRevision;remoteLayoutChanged=false;layoutWarning=layoutNeedsRecovery?'저장된 좌석 배열이 손상되어 기본 배열로 표시합니다. 기본 배열을 저장해 복구할 수 있습니다.':'';layoutWarningSticky=false;render();document.querySelector('[data-seat-move-handle]')?.focus()}
function resetLayoutDraft(){if(!layoutEditing||layoutSaving||!confirm('요청된 기본 좌석 배열을 편집 화면에 적용할까요? 저장 버튼을 눌러야 서버에 반영됩니다.'))return;draftPositions=copyDefault();render();document.getElementById('saveSeatLayout')?.focus()}
function applyDraftMove(seatId,targetSlot){if(!layoutEditing||layoutSaving)return false;const moved=moveSeat(draftPositions,seatId,targetSlot);if(!moved)return false;draftPositions=moved;render();return true}
async function saveLayout(){
 if(!layoutEditing||layoutSaving||!layoutDirty())return false;
 const checked=validatePositions(draftPositions);if(!checked.valid){setLayoutNotice(checked.reason,true);return false}
 layoutSaving=true;renderLayoutControls();
 try{
  const expectedRevision=editBaseRevision,nextPositions={...checked.positions},uid=firebase.auth().currentUser?.uid;
  if(!Number.isInteger(expectedRevision)||expectedRevision<0)throw new Error('SEAT_LAYOUT_REVISION_INVALID');
  if(!uid)throw new Error('ADMIN_AUTH_REQUIRED');
  await db.runTransaction(async transaction=>{
   const snapshot=await transaction.get(seatLayoutRef),currentRevision=snapshot.exists?snapshot.data().revision:0;
   if(currentRevision!==expectedRevision)throw new Error('SEAT_LAYOUT_STALE');
   transaction.set(seatLayoutRef,{positions:nextPositions,revision:expectedRevision+1,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:uid});
  });
  savedPositions=nextPositions;draftPositions={...nextPositions};layoutRevision=expectedRevision+1;editBaseRevision=null;layoutEditing=false;layoutNeedsRecovery=false;remoteLayoutChanged=false;layoutWarning='';layoutWarningSticky=false;render();document.getElementById('editSeatLayout')?.focus();return true;
 }catch(error){
  if(error?.message==='SEAT_LAYOUT_STALE'){layoutWarning='다른 관리자가 먼저 저장했습니다. 최신 배열을 다시 불러온 뒤 수정해 주세요.';layoutWarningSticky=true;layoutEditing=false;editBaseRevision=null;remoteLayoutChanged=false;draftPositions={...savedPositions}}
  else if(error?.message==='SEAT_LAYOUT_REVISION_INVALID'){layoutWarning='배열 설정 문서의 revision 확인이 필요합니다. 저장할 수 없습니다.';layoutWarningSticky=true}
  else layoutWarning='좌석 배열을 저장하지 못했습니다. 다시 시도해 주세요.';
  render();return false;
 }finally{layoutSaving=false;renderLayoutControls()}
}
function applyLayoutSnapshot(snapshot){
 if(!snapshot.exists){savedPositions=copyDefault();layoutRevision=0;layoutNeedsRecovery=false;if(layoutEditing){remoteLayoutChanged=editBaseRevision!==0;if(remoteLayoutChanged)layoutWarning='다른 관리자가 좌석 배열을 변경했습니다. 현재 편집 내용은 저장할 수 없습니다.'}else{draftPositions={...savedPositions};if(!layoutWarningSticky)layoutWarning=''}render();return}
 const data=snapshot.data(),revisionValid=Number.isInteger(data.revision)&&data.revision>=1,checked=validatePositions(data.positions);
 if(!revisionValid){savedPositions=copyDefault();layoutRevision=null;layoutNeedsRecovery=true;layoutWarning='배열 설정 문서의 revision 확인이 필요합니다. 저장할 수 없습니다.';layoutWarningSticky=true;if(!layoutEditing)draftPositions={...savedPositions};else remoteLayoutChanged=true;render();return}
 layoutRevision=data.revision;
 if(!checked.valid){savedPositions=copyDefault();layoutNeedsRecovery=true;layoutWarning='저장된 좌석 배열이 손상되어 기본 배열로 표시합니다. 기본 배열을 저장해 복구할 수 있습니다.';layoutWarningSticky=false;if(!layoutEditing)draftPositions={...savedPositions};else if(layoutRevision!==editBaseRevision)remoteLayoutChanged=true;render();return}
 savedPositions=checked.positions;layoutNeedsRecovery=false;if(layoutEditing){if(layoutRevision!==editBaseRevision){remoteLayoutChanged=true;layoutWarning='다른 관리자가 좌석 배열을 변경했습니다. 현재 편집 내용은 저장할 수 없습니다.'}}else{draftPositions={...savedPositions};if(!layoutWarningSticky)layoutWarning=''}render();
}
function seatData(s){const remote=docs[s.id]||{};return {...s,...remote,status:normalizedSeatStatus(remote.status)};}
function elapsed(ts){const d=toDate(ts);if(!d)return '';const min=Math.max(0,Math.floor((Date.now()-d.getTime())/60000));return min<60?`${min}분`:`${Math.floor(min/60)}시간 ${min%60}분`;}
function reservationForm(s){const existing=docs[s.id]||{};const dt=toDate(existing.reservationAt);const defaultDate=dt?new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16):'';const name=prompt(`${s.name} 예약자명`,existing.reservationName||'');if(name===null)return null;const people=prompt('예약 인원',existing.reservationPartySize||Math.min(s.capacity,2));if(people===null)return null;const time=prompt('예약 일시 (예: 2026-07-16 18:30)',defaultDate.replace('T',' '));if(time===null)return null;const phone=prompt('전화번호 (선택)',existing.reservationPhone||'');if(phone===null)return null;const parsed=new Date(time.replace(' ','T'));if(Number.isNaN(parsed.getTime())){alert('예약 일시를 정확히 입력해 주세요.');return null;}return {reservationName:name.trim(),reservationPartySize:Number(people||0),reservationAt:firebase.firestore.Timestamp.fromDate(parsed),reservationPhone:phone.trim()};}
function occupancyDialog(){return document.getElementById('seatOccupancyDialog')}
function closeOccupancyDialog(){pendingOccupancySeatId=null;occupancyDialog()?.close()}
function requestManualOccupancy(id){if(!bottleActionAllowed(id))return;pendingOccupancySeatId=id;occupancyDialog()?.showModal()}
async function confirmManualOccupancy(){const id=pendingOccupancySeatId;if(!id)return;closeOccupancyDialog();await runSeatAction(id,'empty','occupied')}
function occupiedSeatDialog(){return document.getElementById('occupiedSeatDialog')}
function closeOccupiedSeatDialog(){pendingOccupiedSeatId=null;occupiedSeatDialog()?.close()}
function requestOccupiedSeatAction(id){pendingOccupiedSeatId=id;occupiedSeatDialog()?.showModal()}
function openOccupiedSeatOrder(){const id=pendingOccupiedSeatId;if(!master.some(seat=>seat.id===id))return;closeOccupiedSeatDialog();location.assign(`../admin/?seatId=${encodeURIComponent(id)}`)}
function openHeldSeatOrder(id){if(master.some(seat=>seat.id===id)&&normalizedSeatStatus(docs[id]?.status)==='held'&&docs[id]?.orderId)location.assign(`../admin/?seatId=${encodeURIComponent(id)}`)}
async function clearOccupiedSeat(){const id=pendingOccupiedSeatId;if(!master.some(seat=>seat.id===id))return;closeOccupiedSeatDialog();await runSeatAction(id,'occupied','empty')}
async function manageSeat(){}
async function bulkAction(){if(!layoutEditing)alert('좌석별 상태 버튼을 사용해 주세요.');}
async function runSeatAction(id,expected,target){
 if(layoutEditing||pendingSeatActions.has(id))return;const metadata=getAdminSeatActions(expected).find(action=>action.target===target);if(!metadata||!confirm(metadata.confirmation))return;
 pendingSeatActions.add(id);pendingSeatTargets.set(id,target);render();
 try{await transitionAdminSeatState({db,seatId:id,expectedStatus:expected,targetStatus:target,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,supportedSeatIds:master.map(seat=>seat.id),validateTransition:({targetStatus})=>targetStatus==='empty'||bottleActionAllowed(id)})}
 catch(error){pendingSeatActions.delete(id);pendingSeatTargets.delete(id);render();alert(error.message||'좌석 상태를 저장하지 못했습니다. 다시 시도해 주세요.')}
}
async function recoverOrphanHold(id){
 if(layoutEditing||pendingSeatActions.has(id))return false;const seat=master.find(item=>item.id===id),current=docs[id];
 if(!seat||!current||!orphanHeldSeatState(current).recoverable)return false;
 if(!confirm(`${seat.displayName}은 주문과 연결되지 않은 만료 좌석입니다. transaction으로 다시 확인한 뒤 강제 빈자리로 변경할까요?`))return false;
 pendingSeatActions.add(id);pendingSeatTargets.set(id,'empty');render();
 try{await recoverOrphanHeldSeatTransaction({db,seatId:id,expectedHeldBy:current.heldBy,expectedHeldUntil:current.heldUntil,serverTimestamp:firebase.firestore.FieldValue.serverTimestamp,adminId:firebase.auth().currentUser?.uid||'admin',activeSessionRefs:[db.collection('runtimeControls').doc('pangyo2-techno-valley').collection('kiosks').doc('mobile-01')]});return true}
 catch(error){pendingSeatActions.delete(id);pendingSeatTargets.delete(id);render();alert(error.message||'좌석을 복구하지 못했습니다.');return false}
}
function render(){
 const all=master.map(seatData),byId=new Map(all.map(seat=>[seat.id,seat])),count=st=>all.filter(s=>s.status===st).length,availability=bottleAvailability(),renewal=availability.reason==='unsupported-year'||Date.now()>=Date.UTC(bottlePolicy.SUPPORTED_END_YEAR,10,2),positions=layoutEditing?draftPositions:savedPositions;
 document.getElementById('seatSummary').innerHTML=`${renewal?'<span class="policy-renewal">⚠ 공휴일 데이터 갱신 필요</span>':''}<span class="empty">🟢 사용가능 ${count('empty')}</span><span class="held">🟡 주문중 ${count('held')}</span><span class="occupied">🔴 사용중 ${count('occupied')}</span><span class="reserved">🟣 예약 ${count('reserved')}</span><button class="bulk-clean-button start" onclick="bulkAction()" ${layoutEditing?'disabled aria-disabled="true"':''}>전체 해제</button>`;
 document.getElementById('seatAdmin').innerHTML=slotEntries(positions).map(({slot,seatId})=>{
  if(!seatId)return `<div class="seat-slot empty-slot${draggedSeatId?' drop-target':''}" data-seat-slot="${slot}" aria-label="빈 슬롯 ${slot+1}"><span>빈칸</span></div>`;
  const s=byId.get(seatId),pending=pendingSeatActions.has(s.id),blocked=!bottleActionAllowed(s.id),orderNumber=s.orderNo||s.customerNumber||s.orderId||'',party=s.reservationPartySize||s.partySize||'',actions=layoutEditing?[]:getAdminSeatActions(s.status);
  const recovery=orphanHeldSeatState(s),actionButtons=s.status==='held'&&recovery.recoverable?`<div class="admin-seat-actions" aria-busy="${pending}"><button type="button" class="admin-seat-action empty" data-recover-orphan-hold="${esc(s.id)}" ${pending?'disabled':''} aria-label="${esc(s.displayName)} 만료된 주문 없는 좌석 강제 빈자리">강제 빈자리</button></div>`:actions.length?`<div class="admin-seat-actions" aria-busy="${pending}">${actions.map(action=>`<button type="button" class="admin-seat-action ${action.className}" data-seat-transition="${action.target}" data-seat-from="${s.status}" data-seat-id="${esc(s.id)}" ${pending||blocked&&action.target!=='empty'?'disabled':''} aria-label="${esc(s.displayName)} ${statusNames[s.status]}. ${action.label}">${action.label}</button>`).join('')}</div>`:s.status==='held'&&s.orderId?`<div class="admin-seat-actions"><button type="button" class="admin-seat-action empty" data-held-order="${esc(s.id)}" aria-label="${esc(s.displayName)} 주문 상세">주문 상세</button></div>`:'';
  return `<div class="seat-slot occupied-slot${draggedSeatId===s.id?' dragging':''}" data-seat-slot="${slot}" data-layout-seat-id="${esc(s.id)}" draggable="${layoutEditing&&!layoutSaving}">${layoutEditing?`<button type="button" class="seat-move-handle" data-seat-move-handle="${esc(s.id)}" aria-label="${esc(s.displayName)} 이동. 현재 ${Math.floor(slot/6)+1}행 ${slot%6+1}열" aria-describedby="seatLayoutNotice">↕ 이동</button>`:''}<div class="simple-seat-shell"><div class="simple-seat seat-zone-${s.zone} ${s.status}${blocked?' outside-hours':''}"><strong>${s.displayName}</strong><span>최대 ${s.capacity}인</span><em><i aria-hidden="true"></i>${statusNames[s.status]}</em>${orderNumber?`<small class="seat-order-number">주문 ${esc(orderNumber)}</small>`:''}${party?`<small class="seat-party-size">예약 ${esc(party)}인</small>`:''}${blocked?`<small class="outside-hours-badge">${bottleAdminReason()}</small>`:''}</div>${actionButtons}</div></div>`;
 }).join('');renderLayoutControls();
}
window.manageSeat=manageSeat;window.touchSeat=manageSeat;window.bulkAction=bulkAction;window.PJSeatLayoutEditor={startLayoutEdit,cancelLayoutEdit,reloadLatestLayout,resetLayoutDraft,applyDraftMove,saveLayout,applyLayoutSnapshot,getState:()=>({savedPositions:{...savedPositions},draftPositions:{...draftPositions},revision:layoutRevision,editBaseRevision,editing:layoutEditing,saving:layoutSaving,needsRecovery:layoutNeedsRecovery,remoteLayoutChanged,dirty:layoutDirty(),warning:layoutWarning})};
const seatAdmin=document.getElementById('seatAdmin');
seatAdmin?.addEventListener('click',event=>{if(layoutEditing)return;const action=event.target.closest?.('[data-seat-transition],[data-held-order]')||event.target.closest?.('[data-recover-orphan-hold]');if(!action||action.disabled||!seatAdmin.contains(action))return;event.stopPropagation();if(action.dataset.heldOrder)openHeldSeatOrder(action.dataset.heldOrder);else if(action.dataset.recoverOrphanHold)recoverOrphanHold(action.dataset.recoverOrphanHold);else runSeatAction(action.dataset.seatId,action.dataset.seatFrom,action.dataset.seatTransition)});
seatAdmin?.addEventListener('dragstart',event=>{const shell=event.target.closest?.('[data-layout-seat-id]');if(!layoutEditing||!shell)return event.preventDefault();draggedSeatId=shell.dataset.layoutSeatId;shell.classList.add('dragging');event.dataTransfer?.setData('text/plain',draggedSeatId);event.dataTransfer&&(event.dataTransfer.effectAllowed='move')});
seatAdmin?.addEventListener('dragover',event=>{const target=event.target.closest?.('[data-seat-slot]');if(!layoutEditing||!target)return;event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect='move';const slot=Number(target.dataset.seatSlot);if(slot!==dragTargetSlot){dragTargetSlot=slot;seatAdmin.querySelectorAll('.drop-target').forEach(node=>node.classList.remove('drop-target'));target.classList.add('drop-target')}});
seatAdmin?.addEventListener('drop',event=>{const target=event.target.closest?.('[data-seat-slot]');if(!layoutEditing||!target)return;event.preventDefault();event.stopPropagation();const id=draggedSeatId||event.dataTransfer?.getData('text/plain');draggedSeatId=null;dragTargetSlot=null;applyDraftMove(id,Number(target.dataset.seatSlot))});
seatAdmin?.addEventListener('dragend',event=>{event.preventDefault();draggedSeatId=null;dragTargetSlot=null;seatAdmin.querySelectorAll('.dragging,.drop-target').forEach(node=>node.classList.remove('dragging','drop-target'))});
seatAdmin?.addEventListener('keydown',event=>{const handle=event.target.closest?.('[data-seat-move-handle]');if(!layoutEditing||!handle)return;const slot=draftPositions[handle.dataset.seatMoveHandle],delta={ArrowLeft:-1,ArrowRight:1,ArrowUp:-6,ArrowDown:6}[event.key];if(!delta)return;const target=slot+delta;if(target<0||target>=SLOT_COUNT||event.key==='ArrowLeft'&&slot%6===0||event.key==='ArrowRight'&&slot%6===5)return;event.preventDefault();const id=handle.dataset.seatMoveHandle;if(applyDraftMove(id,target))document.querySelector(`[data-seat-move-handle="${id}"]`)?.focus()});
document.getElementById('editSeatLayout')?.addEventListener('click',startLayoutEdit);document.getElementById('saveSeatLayout')?.addEventListener('click',saveLayout);document.getElementById('reloadSeatLayout')?.addEventListener('click',reloadLatestLayout);document.getElementById('cancelSeatLayout')?.addEventListener('click',cancelLayoutEdit);document.getElementById('resetSeatLayout')?.addEventListener('click',resetLayoutDraft);
document.querySelector?.('[data-seat-occupancy-cancel]')?.addEventListener('click',closeOccupancyDialog);
document.querySelector?.('[data-seat-occupancy-confirm]')?.addEventListener('click',confirmManualOccupancy);
occupancyDialog()?.addEventListener('cancel',event=>{event.preventDefault();closeOccupancyDialog()});
document.querySelector?.('[data-occupied-seat-cancel]')?.addEventListener('click',closeOccupiedSeatDialog);
document.querySelector?.('[data-occupied-seat-order]')?.addEventListener('click',openOccupiedSeatOrder);
document.querySelector?.('[data-occupied-seat-clear]')?.addEventListener('click',clearOccupiedSeat);
occupiedSeatDialog()?.addEventListener('cancel',event=>{event.preventDefault();closeOccupiedSeatDialog()});
firebase.auth().onAuthStateChanged(async user=>{try{if(!user)throw new Error('login');const token=await user.getIdTokenResult(true);if(token.claims.admin!==true)throw new Error('admin');document.body.classList.add('admin-unlocked');if(!unsubscribeSeatLayout)unsubscribeSeatLayout=seatLayoutRef.onSnapshot(applyLayoutSnapshot,error=>{layoutWarning=`좌석 배열을 불러오지 못했습니다: ${error.message}`;savedPositions=copyDefault();if(!layoutEditing)draftPositions={...savedPositions};render()});}catch(e){unsubscribeSeatLayout?.();unsubscribeSeatLayout=null;await firebase.auth().signOut().catch(()=>{});if(window.top===window)location.replace('../admin/');}});
db.collection('seats').onSnapshot(snap=>{docs={};snap.forEach(d=>docs[d.id]=d.data());pendingSeatTargets.forEach((target,id)=>{if(normalizedSeatStatus(docs[id]?.status)===target){pendingSeatTargets.delete(id);pendingSeatActions.delete(id)}});const badge=document.getElementById('seatConnection');badge.textContent='실시간 연결';badge.className='connection live';render();},e=>{document.getElementById('seatConnection').textContent='연결 오류';alert(e.message);});

db.collection('waitlist').onSnapshot(snap=>{waitDocs=snap.docs.map(d=>({id:d.id,...d.data()}));render()});
function scheduleBottlePolicyRender(){if(typeof setTimeout!=='function')return;if(typeof clearTimeout==='function')clearTimeout(bottlePolicyTimer);bottlePolicyTimer=setTimeout(()=>{render();scheduleBottlePolicyRender()},bottlePolicy.millisecondsUntilNextBoundary()+25)}
scheduleBottlePolicyRender();window.addEventListener?.('focus',render);document.addEventListener?.('visibilitychange',()=>{if(!document.hidden)render()});window.addEventListener?.('beforeunload',event=>{if(!layoutDirty())return;event.preventDefault();event.returnValue=''});document.querySelector?.('.admin-tools a')?.addEventListener('click',event=>{if(layoutDirty()&&!confirm('저장하지 않은 좌석 배열 변경을 취소하고 화면을 나가시겠습니까?'))event.preventDefault()});window.addEventListener?.('pagehide',()=>{if(typeof clearTimeout==='function')clearTimeout(bottlePolicyTimer);unsubscribeSeatLayout?.()});
