const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const html=fs.readFileSync(path.join(root,'seat/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'seats.css'),'utf8');

function createSeatManager(initialStatus='empty'){
 const writes=[];
 const listeners={};
 const dialog={
  open:false,
  showCount:0,
  showModal(){this.open=true;this.showCount+=1},
  close(){this.open=false},
  addEventListener(type,handler){listeners[`dialog:${type}`]=handler}
 };
 const occupiedDialog={
  open:false,
  showModal(){this.open=true},
  close(){this.open=false},
  addEventListener(type,handler){listeners[`occupied-dialog:${type}`]=handler}
 };
 const buttons={
  '[data-seat-occupancy-cancel]':{addEventListener(type,handler){listeners[`cancel:${type}`]=handler}},
  '[data-seat-occupancy-confirm]':{addEventListener(type,handler){listeners[`confirm:${type}`]=handler}},
  '[data-occupied-seat-cancel]':{addEventListener(type,handler){listeners[`occupied-cancel:${type}`]=handler}},
  '[data-occupied-seat-order]':{addEventListener(type,handler){listeners[`occupied-order:${type}`]=handler}},
  '[data-occupied-seat-clear]':{addEventListener(type,handler){listeners[`occupied-clear:${type}`]=handler}}
 };
 const elements={
  seatSummary:{innerHTML:''},
  seatAdmin:{
   innerHTML:'',
   addEventListener(type,handler){listeners[`seat-admin:${type}`]=handler},
   contains(element){return element?.insideSeatAdmin===true}
  },
  seatConnection:{textContent:'',className:''},
  seatOccupancyDialog:dialog,
  occupiedSeatDialog:occupiedDialog
 };
 const seatSnapshot={forEach(callback){callback({id:'papa-2',data:()=>({status:initialStatus})})}};
 const emptySnapshot={docs:[]};
 const db={collection(name){return {
  doc(id){return {async set(payload,options){writes.push({name,id,payload,options})}}},
  onSnapshot(success){success(name==='seats'?seatSnapshot:emptySnapshot)}
 }}};
 const context={
  console,db,
  document:{
   body:{classList:{add(){}}},
   getElementById(id){return elements[id]},
   querySelector(selector){return buttons[selector]||null}
  },
  window:{top:null},location:{replace(){},assign(url){context.assignedUrl=url}},encodeURIComponent,alert(){},confirm(){return false},prompt(){return null},
  setInterval(){},
  firebase:{
   auth(){return {onAuthStateChanged(callback){callback({getIdTokenResult:async()=>({claims:{admin:true}})})},signOut:async()=>{}}},
   firestore:{FieldValue:{serverTimestamp(){return 'SERVER_TIMESTAMP'}},Timestamp:{fromDate(date){return date}}}
  }
 };
 context.window.top=context.window;
 vm.runInNewContext(source,context);
 return {context,dialog,occupiedDialog,elements,listeners,writes};
}

function clickTarget(seatId,tag='button',insideSeatAdmin=true){
 const card={dataset:{seatId},insideSeatAdmin};
 return tag==='button'?{closest(){return card}}:{closest(selector){assert.equal(selector,'[data-seat-id]');return card}};
}

test('seat cards use safe data attributes without inline JavaScript',()=>{
 const manager=createSeatManager();
 assert.match(manager.elements.seatAdmin.innerHTML,/<button type="button" class="simple-seat empty" data-seat-id="papa-2">/);
 assert.doesNotMatch(manager.elements.seatAdmin.innerHTML,/\sonclick=/);
 assert.doesNotMatch(source,/jsArg|onclick="manageSeat/);
 assert.match(html,/seats\.js\?v=43\.7\.1\.4/);
});

test('delegated seat clicks handle cards and their nested content exactly once',()=>{
 for(const tag of ['button','strong','span','em']){
  const manager=createSeatManager();
  manager.listeners['seat-admin:click']({target:clickTarget('papa-2',tag)});
  assert.equal(manager.dialog.open,true,`${tag} click should select the seat`);
  assert.equal(manager.dialog.showCount,1,`${tag} click should be handled once`);
 }
});

test('delegated clicks ignore empty space, outside elements, and unknown seats',()=>{
 const manager=createSeatManager();
 manager.listeners['seat-admin:click']({target:{closest(){return null}}});
 manager.listeners['seat-admin:click']({target:clickTarget('papa-2','span',false)});
 manager.listeners['seat-admin:click']({target:clickTarget('unknown-seat','span')});
 assert.equal(manager.dialog.open,false);
 assert.equal(manager.writes.length,0);
});

test('rerendering does not register another delegated click listener',()=>{
 const manager=createSeatManager();
 const listener=manager.listeners['seat-admin:click'];
 manager.context.render();
 manager.context.render();
 assert.equal(manager.listeners['seat-admin:click'],listener);
 listener({target:clickTarget('papa-2','strong')});
 assert.equal(manager.dialog.showCount,1);
});

test('empty seat uses the requested manual occupancy dialog',async()=>{
 assert.match(html,/>좌석 사용 시작</);
 assert.match(html,/>선택한 좌석을 사용중으로 변경하시겠습니까\?</);
 assert.match(html,/data-seat-occupancy-cancel>취소</);
 assert.match(html,/class="confirm" data-seat-occupancy-confirm>확인</);
 assert.match(css,/\.seat-occupancy-dialog-actions \.confirm\{[^}]*background:#ffd31a/);

 const manager=createSeatManager();
 await manager.context.manageSeat('papa-2');
 assert.equal(manager.dialog.open,true);
 assert.equal(manager.writes.length,0);
});

test('cancelling keeps an empty seat unchanged',async()=>{
 const manager=createSeatManager();
 await manager.context.manageSeat('papa-2');
 manager.listeners['cancel:click']();
 assert.equal(manager.dialog.open,false);
 assert.equal(manager.writes.length,0);
});

test('confirming updates only the existing seat document to occupied',async()=>{
 const manager=createSeatManager();
 await manager.context.manageSeat('papa-2');
 await manager.listeners['confirm:click']();
 assert.equal(manager.dialog.open,false);
 assert.equal(manager.writes.length,1);
 assert.equal(manager.writes[0].name,'seats');
 assert.equal(manager.writes[0].id,'papa-2');
 assert.equal(manager.writes[0].payload.status,'occupied');
 assert.equal(manager.writes[0].options.merge,true);
 assert.equal('orderId' in manager.writes[0].payload,false);
});

test('occupied and non-empty operational states do not open the new dialog',async()=>{
 const occupied=createSeatManager('occupied');
 await occupied.context.manageSeat('papa-2');
 assert.equal(occupied.dialog.open,false);
 assert.equal(occupied.occupiedDialog.open,true);

 for(const status of ['reserved','cleaning','inactive']){
  const manager=createSeatManager(status);
  await manager.context.manageSeat('papa-2');
  assert.equal(manager.dialog.open,false);
  assert.equal(manager.writes.length,0);
 }
});

test('held seats retain their existing confirmed clear behavior',async()=>{
 const manager=createSeatManager('held');
 manager.context.confirm=()=>true;
 await manager.context.manageSeat('papa-2');
 assert.equal(manager.dialog.open,false);
 assert.equal(manager.writes.length,1);
 assert.equal(manager.writes[0].id,'papa-2');
 assert.equal(manager.writes[0].payload.status,'empty');
});

test('occupied seat action dialog opens the existing order management entry',async()=>{
 assert.match(html,/>사용중 좌석</);
 assert.match(html,/>원하는 작업을 선택하세요\.</);
 for(const label of ['취소','주문관리 이동','사용가능으로 변경'])assert.match(html,new RegExp(`>${label}<`));
 const manager=createSeatManager('occupied');
 await manager.context.manageSeat('papa-2');
 manager.listeners['occupied-order:click']();
 assert.equal(manager.context.assignedUrl,'../admin/?seatId=papa-2');
 assert.equal(manager.writes.length,0);
});

test('occupied seat can be cleared through the existing updateSeat path',async()=>{
 const manager=createSeatManager('occupied');
 await manager.context.manageSeat('papa-2');
 await manager.listeners['occupied-clear:click']();
 assert.equal(manager.writes.length,1);
 assert.equal(manager.writes[0].name,'seats');
 assert.equal(manager.writes[0].id,'papa-2');
 assert.equal(manager.writes[0].payload.status,'empty');
 assert.equal(manager.writes[0].options.merge,true);
});
