const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const source=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv.js'),'utf8');
class FakeNode{
 constructor(tagName='div'){this.tagName=tagName;this.children=[];this.parentNode=null;this.dataset={};this.className='';this.textContent='';this.classList={toggle(){}}}
 appendChild(node){node.remove();node.parentNode=this;this.children.push(node);return node}
 remove(){if(!this.parentNode)return;this.parentNode.children=this.parentNode.children.filter(child=>child!==this);this.parentNode=null}
 querySelectorAll(selector){return selector==='[data-order-key]'?this.children.filter(node=>node.dataset.orderKey):[]}
 querySelector(selector){return selector==='.empty'?this.children.find(node=>node.className==='empty')||null:null}
 addEventListener(){}
 get innerHTML(){return this.children.map(node=>`<${node.tagName} class="${node.className}"${node.dataset.orderKey?` data-order-key="${node.dataset.orderKey}"`:''}>${node.textContent}</${node.tagName}>`).join('')}
 set innerHTML(value){this.children=[];this.textContent=String(value)}
}
const elements=new Map();
const element=id=>{if(!elements.has(id))elements.set(id,new FakeNode());return elements.get(id)};
const subscriptions={publicOrderDisplays:[],manualCustomerCalls:[]};
const unsubscribeCounts={publicOrderDisplays:0,manualCustomerCalls:0};
const windowEvents={};
const intervalCallbacks=[];
const timeoutCallbacks=[];
let now=Date.parse('2026-07-22T01:00:00.000Z'); // 10:00 KST
const NativeDate=Date;
class FakeDate extends NativeDate{static now(){return now}}
const context={
 console:{debug(){},error(){}},Date:FakeDate,Intl,Map,Set,Promise,URLSearchParams,
 location:{hostname:'example.com',search:''},navigator:{onLine:true},
 localStorage:{getItem:()=> 'false',setItem(){},removeItem(){}},
 document:{getElementById:element,createElement:tag=>new FakeNode(tag)},
 window:{
  addEventListener(name,callback){windowEvents[name]=callback},
  setInterval(callback){intervalCallbacks.push(callback);return 7},clearInterval(){},
  setTimeout(callback,delay){timeoutCallbacks.push({callback,delay});return timeoutCallbacks.length},clearTimeout(){}
 },
 db:{collection(name){return {onSnapshot(options,next){
  const callback=typeof options==='function'?options:next;
  subscriptions[name].push(callback);
  return ()=>{unsubscribeCounts[name]++};
 }}}}
};
vm.runInNewContext(source,context);

const timestamp=value=>({toMillis:()=>value});
const doc=(id,orderNumber,displayStatus,updatedAt=now,businessDay)=>({id,data:()=>({orderNumber,displayStatus,updatedAt:timestamp(updatedAt),...(businessDay?{businessDay}:{})})});
const snapshot=(docs,{fromCache=false}={})=>({docs,size:docs.length,metadata:{fromCache}});
const emit=(name,docs,options)=>subscriptions[name].at(-1)(snapshot(docs,options));
const visibleKeys=id=>element(id).querySelectorAll('[data-order-key]').map(node=>node.dataset.orderKey);

assert.strictEqual(subscriptions.publicOrderDisplays.length,1,'public listener starts once');
assert.strictEqual(subscriptions.manualCustomerCalls.length,1,'manual listener starts once');
assert.deepStrictEqual(visibleKeys('cookingOrders'),[],'startup clears stale DOM state');

emit('publicOrderDisplays',[doc('a','1234','cooking')]);
assert.deepStrictEqual(visibleKeys('cookingOrders'),['order:a'],'created order is displayed by document id');
emit('publicOrderDisplays',[doc('a','1234','ready')]);
assert.deepStrictEqual(visibleKeys('cookingOrders'),[],'modified cooking order leaves cooking');
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:a'],'modified ready order remains visible');

emit('publicOrderDisplays',[doc('a','1234','completed')]);
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'completed modified event removes the DOM node');
emit('publicOrderDisplays',[doc('a','1234','cancelled')]);
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'cancelled modified event stays removed');

