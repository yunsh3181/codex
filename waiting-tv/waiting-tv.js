const connection=document.getElementById('tvConnection');
const cooking=document.getElementById('cookingOrders');
const ready=document.getElementById('readyOrders');
const escapeHTML=value=>String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
function renderDisplay(target,items,emptyText){
 target.innerHTML=items.length?items.map(item=>`<div class="order-number">${escapeHTML(item.orderNumber)}</div>`).join(''):`<p class="empty">${emptyText}</p>`;
}
db.collection('publicOrderDisplays').onSnapshot(snapshot=>{
 const rows=snapshot.docs.map(doc=>doc.data()).sort((a,b)=>(a.updatedAt?.toMillis?.()||0)-(b.updatedAt?.toMillis?.()||0));
 renderDisplay(cooking,rows.filter(row=>row.displayStatus==='cooking'),'조리중인 주문이 없습니다.');
 renderDisplay(ready,rows.filter(row=>row.displayStatus==='ready'),'제조완료 주문이 없습니다.');
 connection.textContent='실시간 연결';connection.className='live';
},error=>{
 console.error('TV 주문현황 연결 오류',error);
 connection.textContent=navigator.onLine?'재연결 중':'네트워크 끊김';connection.className='error';
});
window.addEventListener('offline',()=>{connection.textContent='네트워크 끊김';connection.className='error'});
window.addEventListener('online',()=>{connection.textContent='재연결 중';connection.className=''});
