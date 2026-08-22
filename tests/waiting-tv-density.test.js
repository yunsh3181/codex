const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv.js'),'utf8');
const localeCss=fs.readFileSync(path.resolve(__dirname,'../waiting-tv/waiting-tv-locales.css'),'utf8');
const densityVerifier=fs.readFileSync(path.resolve(__dirname,'../scripts/verify-waiting-tv-density.js'),'utf8');
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
 assert.equal((html.match(/waiting-tv\.css\?v=9/g)||[]).length,1);assert.doesNotMatch(html,/waiting-tv\.css\?v=8/);
 assert.equal((html.match(/waiting-tv\.js\?v=9/g)||[]).length,1);assert.doesNotMatch(html,/waiting-tv\.js\?v=8/);
 assert.equal((html.match(/waiting-tv-locales\.js\?v=1/g)||[]).length,1);
 assert.equal((html.match(/waiting-tv-locales\.css\?v=2/g)||[]).length,1);assert.doesNotMatch(html,/waiting-tv-locales\.css\?v=1/);
 assert.match(html,/speech\.js\?v=1/,'unchanged speech cache key stays intact');
});

test('waiting TV status line box keeps Windows glyph safety without shrinking unrelated text',()=>{
 assert.match(localeCss,/\.order-number \.order-status\{[^}]*font-size:max\(18px,calc\(var\(--waiting-order-label-size\) - 1px\)\)[^}]*line-height:1\.45[^}]*max-height:2\.9em/);
 assert.match(localeCss,/\.number-grid\[data-density="single"\] \.order-number \.order-status\{min-height:35px\}/);
 assert.doesNotMatch(localeCss,/overflow:hidden|transform:scale|margin-(?:top|bottom):-/);
});

test('waiting TV typography measurement uses distinct semantic selectors',()=>{
 assert.match(densityVerifier,/querySelector\('\.order-guidance'\)/);
 assert.match(densityVerifier,/querySelector\('\.order-status'\)/);
 assert.doesNotMatch(densityVerifier,/label=card\?\.querySelector\('span'\)/);
 assert.match(densityVerifier,/guidances\[index\]!==statuses\[index\]/);
});
