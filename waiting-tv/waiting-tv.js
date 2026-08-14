const connection=document.getElementById('tvConnection');
const cooking=document.getElementById('cookingOrders');
const ready=document.getElementById('readyOrders');
const enableVoice=document.getElementById('enableVoice');
const escapeHTML=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const millis=value=>value?.toMillis?.()||value?.seconds*1000||0;
const READY_HIGHLIGHT_MS=5*60*1000;
const VISIBLE_DISPLAY_STATUSES=new Set(['cooking','ready']);
const TV_DEV_LOGS=typeof location!=='undefined'&&(location.hostname==='localhost'||location.hostname==='127.0.0.1'||new URLSearchParams(location.search).has('debugTv'));
const tvDebug=(message,value)=>{if(TV_DEV_LOGS)console.debug(`[customer-tv] ${message}`,value??'')};
function seoulBusinessDayKey(value=Date.now()){
 const date=new Date(millis(value)||value);
 if(Number.isNaN(date.getTime()))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 const businessDate=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),12));
 if(Number(parts.hour)<9)businessDate.setUTCDate(businessDate.getUTCDate()-1);
 return businessDate.toISOString().slice(0,10);
}
const displayBusinessDay=item=>typeof item.businessDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(item.businessDay)?item.businessDay:seoulBusinessDayKey(item.updatedAt);
const shouldDisplayOrder=(item,now=Date.now())=>VISIBLE_DISPLAY_STATUSES.has(item.displayStatus)&&displayBusinessDay(item)===seoulBusinessDayKey(now);
function millisecondsUntilNextBusinessDay(now=Date.now()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now)).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
 const seoulAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day),Number(parts.hour),Number(parts.minute),Number(parts.second));
 const nextBoundaryAsUtc=Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)+(Number(parts.hour)>=9?1:0),9,0,0);
 return Math.max(1,nextBoundaryAsUtc-seoulAsUtc);
}
const isReadyOverdue=item=>{
 const readyAt=millis(item.updatedAt);
 return item.displayStatus==='ready'&&readyAt>0&&Date.now()-readyAt>=READY_HIGHLIGHT_MS;
};
function waitingOrderDensity(count){
 if(count<=1)return 'single';
 if(count===2)return 'double';
 if(count===3)return 'triple';
 if(count===4)return 'compact';
 return 'dense';
}
function renderDisplay(target,items,emptyText){
 if(!target.dataset)target.dataset={};
 target.dataset.density=waitingOrderDensity(items.length);
 if(typeof target.querySelectorAll!=='function'||typeof document.createElement!=='function'){
  target.innerHTML=items.length?items.map(item=>`<div class="order-number${isReadyOverdue(item)?' ready-overdue':''}"><strong>${escapeHTML(spokenOrderNumber(item.orderNumber))}번</strong>${target===ready?'<span>포장 주문이 완료되었습니다</span><small>카운터에서 주문을 받아주세요</small>':''}</div>`).join(''):`<p class="empty">${emptyText}</p>`;
  return;
 }
 const desired=new Map(items.map(item=>[item.id,item]));
 const existing=new Map(Array.from(target.querySelectorAll('[data-order-key]')).map(node=>[node.dataset.orderKey,node]));
 existing.forEach((node,key)=>{if(!desired.has(key)){node.remove();tvDebug('removed order id',key)}});
 target.querySelector('.empty')?.remove();
 items.forEach(item=>{
  let node=existing.get(item.id);
  if(!node){node=document.createElement('div');node.dataset.orderKey=item.id}
  node.className=`order-number${isReadyOverdue(item)?' ready-overdue':''}`;
  node.innerHTML=`<strong>${escapeHTML(spokenOrderNumber(item.orderNumber))}번</strong>${target===ready?'<span>포장 주문이 완료되었습니다</span><small>카운터에서 주문을 받아주세요</small>':''}`;
  target.appendChild(node);
 });
 if(!items.length){const empty=document.createElement('p');empty.className='empty';empty.textContent=emptyText;target.appendChild(empty)}
}
let publicRows=[];
let manualRows=[];
function renderAll(){
 const rows=[...publicRows,...manualRows].filter(row=>shouldDisplayOrder(row)).sort((a,b)=>millis(a.updatedAt)-millis(b.updatedAt));
 tvDebug('visible order count',rows.length);
 const cookingRows=rows.filter(row=>row.displayStatus==='cooking');
 const readyRows=rows.filter(row=>row.displayStatus==='ready');
 renderDisplay(cooking,cookingRows,'조리중인 주문이 없습니다.');
 renderDisplay(ready,readyRows,'조리완료 주문이 없습니다.');
}
const highlightRefreshTimer=window.setInterval?.(renderAll,30*1000);
let businessDayRefreshTimer=null;
function scheduleBusinessDayRefresh(){
 if(businessDayRefreshTimer!=null)window.clearTimeout?.(businessDayRefreshTimer);
 businessDayRefreshTimer=window.setTimeout?.(()=>{renderAll();scheduleBusinessDayRefresh()},millisecondsUntilNextBusinessDay());
}
scheduleBusinessDayRefresh();
let voiceEnabled=false;
let completionSoundQueue=Promise.resolve(),completionAudioContext=null,completionSoundEnabled=false,completionSoundBlocked=false;
try{voiceEnabled=localStorage.getItem('pjTvVoiceEnabled')==='true'}catch(error){}
function updateVoiceButton(){
 if(!enableVoice)return;
 enableVoice.textContent=completionSoundEnabled&&voiceEnabled?'알림음·음성 안내 켜짐':completionSoundBlocked&&voiceEnabled?'음성 안내 켜짐 · 알림음 차단됨':'알림음·음성 안내 시작';
 enableVoice.classList.toggle('enabled',completionSoundEnabled&&voiceEnabled);
}
updateVoiceButton();
let speechQueue=Promise.resolve();
const spokenOrderNumber=value=>{const raw=String(value??'');const digits=raw.replace(/\D/g,'');return digits.length>=4?digits.slice(-4):raw};
function speakReadyOrder(orderNumber){
 return new Promise(resolve=>{
  if(!voiceEnabled||!('speechSynthesis'in window)){resolve();return}
  const utterance=PJSpeech.createSpeechUtterance(`${spokenOrderNumber(orderNumber)}번 고객님, 주문이 준비되었습니다.`);
  utterance.onend=resolve;
  utterance.onerror=()=>{voiceEnabled=false;try{localStorage.removeItem('pjTvVoiceEnabled')}catch(error){}updateVoiceButton();resolve()};
  window.speechSynthesis.speak(utterance);
 });
}
function enqueueReadyOrder(orderNumber){
 speechQueue=speechQueue.then(()=>speakReadyOrder(orderNumber)).catch(()=>{});
 return speechQueue;
}
async function unlockCompletionSound(){
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;if(!AudioContextClass)return false;
 try{
  if(!completionAudioContext||completionAudioContext.state==='closed')completionAudioContext=new AudioContextClass();
  await completionAudioContext.resume();completionSoundEnabled=completionAudioContext.state==='running';completionSoundBlocked=!completionSoundEnabled;
 }catch(error){completionSoundEnabled=false;completionSoundBlocked=true;tvDebug('completion sound unlock blocked')}
 updateVoiceButton();return completionSoundEnabled;
}
async function playCompletionSound(){
 const context=completionAudioContext;
 if(!completionSoundEnabled||!context||context.state!=='running'||document.hidden)return false;
 try{const start=context.currentTime;[659.25,783.99].forEach((frequency,index)=>{const oscillator=context.createOscillator(),gain=context.createGain();oscillator.frequency.value=frequency;gain.gain.setValueAtTime(.0001,start+index*.16);gain.gain.exponentialRampToValueAtTime(.22,start+index*.16+.015);gain.gain.exponentialRampToValueAtTime(.0001,start+index*.16+.28);oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start+index*.16);oscillator.stop(start+index*.16+.3)});await new Promise(resolve=>window.setTimeout(resolve,500));return true}catch(error){completionSoundEnabled=false;completionSoundBlocked=true;updateVoiceButton();tvDebug('completion sound playback failed');return false}
}
function enqueueCompletionSound(){completionSoundQueue=completionSoundQueue.then(()=>playCompletionSound()).catch(()=>{});return completionSoundQueue}
enableVoice?.addEventListener('click',async()=>{
 voiceEnabled=true;
 try{localStorage.setItem('pjTvVoiceEnabled','true')}catch(error){}
 await unlockCompletionSound();updateVoiceButton();
 if('speechSynthesis'in window)window.speechSynthesis.speak(PJSpeech.createSpeechUtterance(''));
});

