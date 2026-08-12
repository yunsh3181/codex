const test=require('node:test');
const assert=require('node:assert/strict');
const {normalizeAdminSeatStatus,getAdminSeatActions,transitionAdminSeatState}=require('../admin-operations');

test('admin seat status normalization preserves reserved and quarantines explicit unknown values',()=>{
 assert.equal(normalizeAdminSeatStatus(null),'empty');assert.equal(normalizeAdminSeatStatus(undefined),'empty');
 for(const status of ['empty','held','occupied','reserved'])assert.equal(normalizeAdminSeatStatus(status),status);
 assert.equal(normalizeAdminSeatStatus('mystery'),'unknown');
});

test('shared actions have the required labels, order, and confirmations',()=>{
 assert.deepEqual(getAdminSeatActions('empty').map(({label,target})=>({label,target})),[{label:'사용',target:'occupied'},{label:'예약',target:'reserved'}]);
 assert.deepEqual(getAdminSeatActions('reserved').map(({label,target})=>({label,target})),[{label:'사용',target:'occupied'},{label:'빈자리',target:'empty'}]);
 assert.deepEqual(getAdminSeatActions('occupied').map(({label,target})=>({label,target})),[{label:'빈자리',target:'empty'}]);
 assert.deepEqual(getAdminSeatActions('held'),[]);assert.deepEqual(getAdminSeatActions('unknown'),[]);
 assert.equal(getAdminSeatActions('reserved')[0].confirmation,'예약 좌석의 이용을 시작하고 사용중으로 변경할까요?');
});

function database(initial){let data=initial&&{...initial},writes=0,transactions=0;return {get data(){return data},get writes(){return writes},get transactions(){return transactions},collection(){return {doc(id){return {id}}}},async runTransaction(callback){transactions++;let pending;const result=await callback({get:async()=>({exists:Boolean(data),data:()=>({...data})}),set(_ref,payload){pending=payload}});if(pending){data={...data,...pending};writes++}return result}}}
test('production transition rechecks server state and writes exactly one seat document',async()=>{
 const db=database({status:'reserved',orderId:null});const result=await transitionAdminSeatState({db,seatId:'papa-2',expectedStatus:'reserved',targetStatus:'occupied',serverTimestamp:()=> 'SERVER',supportedSeatIds:['papa-2']});
 assert.equal(db.data.status,'occupied');assert.equal(db.data.occupiedAt,'SERVER');assert.equal(db.writes,1);assert.deepEqual(result,{seatId:'papa-2',from:'reserved',to:'occupied',seatWrites:1,orderWrites:0,publicOrderDisplayWrites:0,paymentCalls:0});
});
test('held, unknown, missing, linked, unsupported, and stale transitions write nothing',async()=>{
 const cases=[
  [{status:'held'},'held','empty','seat/invalid-transition'],[{status:'mystery'},'unknown','empty','seat/invalid-transition'],[null,'empty','occupied','seat/not-found'],[{status:'empty',orderId:'order-1'},'empty','occupied','seat/order-linked'],[{status:'reserved'},'empty','occupied','seat/stale-state']
 ];
 for(const [initial,from,to,code] of cases){const db=database(initial);await assert.rejects(transitionAdminSeatState({db,seatId:'papa-2',expectedStatus:from,targetStatus:to,serverTimestamp:()=>1,supportedSeatIds:['papa-2']}),error=>error.code===code);assert.equal(db.writes,0)}
 const db=database({status:'empty'});await assert.rejects(transitionAdminSeatState({db,seatId:'bad',expectedStatus:'empty',targetStatus:'occupied',serverTimestamp:()=>1,supportedSeatIds:['papa-2']}),error=>error.code==='seat/unsupported-id');assert.equal(db.transactions,0);
});
