const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const css=fs.readFileSync(path.join(root,'seats.css'),'utf8');

function renderSeatManager(documents={}){
 const elements={seatSummary:{innerHTML:''},seatAdmin:{innerHTML:''},seatConnection:{textContent:'',className:''}};
 const seatSnapshot={forEach(callback){Object.entries(documents).forEach(([id,data])=>callback({id,data:()=>data}));}};
 const emptySnapshot={docs:[]};
 const db={collection(name){return {onSnapshot(success){success(name==='seats'?seatSnapshot:emptySnapshot)}}}};
 const context={
  console,db,
  document:{body:{classList:{add(){}}},getElementById(id){return elements[id]}},
  window:{top:null},location:{replace(){}},alert(){},confirm(){return false},prompt(){return null},
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
 return [...html.matchAll(/<button class="simple-seat ([^"]+)" data-seat-id="([^"]+)"/g)]
  .map(([,status,id])=>({status,id}));
}

test('seat manager always renders the 13 real tables as independent cards',()=>{
 const expected=['papa-2','papa-bar4','outdoor-1','outdoor-2','outdoor-3','outdoor-4','annex-1','annex-2','annex-3','annex-4','room-1','room-2','room-3'];
 const rendered=cards(renderSeatManager());
 assert.equal(rendered.length,13);
 assert.deepEqual(rendered.map(card=>card.id),expected);
 assert.equal(new Set(rendered.map(card=>card.id)).size,13);
 assert.ok(rendered.every(card=>card.status==='empty'));
});

test('zones keep their fixed card counts with no merged zone card',()=>{
 const html=renderSeatManager();
 for(const [zone,count] of [['papa',2],['outdoor',4],['annex',4],['room',3]]){
  const section=html.match(new RegExp(`<section class="simple-zone seat-zone-${zone}"[\\s\\S]*?<\\/section>`));
  assert.ok(section,`${zone} zone is rendered`);
  assert.equal(cards(section[0]).length,count);
 }
 assert.equal((html.match(/class="simple-zone/g)||[]).length,4);
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

test('seat cards use fixed square geometry and the shared zone palette',()=>{
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
});
