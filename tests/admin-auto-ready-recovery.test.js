const test=require('node:test');
const assert=require('node:assert/strict');
const operations=require('../admin-operations.js');

const timestamp=value=>({toMillis:()=>value,toDate:()=>new Date(value)});
const order=(overrides={})=>({id:'takeout-retry',orderType:'takeout',status:'cooking',autoReadyEnabled:true,readyDueAt:timestamp(1000),preparationStartedAt:timestamp(100),...overrides});
function harness({responses=[],currentTime=1000}={}){
 let current=order(),calls=0,notices=0,maxConcurrent=0,concurrent=0,nextTimer=1;
 const timers=new Map(),cleared=[];
 const coordinator=operations.createAutoReadyCoordinator({
  getCurrentOrder:id=>String(current?.id)===String(id)?current:null,now:()=>currentTime,
  setTimer:(callback,delay)=>{const id=nextTimer++;timers.set(id,{callback,delay});return id},clearTimer:id=>{cleared.push(id);timers.delete(id)},
  execute:async()=>{calls++;concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent);try{const response=responses.shift();if(response)throw Object.assign(new Error(response),{code:response})}finally{concurrent--}},
  onPermanentError:()=>{notices++}
 });
 const fire=async id=>{const entry=timers.get(id);assert.ok(entry);timers.delete(id);await entry.callback();await new Promise(resolve=>setImmediate(resolve))};
 return {coordinator,timers,cleared,fire,get current(){return current},set current(value){current=value},get calls(){return calls},get notices(){return notices},get maxConcurrent(){return maxConcurrent},set time(value){currentTime=value}};
}

test('A-B. unavailable creates one bounded retry through repeated snapshots and then succeeds once',async()=>{
 const h=harness({responses:['unavailable']});h.coordinator.reconcile([h.current]);const first=[...h.timers.keys()][0];await h.fire(first);
 assert.equal(h.calls,1);assert.equal(h.timers.size,1);assert.equal([...h.timers.values()][0].delay,15000);h.coordinator.reconcile([h.current]);h.coordinator.reconcile([h.current]);assert.equal(h.timers.size,1);
 await h.fire([...h.timers.keys()][0]);assert.equal(h.calls,2);assert.equal(h.timers.size,0);h.coordinator.reconcile([h.current]);assert.equal(h.timers.size,0);assert.equal(h.maxConcurrent,1);
});
test('C. permission-denied reports once and never schedules a retry',async()=>{
 const h=harness({responses:['permission-denied']});h.coordinator.reconcile([h.current]);await h.fire([...h.timers.keys()][0]);assert.equal(h.timers.size,0);assert.equal(h.notices,1);h.coordinator.reconcile([h.current]);h.coordinator.reconcile([h.current]);assert.equal(h.notices,1);assert.equal(h.timers.size,0);assert.equal(h.calls,1);
});
test('D. terminal stale errors never retry or notify',async()=>{
 for(const code of ['order/stale-state','order/stale-timer','order/not-found']){const h=harness({responses:[code]});h.coordinator.reconcile([h.current]);await h.fire([...h.timers.keys()][0]);assert.equal(h.timers.size,0);assert.equal(h.notices,0)}
});
test('E. deadline-pending reschedules for the exact remaining duration and completes once',async()=>{
 const h=harness({responses:['order/deadline-pending'],currentTime:500});h.coordinator.reconcile([h.current]);assert.equal([...h.timers.values()][0].delay,500);await h.fire([...h.timers.keys()][0]);assert.equal(h.calls,1);assert.equal([...h.timers.values()][0].delay,500);h.time=1000;await h.fire([...h.timers.keys()][0]);assert.equal(h.calls,2);assert.equal(h.timers.size,0);
});
test('F. an in-flight auto completion cannot be duplicated by reconcile',async()=>{
 let release;const gate=new Promise(resolve=>{release=resolve}),current=order(),timers=new Map();let calls=0,next=1;
 const coordinator=operations.createAutoReadyCoordinator({getCurrentOrder:()=>current,now:()=>1000,setTimer:(callback,delay)=>{const id=next++;timers.set(id,{callback,delay});return id},clearTimer:id=>timers.delete(id),execute:async()=>{calls++;await gate}});
 coordinator.reconcile([current]);const entry=[...timers.values()][0];timers.clear();const pending=entry.callback();coordinator.reconcile([current]);coordinator.reconcile([current]);assert.equal(calls,1);assert.equal(timers.size,0);release();await pending;assert.equal(calls,1);
});
test('G. a changed deadline or preparation start cancels the old timer and keeps one new identity',()=>{
 const h=harness({currentTime:0});h.coordinator.reconcile([h.current]);const old=[...h.timers.keys()][0];h.current=order({readyDueAt:timestamp(2000)});h.coordinator.reconcile([h.current]);assert.ok(h.cleared.includes(old));assert.equal(h.timers.size,1);assert.match([...h.coordinator.timers.values()][0].identity,/2000:100/);
 h.current=order({readyDueAt:timestamp(2000),preparationStartedAt:timestamp(200)});h.coordinator.reconcile([h.current]);assert.equal(h.timers.size,1);assert.match([...h.coordinator.timers.values()][0].identity,/2000:200/);
});
