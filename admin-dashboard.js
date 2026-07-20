
(function(){
'use strict';
const esc=value=>String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[ch]));
const money=n=>Number(n||0).toLocaleString('ko-KR')+'원';
const fmt=v=>{
 const d=v?.toDate?v.toDate():v?.seconds?new Date(v.seconds*1000):v?new Date(v):null;
 return d&&!Number.isNaN(d.getTime())?d.toLocaleDateString('ko-KR'):'-';
};
const ids=['orders','seats','waiting','sales','customers','recommendations'];
const panels={
 orders:document.getElementById('ordersPanel'),seats:document.getElementById('seatsPanel'),
 waiting:document.getElementById('waitingPanel'),sales:document.getElementById('salesPanel'),
 customers:document.getElementById('customersPanel'),recommendations:document.getElementById('recommendationsPanel')
};
const buttons={
 orders:document.getElementById('showOrdersTab'),seats:document.getElementById('showSeatsTab'),
 waiting:document.getElementById('showWaitingTab'),sales:document.getElementById('showSalesTab'),
 customers:document.getElementById('showCustomersTab'),recommendations:document.getElementById('showRecommendationsTab')
};
function switchPanel(name){
 ids.forEach(id=>{if(panels[id])panels[id].hidden=id!==name;if(buttons[id])buttons[id].classList.toggle('active',id===name)});
 if(name==='sales')loadSales();
 if(name==='customers')loadCustomers();
 if(name==='recommendations')loadRecommendations();
}
['sales','customers','recommendations'].forEach(id=>buttons[id]?.addEventListener('click',()=>switchPanel(id)));
buttons.orders?.addEventListener('click',()=>switchPanel('orders'));
buttons.seats?.addEventListener('click',()=>switchPanel('seats'));
buttons.waiting?.addEventListener('click',()=>switchPanel('waiting'));

function metricsHtml(items){return items.map(x=>`<div class="metric"><span>${x[0]}</span><strong>${x[1]}</strong></div>`).join('')}
function rankHtml(rows){
 if(!rows.length)return '<div class="empty">집계 데이터가 없습니다.</div>';
 return rows.slice(0,10).map((x,i)=>`<div class="rank-row"><span class="rank">BEST ${i+1}</span><span>${x.name||x.id}</span><strong>${Number(x.quantity||0).toLocaleString()}개</strong></div>`).join('')
}
async function loadSales(){
 const snap=await db.collection('salesStats').get();
 const rows=snap.docs.map(d=>({id:d.id,...d.data()}));
 const totalQty=rows.reduce((s,x)=>s+Number(x.quantity||0),0);
 const totalRevenue=rows.reduce((s,x)=>s+Number(x.revenue||0),0);
 const pcQty=rows.reduce((s,x)=>s+Number(x.pcQuantity||0),0);
 const mobileQty=rows.reduce((s,x)=>s+Number(x.mobileQuantity||0),0);
 document.getElementById('salesSummary').innerHTML=metricsHtml([
  ['누적 판매수량',totalQty.toLocaleString()+'개'],['누적 매출',money(totalRevenue)],
  ['PC 판매수량',pcQty.toLocaleString()],['모바일 판매수량',mobileQty.toLocaleString()]
 ]);
 const cat=c=>rows.filter(x=>x.category===c&&Number(x.quantity||0)>=1).sort((a,b)=>(b.quantity||0)-(a.quantity||0));
 document.getElementById('bestPizza').innerHTML=rankHtml(cat('pizza'));
 document.getElementById('bestSide').innerHTML=rankHtml(cat('side'));
 document.getElementById('bestDrink').innerHTML=rankHtml(cat('drink'));
 document.getElementById('bestSet').innerHTML=rankHtml(cat('set'));
}
async function loadCustomers(){
 const snap=await db.collection('customers').orderBy('lastOrderAt','desc').limit(300).get();
 window.__customers=snap.docs.map(d=>({id:d.id,...d.data()}));
 renderCustomers();
}
function renderCustomers(){
 const q=(document.getElementById('customerSearch').value||'').trim();
 const rows=(window.__customers||[]).filter(x=>!q||String(x.phoneLast4||x.phoneMasked||'').includes(q));
 const total=rows.reduce((s,x)=>s+Number(x.totalSpent||0),0);
 document.getElementById('customerSummary').innerHTML=metricsHtml([
  ['고객 수',rows.length.toLocaleString()+'명'],['누적 주문',rows.reduce((s,x)=>s+Number(x.orderCount||0),0).toLocaleString()+'건'],
  ['누적 주문금액',money(total)],['평균 고객금액',money(rows.length?total/rows.length:0)]
 ]);
 document.getElementById('customerList').innerHTML=rows.length?rows.map(x=>`<div class="data-row customer"><strong>${esc(x.phoneMasked||'***-'+(x.phoneLast4||''))}</strong><span>${x.orderCount||0}회</span><span>${money(x.totalSpent)}</span><span>평균 ${money(x.averageOrderValue)}</span><span>최근 ${fmt(x.lastOrderAt)}</span></div>`).join(''):'<div class="empty">고객 데이터가 없습니다.</div>';
}
document.getElementById('customerSearch')?.addEventListener('input',renderCustomers);

async function loadRecommendations(){
 const snap=await db.collection('recommendationStats').get();
 const rows=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.accepted||0)-(a.accepted||0));
 const shown=rows.reduce((s,x)=>s+Number(x.shown||0),0),accepted=rows.reduce((s,x)=>s+Number(x.accepted||0),0);
 document.getElementById('recommendationSummary').innerHTML=metricsHtml([
  ['추천 노출',shown.toLocaleString()+'회'],['추천 수락',accepted.toLocaleString()+'회'],
  ['전체 수락률',shown?((accepted/shown)*100).toFixed(1)+'%':'0%'],
  ['예상 추가매출',money(rows.reduce((s,x)=>s+Number(x.estimatedRevenueLift||0),0))]
 ]);
 document.getElementById('recommendationList').innerHTML=rows.length?rows.map(x=>`<div class="data-row"><strong>${esc(x.name||x.id)}</strong><span>노출 ${x.shown||0} / 수락 ${x.accepted||0} / 거절 ${x.rejected||0}</span><span>${x.shown?((x.accepted||0)/x.shown*100).toFixed(1):0}%</span></div>`).join(''):'<div class="empty">추천 데이터가 없습니다.</div>';
}
document.getElementById('refreshSalesStats')?.addEventListener('click',loadSales);
})();
