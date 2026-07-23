const connection=document.getElementById('tvConnection');
const cooking=document.getElementById('cookingOrders');
const ready=document.getElementById('readyOrders');
const escapeHTML=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function renderDisplay(target,items,emptyText){
 target.innerHTML=items.length?items.map(item=>`<div class="order-number">${escapeHTML(item.orderNumber)}</div>`).join(''):`<p class="empty">${emptyText}</p>`;
}
let hasInitialSnapshot=false;
let previousDisplayStatuses=new Map();
let speechQueue=Promise.resolve();
const spokenOrderNumber=value=>String(value??'').replace(/^[PD](?=\d{4}$)/,'');
function chooseKoreanVoice(){
 const voices=window.speechSynthesis?.getVoices?.()||[];
 const korean=voices.filter(voice=>/^ko(-|_)?KR/i.test(voice.lang)||/^ko/i.test(voice.lang));
 return korean.find(voice=>/female|여성|yuna|sora|sunhi|google 한국어/i.test(`${voice.name} ${voice.voiceURI}`))||korean[0]||null;
}
function speakReadyOrder(orderNumber){
 return new Promise(resolve=>{
  if(!('speechSynthesis'in window)){resolve();return}
  const utterance=new SpeechSynthesisUtterance(`${spokenOrderNumber(orderNumber)}번 고객님, 주문이 준비되었습니다.`);
  utterance.lang='ko-KR';utterance.rate=1.08;utterance.pitch=1.48;utterance.volume=1;
  const voice=chooseKoreanVoice();if(voice)utterance.voice=voice;
  utterance.onend=resolve;utterance.onerror=resolve;
  window.speechSynthesis.speak(utterance);
 });
}
function enqueueReadyOrder(orderNumber){
 speechQueue=speechQueue.then(()=>speakReadyOrder(orderNumber)).catch(()=>{});
 return speechQueue;
}
db.collection('publicOrderDisplays').onSnapshot(snapshot=>{
 const rows=snapshot.docs.map(doc=>({id:doc.id,...doc.data()})).sort((a,b)=>(a.updatedAt?.toMillis?.()||0)-(b.updatedAt?.toMillis?.()||0));
 const currentDisplayStatuses=new Map(rows.map(row=>[row.id,row.displayStatus]));
 if(hasInitialSnapshot){
  rows
   .filter(row=>previousDisplayStatuses.get(row.id)==='cooking'&&row.displayStatus==='ready')
   .forEach(row=>enqueueReadyOrder(row.orderNumber));
 }
 previousDisplayStatuses=currentDisplayStatuses;
 hasInitialSnapshot=true;
 renderDisplay(cooking,rows.filter(row=>row.displayStatus==='cooking'),'조리중인 주문이 없습니다.');
 renderDisplay(ready,rows.filter(row=>row.displayStatus==='ready'),'제조완료 주문이 없습니다.');
 connection.textContent='실시간 연결';connection.className='live';
},error=>{
 console.error('TV 주문현황 연결 오류',error);
 connection.textContent=navigator.onLine?'재연결 중':'네트워크 끊김';connection.className='error';
});
window.addEventListener('offline',()=>{connection.textContent='네트워크 끊김';connection.className='error'});
window.addEventListener('online',()=>{connection.textContent='재연결 중';connection.className=''});
