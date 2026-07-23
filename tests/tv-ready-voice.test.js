const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const source=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv.js'),'utf8');
const spoken=[];
const subscriptions={};

class Utterance{
 constructor(text){this.text=text}
}

const element=()=>({innerHTML:'',textContent:'',className:'',classList:{toggle(){}},addEventListener(){}});
const context={
 console,
 Map,
 Promise,
 SpeechSynthesisUtterance:Utterance,
 document:{getElementById:()=>element()},
 navigator:{onLine:true},
 localStorage:{getItem:()=> 'true',setItem(){},removeItem(){}},
 window:{
  speechSynthesis:{
   getVoices:()=>[{lang:'ko-KR',name:'Korean'}],
   speak(utterance){
    spoken.push(utterance.text);
    queueMicrotask(()=>utterance.onend());
   }
  },
  addEventListener(){}
 },
 db:{collection(name){
  assert.ok(['publicOrderDisplays','manualCustomerCalls'].includes(name));
  return {onSnapshot(next){subscriptions[name]=next}};
 }}
};
vm.runInNewContext(source,context);

const doc=(id,orderNumber,displayStatus)=>({
 id,
 data:()=>({orderNumber,displayStatus,updatedAt:{toMillis:()=>1}})
});
const emit=(...docs)=>subscriptions.publicOrderDisplays({docs});
const flush=()=>new Promise(resolve=>setImmediate(resolve));

(async()=>{
 emit(doc('existing-ready','1111','ready'),doc('new-order','2222','cooking'));
 await flush();
 assert.deepStrictEqual(spoken,[],'initial snapshot never speaks existing ready orders');

 emit(doc('existing-ready','1111','ready'),doc('new-order','2222','ready'));
 await flush();
 assert.deepStrictEqual(spoken,['2222번 고객님, 주문이 준비되었습니다.'],'cooking to ready speaks once');

 emit(doc('existing-ready','1111','ready'),doc('new-order','2222','ready'));
 await flush();
 assert.strictEqual(spoken.length,1,'duplicate ready snapshot does not repeat speech');

 emit(
  doc('existing-ready','1111','ready'),
  doc('new-order','2222','ready'),
  doc('third','P3333','cooking'),
  doc('fourth','4444','cooking')
 );
 emit(
  doc('existing-ready','1111','ready'),
  doc('new-order','2222','ready'),
  doc('third','P3333','ready'),
  doc('fourth','4444','ready')
 );
 await flush();
 await flush();
 assert.deepStrictEqual(spoken,[
  '2222번 고객님, 주문이 준비되었습니다.',
  '3333번 고객님, 주문이 준비되었습니다.',
  '4444번 고객님, 주문이 준비되었습니다.'
 ],'simultaneous ready transitions are queued once per order');

 emit(doc('brand-new-ready','5555','ready'));
 await flush();
 assert.strictEqual(spoken.length,3,'an order first observed as ready is not announced');

 const manualDoc=(id,orderNumber,displayStatus,announceVersion)=>({
  id,data:()=>({orderNumber,displayStatus,announceVersion,updatedAt:{toMillis:()=>2}})
 });
 subscriptions.manualCustomerCalls({docs:[manualDoc('existing','6666','ready',1)]});
 await flush();
 assert.strictEqual(spoken.length,3,'existing manual ready calls are silent on TV reload');
 subscriptions.manualCustomerCalls({docs:[
  manualDoc('existing','6666','ready',1),
  manualDoc('direct','7777','ready',1)
 ]});
 await flush();
 assert.strictEqual(spoken.at(-1),'7777번 고객님, 주문이 준비되었습니다.','new direct-ready manual call speaks once');
 subscriptions.manualCustomerCalls({docs:[
  manualDoc('existing','6666','ready',1),
  manualDoc('direct','7777','ready',1)
 ]});
 await flush();
 assert.strictEqual(spoken.length,4,'duplicate manual snapshots stay silent');

 console.log('TV ready voice transition and duplicate-prevention checks passed');
})().catch(error=>{
 console.error(error);
 process.exitCode=1;
});
