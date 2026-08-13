const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const seatLayout=require('../seat-layout');
const operations=require('../admin-operations');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const css=fs.readFileSync(path.join(root,'seats.css'),'utf8');
const adminCss=fs.readFileSync(path.join(root,'admin.css'),'utf8');
const layoutCss=fs.readFileSync(path.join(root,'seat-layout.css'),'utf8');
const seatHtml=fs.readFileSync(path.join(root,'seat/index.html'),'utf8');

function renderSeatManager(documents={}){
 const elements={
  seatSummary:{innerHTML:''},
  seatAdmin:{innerHTML:'',addEventListener(){},contains(){return true}},
  seatConnection:{textContent:'',className:''}
 };
 const seatSnapshot={forEach(callback){Object.entries(documents).forEach(([id,data])=>callback({id,data:()=>data}));}};
 const emptySnapshot={docs:[]};
 const db={collection(name){return {doc(){return {onSnapshot(success){success({exists:false})}}},onSnapshot(success){success(name==='seats'?seatSnapshot:emptySnapshot)}}}};
 const context={
  console,db,
  document:{body:{classList:{add(){},toggle(){}}},getElementById(id){return elements[id]},querySelector(){return null}},
  PJAdminOperations:operations,window:{top:null,PJSeatLayout:seatLayout,PJAdminOperations:operations,PJ_BOTTLE_SEAT_POLICY:{SUPPORTED_END_YEAR:2030,isBottleSeat:()=>false,getBottleSeatAvailability:()=>({available:true,reason:'open'}),millisecondsUntilNextBoundary:()=>86400000},addEventListener(){}},location:{replace(){}},alert(){},confirm(){return false},prompt(){return null},clearTimeout(){},setTimeout(){},
  setInterval(){},
  firebase:{
   auth(){return {onAuthStateChanged(callback){callback({getIdTokenResult:async()=>({claims:{admin:true}})})},signOut:async()=>{}}},
   firestore:{FieldValue:{serverTimestamp(){return {}}},Timestamp:{fromDate(date){return date}}}
  }
 };
 context.window.top=context.window;
 vm.runInNewContext(source,context);
 return elements.seatAdmin.innerHTML;
}

function cards(html){
 return [...html.matchAll(/data-layout-seat-id="([^"]+)"[^>]*>[\s\S]*?<div class="simple-seat ([^"]+)"/g)]
  .map(([,id,classes])=>({status:classes.split(' ').at(-1),id}));
}

test('seat manager always renders the 13 real tables as independent cards',()=>{
 const expected=['papa-2','papa-bar4','outdoor-1','outdoor-2','outdoor-3','outdoor-4','annex-1','annex-2','annex-3','annex-4','room-1','room-2','room-3'];
 const rendered=cards(renderSeatManager());
 assert.equal(rendered.length,13);
 assert.deepEqual(rendered.map(card=>card.id),expected);
 assert.equal(new Set(rendered.map(card=>card.id)).size,13);
 assert.ok(rendered.every(card=>card.status==='empty'));
});

