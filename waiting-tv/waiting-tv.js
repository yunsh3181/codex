const connection=document.getElementById('tvConnection');
const cooking=document.getElementById('cookingOrders');
const ready=document.getElementById('readyOrders');
const enableVoice=document.getElementById('enableVoice');
const escapeHTML=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
const millis=value=>value?.toMillis?.()||value?.seconds*1000||0;
const READY_HIGHLIGHT_MS=5*60*1000;
const isReadyOverdue=item=>{
 const readyAt=millis(item.updatedAt);
 return item.displayStatus==='ready'&&readyAt>0&&Date.now()-readyAt>=READY_HIGHLIGHT_MS;
};
function renderDisplay(target,items,emptyText){
 target.innerHTML=items.length?items.map(item=>`<div class="order-number${isReadyOverdue(item)?' ready-overdue':''}">${escapeHTML(item.orderNumber)}</div>`).join(''):`<p class="empty">${emptyText}</p>`;
}
let publicRows=[];
let manualRows=[];
function renderAll(){
 const rows=[...publicRows,...manualRows].sort((a,b)=>millis(a.updatedAt)-millis(b.updatedAt));
 renderDisplay(cooking,rows.filter(row=>row.displayStatus==='cooking'),'조리중인 주문이 없습니다.');
 renderDisplay(ready,rows.filter(row=>row.displayStatus==='ready'),'조리완료 주문이 없습니다.');
}
window.setInterval?.(renderAll,30*1000);
let voiceEnabled=false;
try{voiceEnabled=localStorage.getItem('pjTvVoiceEnabled')==='true'}catch(error){}
function updateVoiceButton(){
 if(!enableVoice)return;
 enableVoice.textContent=voiceEnabled?'음성 안내 켜짐':'음성 안내 시작';
 enableVoice.classList.toggle('enabled',voiceEnabled);
}
updateVoiceButton();
let speechQueue=Promise.resolve();
const spokenOrderNumber=value=>String(value??'').replace(/^[PD](?=\d{4}$)/,'');
function chooseKoreanVoice(){
 const voices=window.speechSynthesis?.getVoices?.()||[];
 const korean=voices.filter(voice=>/^ko(-|_)?KR/i.test(voice.lang)||/^ko/i.test(voice.lang));
 return korean.find(voice=>/female|여성|yuna|sora|sunhi|google 한국어/i.test(`${voice.name} ${voice.voiceURI}`))||korean[0]||null;
}
function speakReadyOrder(orderNumber){
 return new Promise(resolve=>{
  if(!voiceEnabled||!('speechSynthesis'in window)){resolve();return}
  const utterance=new SpeechSynthesisUtterance(`${spokenOrderNumber(orderNumber)}번 고객님, 주문이 준비되었습니다.`);
  utterance.lang='ko-KR';utterance.rate=1.08;utterance.pitch=1.48;utterance.volume=1;
  const voice=chooseKoreanVoice();if(voice)utterance.voice=voice;
  utterance.onend=resolve;
  utterance.onerror=()=>{voiceEnabled=false;try{localStorage.removeItem('pjTvVoiceEnabled')}catch(error){}updateVoiceButton();resolve()};
  window.speechSynthesis.speak(utterance);
 });
}
function enqueueReadyOrder(orderNumber){
 speechQueue=speechQueue.then(()=>speakReadyOrder(orderNumber)).catch(()=>{});
 return speechQueue;
}
enableVoice?.addEventListener('click',()=>{
 voiceEnabled=true;
 try{localStorage.setItem('pjTvVoiceEnabled','true')}catch(error){}
 updateVoiceButton();
 if('speechSynthesis'in window)window.speechSynthesis.speak(new SpeechSynthesisUtterance(''));
});

let hasInitialPublicSnapshot=false;
let previousDisplayStatuses=new Map();
db.collection('publicOrderDisplays').onSnapshot(snapshot=>{
 publicRows=snapshot.docs.map(doc=>({id:`order:${doc.id}`,...doc.data()}));
 const currentDisplayStatuses=new Map(publicRows.map(row=>[row.id,row.displayStatus]));
 if(hasInitialPublicSnapshot){
  publicRows.filter(row=>previousDisplayStatuses.get(row.id)==='cooking'&&row.displayStatus==='ready').forEach(row=>enqueueReadyOrder(row.orderNumber));
 }
 previousDisplayStatuses=currentDisplayStatuses;
 hasInitialPublicSnapshot=true;
 renderAll();
 connection.textContent='실시간 연결';connection.className='live';
},handleConnectionError);

let hasInitialManualSnapshot=false;
let previousAnnounceVersions=new Map();
db.collection('manualCustomerCalls').onSnapshot(snapshot=>{
 manualRows=snapshot.docs.map(doc=>({id:`manual:${doc.id}`,...doc.data()}));
 const currentVersions=new Map(manualRows.map(row=>[row.id,Number(row.announceVersion)||0]));
 if(hasInitialManualSnapshot){
  manualRows.filter(row=>(Number(row.announceVersion)||0)>(previousAnnounceVersions.get(row.id)||0)).forEach(row=>enqueueReadyOrder(row.orderNumber));
 }
 previousAnnounceVersions=currentVersions;
 hasInitialManualSnapshot=true;
 renderAll();
 connection.textContent='실시간 연결';connection.className='live';
},handleConnectionError);

function handleConnectionError(error){
 console.error('TV 주문현황 연결 오류',error);
 connection.textContent=navigator.onLine?'재연결 중':'네트워크 끊김';connection.className='error';
}
window.addEventListener('offline',()=>{connection.textContent='네트워크 끊김';connection.className='error'});
window.addEventListener('online',()=>{connection.textContent='재연결 중';connection.className=''});