emit('publicOrderDisplays',[doc('a','7777','ready'),doc('b','7777','ready')]);
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:a','order:b'],'same order number with different document ids stays distinct');
emit('publicOrderDisplays',[doc('b','7777','ready')]);
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:b'],'removed document deletes only its keyed DOM node');
const fiveOrders=Array.from({length:5},(_,index)=>doc(`five-${index}`,String(4000+index),'ready'));
emit('publicOrderDisplays',fiveOrders);
emit('publicOrderDisplays',fiveOrders.map((entry,index)=>index===2?doc('five-2','4002','completed'):entry));
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:five-0','order:five-1','order:five-3','order:five-4'],'one completion removes only that order from five visible orders');
emit('publicOrderDisplays',[]);
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'empty snapshot removes every order node');

emit('publicOrderDisplays',[doc('old','9999','cooking',now,'2026-07-21')]);
assert.deepStrictEqual(visibleKeys('cookingOrders'),[],'previous business-day order is excluded');
emit('publicOrderDisplays',[doc('updated-after-opening','9999','ready',now,'2026-07-21')]);
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'updatedAt after opening cannot renew an immutable previous business day');
context.navigator.onLine=false;
emit('publicOrderDisplays',[doc('old-cache','9998','ready',Date.parse('2026-07-21T01:00:00.000Z')),doc('completed-cache','9997','completed')],{fromCache:true});
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'offline cache excludes previous-day and completed documents');
emit('publicOrderDisplays',[doc('cache','8888','ready')],{fromCache:true});
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:cache'],'current business-day cache may render during offline startup');
context.navigator.onLine=true;
emit('publicOrderDisplays',[]);
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'server snapshot replaces the temporary cache state completely');

emit('publicOrderDisplays',[doc('automatic','6666','ready')]);
emit('manualCustomerCalls',[doc('counter','6666','ready')]);
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:automatic','manual:counter'],'public and manual documents with the same number retain independent document keys');
emit('publicOrderDisplays',[]);
assert.deepStrictEqual(visibleKeys('readyOrders'),['manual:counter'],'deleting one collection document does not delete a distinct manual lifecycle');
emit('manualCustomerCalls',[]);

emit('publicOrderDisplays',[doc('boundary','5555','ready',Date.parse('2026-07-22T01:00:00.000Z'))]);
now=Date.parse('2026-07-22T15:00:00.000Z'); // midnight KST
context.renderAll();
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:boundary'],'midnight does not reset the current business day');
now=Date.parse('2026-07-22T23:59:00.000Z'); // 08:59 KST
context.renderAll();
assert.deepStrictEqual(visibleKeys('readyOrders'),['order:boundary'],'08:59 KST retains the previous business-day order');
now=Date.parse('2026-07-23T00:00:00.000Z'); // 09:00 KST
timeoutCallbacks[0].callback();
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'scheduled 09:00 KST refresh removes the previous business-day order');
now=Date.parse('2026-07-23T00:01:00.000Z'); // 09:01 KST
emit('publicOrderDisplays',[doc('new-day','5556','cooking',now)]);
assert.deepStrictEqual(visibleKeys('cookingOrders'),['order:new-day'],'09:01 KST new cooking order is displayed');

const stalePublicCallback=subscriptions.publicOrderDisplays[0];
context.startTvListeners();
assert.deepStrictEqual(unsubscribeCounts,{publicOrderDisplays:1,manualCustomerCalls:1},'listener recreation unsubscribes both old listeners');
assert.strictEqual(subscriptions.publicOrderDisplays.length,2,'exactly one replacement public listener is created');
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'listener recreation clears the prior snapshot immediately');
stalePublicCallback(snapshot([doc('stale-generation','9999','ready',now)]));
assert.deepStrictEqual(visibleKeys('readyOrders'),[],'stale listener generation cannot overwrite replacement state');
windowEvents.pagehide();
assert.deepStrictEqual(unsubscribeCounts,{publicOrderDisplays:2,manualCustomerCalls:2},'page teardown cleans up active listeners');

console.log('customer TV snapshot filtering, DOM diff removal, cache authority, business-day cleanup, and listener lifecycle passed');