test('unified board renders 18 slots, 13 seats, and five empty slots',()=>{
 const html=renderSeatManager();
 assert.equal((html.match(/class="seat-slot /g)||[]).length,18);
 assert.equal(cards(html).length,13);
 assert.equal((html.match(/class="seat-slot empty-slot/g)||[]).length,5);
 assert.doesNotMatch(html,/class="simple-zone/);
});

test('empty, occupied, and held updates preserve card identity and order',()=>{
 const initial=cards(renderSeatManager());
 const mixed=cards(renderSeatManager({
  'papa-2':{status:'occupied',orderNo:'A-101'},
  'outdoor-3':{status:'held',orderNo:'A-102'}
 }));
 assert.deepEqual(mixed.map(card=>card.id),initial.map(card=>card.id));
 assert.equal(mixed.length,initial.length);
 assert.equal(mixed.find(card=>card.id==='papa-2').status,'occupied');
 assert.equal(mixed.find(card=>card.id==='outdoor-3').status,'held');
});

test('seat cards use fixed square geometry and highlight only occupied state',()=>{
 for(const declaration of ['width:100%','height:auto','aspect-ratio:1/1','min-width:0','min-height:0','box-sizing:border-box']){
  assert.ok(css.includes(declaration),`contains ${declaration}`);
 }
 for(const palette of [
  ['papa','#eef6ff','#3b82f6','#1d4f91'],
  ['outdoor','#edf9f0','#3b9b5f','#176b35'],
  ['annex','#fff1f1','#dc4c52','#9f2028'],
  ['room','#fff6e8','#ee9b2e','#9a5700']
 ]){
  const [zone,background,border,color]=palette;
  assert.ok(css.includes(`.seat-zone-${zone} .simple-seat{background:${background};border-color:${border};color:${color}}`));
 }
 assert.ok(css.includes('.simple-seat.empty,.simple-seat.held{background:#fff;border-color:#d1d5db;color:#1f2937}'));
 assert.ok(css.includes('.simple-seat.occupied{background:#fff1f1;border-color:#ef4444;color:#7f1d1d}'));
 assert.ok(css.includes('.simple-seat.occupied:hover{background:#fff1f1;border-color:#dc2626}'));
});

test('state updates switch card classes without changing card order',()=>{
 const available=cards(renderSeatManager({'papa-2':{status:'empty'}}));
 const occupied=cards(renderSeatManager({'papa-2':{status:'occupied'}}));
 const released=cards(renderSeatManager({'papa-2':{status:'empty'}}));
 assert.deepEqual(occupied.map(card=>card.id),available.map(card=>card.id));
 assert.deepEqual(released.map(card=>card.id),available.map(card=>card.id));
 assert.equal(available.find(card=>card.id==='papa-2').status,'empty');
 assert.equal(occupied.find(card=>card.id==='papa-2').status,'occupied');
 assert.equal(released.find(card=>card.id==='papa-2').status,'empty');
});

test('desktop seat board uses the full-width fixed 6 by 3 grid',()=>{
 assert.match(layoutCss,/\.cad-layout\{[^}]*display:grid[^}]*width:100%[^}]*grid-template-columns:repeat\(6,minmax\(0,1fr\)\)[^}]*grid-template-rows:repeat\(3,minmax\(0,1fr\)\)/);
 assert.match(layoutCss,/\.seat-slot \.simple-seat\{[^}]*max-width:none[^}]*height:100%[^}]*aspect-ratio:auto/);
 assert.doesNotMatch(renderSeatManager(),/class="simple-zone/);
});

test('seat names and shared actions reserve compact non-overlapping rows',()=>{
 assert.match(layoutCss,/\.seat-slot \.simple-seat strong\{[^}]*min-height:40px[^}]*word-break:keep-all[^}]*overflow-wrap:normal[^}]*-webkit-line-clamp:2/);
 assert.match(layoutCss,/\.seat-slot \.simple-seat-shell\{[^}]*gap:3px/);
 assert.match(adminCss,/\.admin-seat-actions\{[^}]*gap:1px[^}]*margin-top:auto/);
 assert.match(adminCss,/\.admin-seat-action\{[^}]*min-height:16px[^}]*border-radius:4px[^}]*padding:1px 2px[^}]*font-size:8px[^}]*line-height:1[^}]*white-space:nowrap/);
});

test('seat manager loads only the refreshed shared CSS cache keys',()=>{
 assert.equal((seatHtml.match(/admin\.css\?v=48\.0\.2/g)||[]).length,1);
 assert.equal((seatHtml.match(/seat-layout\.css\?v=2/g)||[]).length,1);
 assert.equal((seatHtml.match(/admin\.css\?v=48\.0\.1/g)||[]).length,0);
 assert.equal((seatHtml.match(/seat-layout\.css\?v=1(?:\D|$)/g)||[]).length,0);
 for(const key of ['seats.css?v=43.7.1.3','seats-mobile.css?v=43.7.1.1','bottle-seat-policy.css?v=1'])assert.equal((seatHtml.match(new RegExp(key.replace(/[.?]/g,'\\$&'),'g'))||[]).length,1,`${key} remains unchanged`);
});

test('seat cards keep only the compact name, capacity, and status hierarchy',()=>{
 const html=renderSeatManager({
  'papa-2':{status:'occupied',orderNo:'A-101',occupiedAt:new Date()},
  'outdoor-3':{status:'held',heldAt:new Date()}
 });
 assert.equal((html.match(/class="simple-seat /g)||[]).length,13);
 assert.match(html,/<strong>커플석<\/strong><span>최대 2인<\/span><em><i aria-hidden="true"><\/i>사용중<\/em>/);
 assert.doesNotMatch(html,/터치하면|터치해서|줄서기 \d+팀/);
});