let hasInitialPublicSnapshot=false;
let previousDisplayStatuses=new Map();
let seenCompletionEvents=new Set();
let hasInitialManualSnapshot=false;
let previousAnnounceVersions=new Map();
let unsubscribePublic=null;
let unsubscribeManual=null;
let listenerGeneration=0;
function applyPublicSnapshot(snapshot){
 tvDebug('snapshot count',snapshot.size??snapshot.docs.length);
 publicRows=snapshot.docs.map(doc=>({...doc.data(),id:`order:${doc.id}`})).filter(row=>shouldDisplayOrder(row));
 const currentDisplayStatuses=new Map(publicRows.map(row=>[row.id,row.displayStatus]));
 const readyEvents=publicRows.filter(row=>row.displayStatus==='ready').map(row=>({row,key:`${row.id}:${millis(row.updatedAt)}`}));
 if(hasInitialPublicSnapshot)readyEvents.filter(event=>!seenCompletionEvents.has(event.key)).forEach(event=>{seenCompletionEvents.add(event.key);enqueueCompletionSound()});
 else readyEvents.forEach(event=>seenCompletionEvents.add(event.key));
 previousDisplayStatuses=currentDisplayStatuses;
 hasInitialPublicSnapshot=true;
 renderAll();
 connection.textContent=snapshot.metadata?.fromCache?(navigator.onLine?'동기화 중':'오프라인'):'실시간 연결';connection.className=snapshot.metadata?.fromCache?'':'live';
}
function applyManualSnapshot(snapshot){
 tvDebug('snapshot count',snapshot.size??snapshot.docs.length);
 manualRows=snapshot.docs.map(doc=>({...doc.data(),id:`manual:${doc.id}`})).filter(row=>shouldDisplayOrder(row));
 const currentVersions=new Map(manualRows.map(row=>[row.id,Number(row.announceVersion)||0]));
 if(hasInitialManualSnapshot){
  manualRows.filter(row=>(Number(row.announceVersion)||0)>(previousAnnounceVersions.get(row.id)||0)).forEach(row=>enqueueReadyOrder(row.orderNumber));
 }
 previousAnnounceVersions=currentVersions;
 hasInitialManualSnapshot=true;
 renderAll();
 connection.textContent=snapshot.metadata?.fromCache?(navigator.onLine?'동기화 중':'오프라인'):'실시간 연결';connection.className=snapshot.metadata?.fromCache?'':'live';
}
function stopTvListeners(){
 listenerGeneration++;
 if(unsubscribePublic){unsubscribePublic();unsubscribePublic=null;tvDebug('listener stop','publicOrderDisplays')}
 if(unsubscribeManual){unsubscribeManual();unsubscribeManual=null;tvDebug('listener stop','manualCustomerCalls')}
}
function startTvListeners(){
 stopTvListeners();
 publicRows=[];manualRows=[];previousDisplayStatuses=new Map();previousAnnounceVersions=new Map();hasInitialPublicSnapshot=false;hasInitialManualSnapshot=false;
 renderAll();
 const generation=listenerGeneration;
 tvDebug('listener start','publicOrderDisplays');
 unsubscribePublic=db.collection('publicOrderDisplays').onSnapshot({includeMetadataChanges:true},snapshot=>{if(generation===listenerGeneration)applyPublicSnapshot(snapshot)},error=>{if(generation===listenerGeneration)handleConnectionError(error)});
 tvDebug('listener start','manualCustomerCalls');
 unsubscribeManual=db.collection('manualCustomerCalls').onSnapshot({includeMetadataChanges:true},snapshot=>{if(generation===listenerGeneration)applyManualSnapshot(snapshot)},error=>{if(generation===listenerGeneration)handleConnectionError(error)});
}
window.__pjWaitingTvStop?.();
window.__pjWaitingTvStop=stopTvListeners;
startTvListeners();

function handleConnectionError(error){
 console.error('TV 주문현황 연결 오류',error);
 connection.textContent=navigator.onLine?'재연결 중':'네트워크 끊김';connection.className='error';
}
window.addEventListener('offline',()=>{connection.textContent='네트워크 끊김';connection.className='error'});
window.addEventListener('online',()=>{connection.textContent='재연결 중';connection.className=''});
window.addEventListener('pagehide',()=>{stopTvListeners();completionSoundEnabled=false;completionAudioContext?.close?.().catch?.(()=>{});completionAudioContext=null;if(highlightRefreshTimer!=null)window.clearInterval?.(highlightRefreshTimer);if(businessDayRefreshTimer!=null)window.clearTimeout?.(businessDayRefreshTimer)});
