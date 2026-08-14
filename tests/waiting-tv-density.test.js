const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv.js'),'utf8');
const densitySource=source.slice(source.indexOf('function waitingOrderDensity'),source.indexOf('function renderDisplay'));
const context={};
vm.runInNewContext(densitySource,context);

test('waiting TV density maps visible order counts to five stable stages',()=>{
 assert.deepEqual(Array.from({length:9},(_,count)=>context.waitingOrderDensity(count)),[
  'single','single','double','triple','compact','dense','dense','dense','dense'
 ]);
});

test('waiting TV density calculation has no Firestore mutation path',()=>{
 const writes=[];
 const isolated={db:{collection(){return {add(...args){writes.push(args)},doc(){return {set(...args){writes.push(args)},update(...args){writes.push(args)},delete(...args){writes.push(args)}}}}}}};
 vm.runInNewContext(densitySource,isolated);
 for(const count of [0,1,2,3,4,5,24])isolated.waitingOrderDensity(count);
 assert.deepEqual(writes,[]);
});

test('waiting TV updates only the changed CSS and JS cache keys',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/index.html'),'utf8');
 assert.match(html,/waiting-tv\.css\?v=7/);assert.doesNotMatch(html,/waiting-tv\.css\?v=[3456]/);
 assert.match(html,/waiting-tv\.js\?v=6/);assert.doesNotMatch(html,/waiting-tv\.js\?v=5/);
 assert.match(html,/speech\.js\?v=1/,'unchanged speech cache key stays intact');
});
