'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const policy=require('../seat-capacity-policy');
const table=(id,zone,seats,status='empty',partySize=null,extra={})=>({id,zone,seats,doc:{status,partySize,...extra}});
const emptyAnnex=()=>[table('annex-1','annex',2),table('annex-2','annex',5),table('annex-3','annex',5),table('annex-4','annex',2)];
const emptyOutdoor=()=>[1,2,3,4].map(number=>table(`outdoor-${number}`,'outdoor',5));

test('uses explicit physical capacities without a four-seat fallback',()=>{
 assert.equal(policy.tableCapacity(table('a','annex',5)),5);assert.equal(policy.tableCapacity(table('legacy','annex',4)),4);assert.equal(policy.tableCapacity(table('small','annex',2)),2)
});
test('finds the minimum real table combination for all annex and outdoor party sizes',()=>{
 [1,1,1,1,1,2,2,2,2,2,3,3,3,3,3,4].forEach((count,index)=>assert.equal(policy.evaluateZone({zone:'outdoor',partySize:index+1,tables:emptyOutdoor()}).tableIds.length,count,`outdoor ${index+1}`));
 [1,1,1,1,1,2,2,2,2,2,3,3].forEach((count,index)=>assert.equal(policy.evaluateZone({zone:'annex',partySize:index+1,tables:emptyAnnex()}).tableIds.length,count,`annex ${index+1}`));
 assert.equal(policy.evaluateZone({zone:'outdoor',partySize:17,tables:emptyOutdoor()}).status,'full');assert.equal(policy.evaluateZone({zone:'annex',partySize:13,tables:emptyAnnex()}).status,'full')
});
test('five guests use one five-seat table and cannot choose two-seat or extra tables',()=>{
 assert.equal(policy.evaluateSelection({zone:'annex',partySize:5,tables:emptyAnnex(),selectedTableIds:['annex-2']}).canSeat,true);
 assert.equal(policy.evaluateSelection({zone:'annex',partySize:5,tables:emptyAnnex(),selectedTableIds:['annex-1']}).canSeat,false);
 assert.equal(policy.evaluateSelection({zone:'annex',partySize:5,tables:emptyAnnex(),selectedTableIds:['annex-2','annex-3']}).canSeat,false);
 assert.equal(policy.evaluateSelection({zone:'outdoor',partySize:5,tables:emptyOutdoor(),selectedTableIds:['outdoor-1']}).canSeat,true)
});
test('normal reserved and temporary held seats without partySize do not force review',()=>{
 const reserved=emptyAnnex();reserved[1].doc={status:'reserved',reservationPartySize:null,orderId:null};const result=policy.evaluateZone({zone:'annex',partySize:5,tables:reserved});assert.equal(result.status,'available');assert.deepEqual(result.tableIds,['annex-3']);
 const linked=emptyAnnex();linked[0].doc={status:'reserved',orderId:'reservation-1'};linked[1].doc={status:'reserved',orderId:'reservation-1'};assert.notEqual(policy.evaluateZone({zone:'annex',partySize:2,tables:linked}).status,'review');
 const held=emptyAnnex();held[1].doc={status:'held',heldBy:'other',orderId:null};assert.notEqual(policy.evaluateZone({zone:'annex',partySize:2,tables:held}).status,'review')
});
test('linked multi-table orders count partySize once and corrupt linked data fails closed',()=>{
 const occupied=[table('annex-1','annex',2,'occupied',6,{orderId:'order-1'}),table('annex-2','annex',5,'occupied',6,{orderId:'order-1'}),table('annex-3','annex',5),table('annex-4','annex',2)];const result=policy.evaluateZone({zone:'annex',partySize:5,tables:occupied});assert.equal(result.status,'available');assert.equal(result.occupied,6);
 const corrupt=emptyAnnex();corrupt[0].doc={status:'occupied',orderId:'order-broken'};assert.equal(policy.evaluateZone({zone:'annex',partySize:1,tables:corrupt}).status,'review');
 const oversized=emptyAnnex();oversized[0].doc={status:'reserved',reservationPartySize:3};assert.equal(policy.evaluateZone({zone:'annex',partySize:1,tables:oversized}).status,'review');
 const linkedOversized=emptyOutdoor();linkedOversized[0].doc={status:'occupied',partySize:6,orderId:'one-table-order'};assert.equal(policy.evaluateZone({zone:'outdoor',partySize:1,tables:linkedOversized}).status,'review')
});
test('manual occupied tables without partySize conservatively consume full capacity',()=>{
 const occupiedAt=new Date('2026-08-19T02:53:48.106Z'),annex=emptyAnnex();annex[1].doc={status:'occupied',orderId:null,occupiedAt};annex[2].doc={status:'occupied',orderId:null,occupiedAt};const two=policy.evaluateZone({zone:'annex',partySize:2,tables:annex});assert.equal(two.status,'available');assert.equal(two.occupied,10);assert.equal(policy.evaluateZone({zone:'annex',partySize:3,tables:annex}).status,'full');
 for(const doc of [{status:'occupied',orderId:null},{status:'occupied',orderId:null,occupiedAt:'damaged'}])assert.equal(policy.evaluateZone({zone:'annex',partySize:1,tables:[{id:'a',zone:'annex',seats:2,doc}]}).status,'review')
});
test('reserved occupied held and unknown states stay unavailable or fail closed',()=>{
 const fragmented=[table('x1','outdoor',2),table('x2','outdoor',2,'held',2),table('x3','outdoor',2,'occupied',2,{orderId:'order-x'})];assert.equal(policy.evaluateZone({zone:'outdoor',partySize:4,tables:fragmented}).reason,'table-combination');for(const status of ['held','occupied','reserved'])assert.equal(policy.evaluateZone({zone:'outdoor',partySize:1,tables:[table('x','outdoor',5,status,1,status==='occupied'?{orderId:'order-x'}:{})]}).canSeat,false);assert.equal(policy.evaluateZone({zone:'outdoor',partySize:1,tables:[table('x','outdoor',5,'broken',1)]}).status,'review')
});
