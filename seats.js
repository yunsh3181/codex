const zones=[
 {id:'papa',name:'파파존'}, {id:'outdoor',name:'야외존'},
 {id:'annex',name:'별관'}, {id:'room',name:'룸'}
];
const master=[
 {id:'papa-2',zone:'papa',name:'2인석',displayName:'커플석',capacity:2},{id:'papa-bar4',zone:'papa',name:'4인 바테이블',displayName:'바테이블',capacity:4},
 {id:'outdoor-1',zone:'outdoor',name:'야외석 1번',displayName:'야외석1',capacity:4},{id:'outdoor-2',zone:'outdoor',name:'야외석 2번',displayName:'야외석2',capacity:4},{id:'outdoor-3',zone:'outdoor',name:'야외석 3번',displayName:'야외석3',capacity:4},{id:'outdoor-4',zone:'outdoor',name:'야외석 4번',displayName:'야외석4',capacity:4},
 {id:'annex-1',zone:'annex',name:'별관 1번',displayName:'별관1',capacity:2},{id:'annex-2',zone:'annex',name:'별관 2번',displayName:'별관2',capacity:4},{id:'annex-3',zone:'annex',name:'별관 3번',displayName:'별관3',capacity:4},{id:'annex-4',zone:'annex',name:'별관 4번',displayName:'별관4',capacity:2},
 {id:'room-1',zone:'room',name:'룸테이블 1',displayName:'룸1',capacity:4},{id:'room-2',zone:'room',name:'룸테이블 2',displayName:'룸2',capacity:4},{id:'room-3',zone:'room',name:'룸테이블 3',displayName:'룸3',capacity:4}
];
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
const statusNames={empty:'빈자리',held:'주문중',occupied:'사용중',reserved:'예약',unknown:'확인 필요'};
const statusIcons={empty:'🟢',held:'🟡',occupied:'🔴',reserved:'🟣',unknown:'⚪'};
let docs={};let waitDocs=[];
let pendingOccupancySeatId=null;
let pendingOccupiedSeatId=null;
const pendingSeatActions=new Set();
function toDate(value){if(!value)return null;if(typeof value.toDate==='function')return value.toDate();const d=new Date(value);return Number.isNaN(d.getTime())?null:d;}
function normalizedSeatStatus(status){return status==null||status==='empty'?'empty':['held','occupied','reserved'].includes(status)?status:'unknown'}
function seatData(s){const remote=docs[s.id]||{};return {...s,...remote,status:normalizedSeatStatus(remote.status)};}
function elapsed(ts){const d=toDate(ts);if(!d)return '';const min=Math.max(0,Math.floor((Date.now()-d.getTime())/60000));return min<60?`${min}분`:`${Math.floor(min/60)}시간 ${min%60}분`;}
async function updateSeat(id,status,extra={}){const s=master.find(x=>x.id===id);if(!s)return;const safeStatus=normalizedSeatStatus(status),clear=safeStatus==='empty';await db.collection('seats').doc(id).set({status:safeStatus,zone:s.zone,name:s.name,capacity:s.capacity,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),...(safeStatus==='occupied'?{occupiedAt:firebase.firestore.FieldValue.serverTimestamp()}:{}),...(clear?{partySize:null,groupSize:null,groupId:null,groupLabel:null,groupTableCount:null,orderId:null,orderNo:null,heldBy:null,heldAt:null,heldUntil:null,occupiedAt:null,cleaningAt:null,reservationName:null,reservationPartySize:null,reservationAt:null,reservationPhone:null}:{}),...extra},{merge:true});}
async function transitionReservation(id,from,to){
 if(pendingSeatActions.has(id))return;
 const seat=master.find(item=>item.id===id);if(!seat)return;
 pendingSeatActions.add(id);render();
 try{
  const ref=db.collection('seats').doc(id);
  await db.runTransaction(async transaction=>{
   const snapshot=await transaction.get(ref),saved=snapshot.exists?snapshot.data():{};
   const current=saved.status==null?'empty':saved.status;
   const canReserve=to==='reserved'&&(current==='empty'||(current==='held'&&!saved.orderId));
   const canCancel=to==='empty'&&current==='reserved';
   if((from==='reservable'&&!canReserve)||(from==='reserved'&&!canCancel))throw new Error('SEAT_STATUS_CHANGED');
   transaction.set(ref,{status:to,zone:seat.zone,name:seat.name,capacity:seat.capacity,reservedAt:to==='reserved'?firebase.firestore.FieldValue.serverTimestamp():null,reservedBy:to==='reserved'?'admin':null,...(to==='reserved'?{heldBy:null,heldAt:null,heldUntil:null,partySize:null}:{}),updatedAt:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
  });
 }catch(error){alert(error?.message==='SEAT_STATUS_CHANGED'?'좌석 상태가 변경되었습니다. 최신 상태를 확인해 주세요.':'좌석 상태를 저장하지 못했습니다. 다시 시도해 주세요.')}
 finally{pendingSeatActions.delete(id);render()}
}
function reserveSeat(id){const base=master.find(item=>item.id===id);if(!base)return;const seat=seatData(base);if(!['empty','held'].includes(seat.status)||seat.orderId)return;if(seat.status==='held'&&!confirm('현재 고객이 주문 중인 좌석입니다. 예약하면 고객의 진행 중인 주문이 초기화됩니다. 예약하시겠습니까?'))return;return transitionReservation(id,'reservable','reserved')}
function cancelSeatReservation(id){if(!confirm('이 좌석의 예약을 취소하시겠습니까?'))return;return transitionReservation(id,'reserved','empty')}
function reservationForm(s){const existing=docs[s.id]||{};const dt=toDate(existing.reservationAt);const defaultDate=dt?new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16):'';const name=prompt(`${s.name} 예약자명`,existing.reservationName||'');if(name===null)return null;const people=prompt('예약 인원',existing.reservationPartySize||Math.min(s.capacity,2));if(people===null)return null;const time=prompt('예약 일시 (예: 2026-07-16 18:30)',defaultDate.replace('T',' '));if(time===null)return null;const phone=prompt('전화번호 (선택)',existing.reservationPhone||'');if(phone===null)return null;const parsed=new Date(time.replace(' ','T'));if(Number.isNaN(parsed.getTime())){alert('예약 일시를 정확히 입력해 주세요.');return null;}return {reservationName:name.trim(),reservationPartySize:Number(people||0),reservationAt:firebase.firestore.Timestamp.fromDate(parsed),reservationPhone:phone.trim()};}
function occupancyDialog(){return document.getElementById('seatOccupancyDialog')}
function closeOccupancyDialog(){pendingOccupancySeatId=null;occupancyDialog()?.close()}
function requestManualOccupancy(id){pendingOccupancySeatId=id;occupancyDialog()?.showModal()}
async function confirmManualOccupancy(){const id=pendingOccupancySeatId;if(!id)return;closeOccupancyDialog();await updateSeat(id,'occupied')}
function occupiedSeatDialog(){return document.getElementById('occupiedSeatDialog')}
function closeOccupiedSeatDialog(){pendingOccupiedSeatId=null;occupiedSeatDialog()?.close()}
function requestOccupiedSeatAction(id){pendingOccupiedSeatId=id;occupiedSeatDialog()?.showModal()}
function openOccupiedSeatOrder(){const id=pendingOccupiedSeatId;if(!master.some(seat=>seat.id===id))return;closeOccupiedSeatDialog();location.assign(`../admin/?seatId=${encodeURIComponent(id)}`)}
async function clearOccupiedSeat(){const id=pendingOccupiedSeatId;if(!master.some(seat=>seat.id===id))return;closeOccupiedSeatDialog();await updateSeat(id,'empty')}
async function manageSeat(id){const base=master.find(x=>x.id===id);if(!base)return;const remote=docs[id]||{},s=seatData(base);if(s.status==='occupied'){requestOccupiedSeatAction(id);return;}if(s.status==='held'){if(confirm(`${s.name}의 주문중 상태를 해제하시겠습니까?`))await updateSeat(id,'empty');return;}if(remote.status&&remote.status!=='empty')return;if(s.status==='empty')requestManualOccupancy(id);}
async function bulkAction(){const targets=master.map(seatData).filter(s=>['occupied','held'].includes(s.status));if(!targets.length)return alert('해제할 좌석이 없습니다.');if(!confirm(`${targets.length}개 좌석을 사용가능으로 변경하시겠습니까?`))return;await Promise.all(targets.map(s=>updateSeat(s.id,'empty')));}
function render(){const all=master.map(seatData),count=st=>all.filter(s=>s.status===st).length;document.getElementById('seatSummary').innerHTML=`<span class="empty">🟢 사용가능 ${count('empty')}</span><span class="held">🟡 주문중 ${count('held')}</span><span class="occupied">🔴 사용중 ${count('occupied')}</span><span class="reserved">🟣 예약 ${count('reserved')}</span><button class="bulk-clean-button start" onclick="bulkAction()">전체 해제</button>`;document.getElementById('seatAdmin').innerHTML=zones.map(z=>`<section class="simple-zone seat-zone-${z.id}" data-seat-zone="${z.id}"><h2>${z.name}</h2><div class="simple-seat-grid">${all.filter(s=>s.zone===z.id).map(s=>{const pending=pendingSeatActions.has(s.id),reservable=s.status==='empty'||(s.status==='held'&&!s.orderId);return `<div class="simple-seat-shell"><button type="button" class="simple-seat ${s.status}" data-seat-id="${esc(s.id)}" ${pending?'disabled':''}><strong>${s.displayName}</strong><span>최대 ${s.capacity}인</span><em><i aria-hidden="true"></i>${statusNames[s.status]}</em></button>${reservable?`<button type="button" class="seat-reservation-action ${s.status==='held'?'warning':''}" data-reserve-seat="${esc(s.id)}" ${pending?'disabled':''}>${pending?'처리 중…':s.status==='held'?'⚠ 주문중 좌석 예약':'예약'}</button>`:''}${s.status==='reserved'?`<button type="button" class="seat-reservation-action cancel" data-cancel-reservation="${esc(s.id)}" ${pending?'disabled':''}>${pending?'처리 중…':'예약 취소'}</button>`:''}</div>`}).join('')}</div></section>`).join('');}
window.manageSeat=manageSeat;window.touchSeat=manageSeat;window.bulkAction=bulkAction;
const seatAdmin=document.getElementById('seatAdmin');
seatAdmin?.addEventListener('click',event=>{const action=event.target.closest?.('[data-reserve-seat],[data-cancel-reservation]');if(action&&seatAdmin.contains(action)){if(action.disabled)return;const id=action.dataset.reserveSeat||action.dataset.cancelReservation;if(action.dataset.reserveSeat)reserveSeat(id);else cancelSeatReservation(id);return}const element=event.target.closest?.('[data-seat-id]');if(!element||!seatAdmin.contains(element))return;const seatId=element.dataset.seatId;if(!master.some(seat=>seat.id===seatId))return;manageSeat(seatId)});
document.querySelector?.('[data-seat-occupancy-cancel]')?.addEventListener('click',closeOccupancyDialog);
document.querySelector?.('[data-seat-occupancy-confirm]')?.addEventListener('click',confirmManualOccupancy);
occupancyDialog()?.addEventListener('cancel',event=>{event.preventDefault();closeOccupancyDialog()});
document.querySelector?.('[data-occupied-seat-cancel]')?.addEventListener('click',closeOccupiedSeatDialog);
document.querySelector?.('[data-occupied-seat-order]')?.addEventListener('click',openOccupiedSeatOrder);
document.querySelector?.('[data-occupied-seat-clear]')?.addEventListener('click',clearOccupiedSeat);
occupiedSeatDialog()?.addEventListener('cancel',event=>{event.preventDefault();closeOccupiedSeatDialog()});
firebase.auth().onAuthStateChanged(async user=>{try{if(!user)throw new Error('login');const token=await user.getIdTokenResult(true);if(token.claims.admin!==true)throw new Error('admin');document.body.classList.add('admin-unlocked');}catch(e){await firebase.auth().signOut().catch(()=>{});if(window.top===window)location.replace('../admin/');}});
db.collection('seats').onSnapshot(snap=>{docs={};snap.forEach(d=>docs[d.id]=d.data());const badge=document.getElementById('seatConnection');badge.textContent='실시간 연결';badge.className='connection live';render();},e=>{document.getElementById('seatConnection').textContent='연결 오류';alert(e.message);});

db.collection('waitlist').onSnapshot(snap=>{waitDocs=snap.docs.map(d=>({id:d.id,...d.data()}));render()});
setInterval(render,30000);
