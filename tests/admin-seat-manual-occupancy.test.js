const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'seats.js'),'utf8');
const html=fs.readFileSync(path.join(root,'seat/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'seats.css'),'utf8');

function createSeatManager(initial='empty',dbOverride=null,options={}){
 const initialData=typeof initial==='string'?{status:initial}:{...initial};
 const writes=[],alerts=[];
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
 const seatSnapshot={forEach(callback){callback({id:'papa-2',data:()=>({...initialData})})}};
 const emptySnapshot={docs:[]};
 const db={
 runTransaction:async callback=>{options.beforeTransaction?.();return callback({get:async ref=>({exists:true,data:()=>({...initialData})}),set(ref,payload,writeOptions){writes.push({name:'seats',id:ref.id,payload,options:writeOptions});Object.assign(initialData,payload)}})},
 collection(name){return {
  doc(id){return {id,async set(payload,options){writes.push({name,id,payload,options})}}},
  onSnapshot(success){success(name==='seats'?seatSnapshot:emptySnapshot)}
 }}};
 const context={
  console,db:dbOverride||db,
  document:{
   body:{classList:{add(){}}},
   getElementById(id){return elements[id]},
   querySelector(selector){return buttons[selector]||null}
  },
  window:{top:null,PJ_BOTTLE_SEAT_POLICY:{SUPPORTED_END_YEAR:2030,isBottleSeat:id=>String(id).startsWith('annex-')||String(id).startsWith('room-'),getBottleSeatAvailability:()=>({available:options.available!==false,reason:options.available===false?'after-close':'open'}),millisecondsUntilNextBoundary:()=>86400000}},location:{replace(){},assign(url){context.assignedUrl=url}},encodeURIComponent,alert(message){alerts.push(message)},confirm(){return false},prompt(){return null},
  setInterval(){},
  firebase:{
   auth(){return {onAuthStateChanged(callback){callback({getIdTokenResult:async()=>({claims:{admin:true}})})},signOut:async()=>{}}},
   firestore:{FieldValue:{serverTimestamp(){return 'SERVER_TIMESTAMP'}},Timestamp:{fromDate(date){return date}}}
  }
 };
 context.window.top=context.window;
 vm.runInNewContext(source,context);
 return {context,dialog,occupiedDialog,elements,listeners,writes,alerts,initialData};
}

function clickTarget(seatId,tag='button',insideSeatAdmin=true){
 const card={dataset:{seatId},insideSeatAdmin};
 return {closest(selector){if(selector==='[data-reserve-seat],[data-cancel-reservation]')return null;if(selector==='[data-seat-id]')return card;return null}};
}

test('seat cards use safe data attributes without inline JavaScript',()=>{
 const manager=createSeatManager();
 assert.match(manager.elements.seatAdmin.innerHTML,/<button type="button" class="simple-seat empty" data-seat-id="papa-2"\s*>/);
 assert.doesNotMatch(manager.elements.seatAdmin.innerHTML,/\sonclick=/);
 assert.doesNotMatch(source,/jsArg|onclick="manageSeat/);
 assert.match(html,/seats\.js\?v=43\.10\.0/);
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

test('empty seats can be reserved transactionally and show a cancel action',async()=>{
 const manager=createSeatManager('empty');
 assert.match(manager.elements.seatAdmin.innerHTML,/data-reserve-seat="papa-2"[^>]*>예약<\/button>/);
 await manager.context.reserveSeat('papa-2');
 assert.equal(manager.writes.length,1);
 assert.equal(manager.writes[0].payload.status,'reserved');
 assert.equal(manager.writes[0].payload.reservedAt,'SERVER_TIMESTAMP');
});

test('reserved seats cannot open occupancy and can return to empty after confirmation',async()=>{
 const manager=createSeatManager('reserved');
 assert.match(manager.elements.seatAdmin.innerHTML,/예약 취소<\/button>/);
 await manager.context.manageSeat('papa-2');
 assert.equal(manager.dialog.open,false);
 manager.context.confirm=()=>true;
 await manager.context.cancelSeatReservation('papa-2');
 assert.equal(manager.writes[0].payload.status,'empty');
 assert.equal(manager.writes[0].payload.reservedAt,null);
});

test('held seat without orderId warns before reservation and clears its lease',async()=>{
 const manager=createSeatManager({status:'held',heldBy:'customer-1',heldAt:'OLD',heldUntil:'LATER',partySize:2});
 assert.match(manager.elements.seatAdmin.innerHTML,/class="seat-reservation-action warning"[^>]*>⚠ 주문중 좌석 예약<\/button>/);
 let message='';manager.context.confirm=value=>(message=value,true);
 await manager.context.reserveSeat('papa-2');
 assert.equal(message,'현재 고객이 주문 중인 좌석입니다. 예약하면 고객의 진행 중인 주문이 초기화됩니다. 예약하시겠습니까?');
 assert.deepEqual(
  {status:manager.writes[0].payload.status,heldBy:manager.writes[0].payload.heldBy,heldAt:manager.writes[0].payload.heldAt,heldUntil:manager.writes[0].payload.heldUntil,partySize:manager.writes[0].payload.partySize},
  {status:'reserved',heldBy:null,heldAt:null,heldUntil:null,partySize:null}
 );
});

test('cancelling the held-seat warning performs no write',async()=>{
 const manager=createSeatManager({status:'held',heldBy:'customer-1'});
 manager.context.confirm=()=>false;
 await manager.context.reserveSeat('papa-2');
 assert.equal(manager.writes.length,0);
});

test('held seats with orderId, occupied, reserved, and unknown states cannot be reserved',async()=>{
 for(const initial of [{status:'held',orderId:'order-1'},{status:'occupied'},{status:'reserved'},{status:'mystery'}]){
  const manager=createSeatManager(initial);
  assert.doesNotMatch(manager.elements.seatAdmin.innerHTML,/data-reserve-seat="papa-2"/);
  await manager.context.reserveSeat('papa-2');
  assert.equal(manager.writes.length,0);
 }
});

test('bottle reservation rechecks hours inside transaction while cancellation remains allowed',async()=>{
 const boundary={available:true,beforeTransaction(){this.available=false}};
 const manager=createSeatManager('empty',null,boundary);
 await manager.context.reserveSeat('annex-1');
 assert.equal(manager.writes.length,0);
 assert.equal(manager.initialData.status,'empty');
 assert.deepEqual(manager.alerts,['운영시간 외에는 예약할 수 없습니다.']);
 const heldBoundary={available:true,beforeTransaction(){this.available=false}};
 const held=createSeatManager({status:'held',heldBy:'customer-1'},null,heldBoundary);held.context.confirm=()=>true;
 await held.context.reserveSeat('annex-1');
 assert.equal(held.writes.length,0);assert.equal(held.initialData.status,'held');
 const cancellation=createSeatManager('reserved',null,{available:false});cancellation.context.confirm=()=>true;
 await cancellation.context.cancelSeatReservation('annex-1');
 assert.equal(cancellation.writes.length,1);assert.equal(cancellation.writes[0].payload.status,'empty');
});

test('bottle manual occupancy rechecks hours on confirm while existing occupied release remains allowed',async()=>{
 const boundary={available:true};const manager=createSeatManager('empty',null,boundary);
 await manager.context.manageSeat('annex-1');assert.equal(manager.dialog.open,true);
 boundary.available=false;await manager.listeners['confirm:click']();
 assert.equal(manager.dialog.open,false);assert.equal(manager.writes.length,0);assert.equal(manager.initialData.status,'empty');
 assert.deepEqual(manager.alerts,['운영시간 외에는 사용중으로 변경할 수 없습니다.']);
 const occupied=createSeatManager('occupied',null,{available:false});vm.runInContext("docs['annex-1']={status:'occupied'};render()",occupied.context);await occupied.context.manageSeat('annex-1');await occupied.listeners['occupied-clear:click']();
 assert.equal(occupied.writes.length,1);assert.equal(occupied.writes[0].payload.status,'empty');
});

test('two concurrent admin reservation transactions allow exactly one winner',async()=>{
 const shared={status:'held',heldBy:'customer-1',writes:0};let locked=Promise.resolve();
 const sharedDb={collection(name){return {doc(id){return {id}},onSnapshot(success){if(name==='seats')success({forEach(callback){callback({id:'papa-2',data:()=>({status:'held',heldBy:'customer-1'})})}});else success({docs:[]})}}},runTransaction(callback){const run=locked.then(async()=>{let pending=null;await callback({get:async()=>({exists:true,data:()=>({...shared})}),set(ref,payload){pending=payload}});if(pending){Object.assign(shared,pending);shared.writes+=1}});locked=run.catch(()=>{});return run}};
 const first=createSeatManager({status:'held',heldBy:'customer-1'},sharedDb),second=createSeatManager({status:'held',heldBy:'customer-1'},sharedDb);
 first.context.confirm=second.context.confirm=()=>true;
 await Promise.all([first.context.reserveSeat('papa-2'),second.context.reserveSeat('papa-2')]);
 assert.equal(shared.writes,1);
 assert.equal(shared.status,'reserved');
 assert.equal(shared.heldBy,null);
});
