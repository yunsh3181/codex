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
 assert.equal((html.match(/waiting-tv\.js\?v=10/g)||[]).length,1);assert.doesNotMatch(html,/waiting-tv\.js\?v=[89](?:["'])/);
 assert.equal((html.match(/waiting-tv-locales\.js\?v=1/g)||[]).length,1);
 assert.equal((html.match(/waiting-tv-locales\.css\?v=3/g)||[]).length,1);assert.doesNotMatch(html,/waiting-tv-locales\.css\?v=[12]/);
 assert.match(html,/speech\.js\?v=1/,'unchanged speech cache key stays intact');
});

test('waiting TV status line box keeps Windows glyph safety without shrinking unrelated text',()=>{
 assert.match(localeCss,/\.order-number \.order-status\{[^}]*font-size:max\(18px,calc\(var\(--waiting-order-label-size\) - 1px\)\)[^}]*line-height:1\.45[^}]*max-height:2\.9em/);
 assert.match(localeCss,/\.number-grid\[data-density="single"\] \.order-number \.order-status\{min-height:35px\}/);
 assert.doesNotMatch(localeCss,/overflow:hidden|transform:scale|margin-(?:top|bottom):-/);
});

test('waiting TV card typography prevents flex compression and restores safe identity line boxes',()=>{
 assert.match(localeCss,/\.order-number strong\{[^}]*width:100%[^}]*min-width:0[^}]*box-sizing:border-box[^}]*font-size:max\(18px,calc\(var\(--waiting-order-number-size\) - 1px\)\)[^}]*line-height:1\.5[^}]*flex-shrink:0/);
 assert.match(localeCss,/\.order-number:not\(\[lang="ko"\]\) strong\{[^}]*font-size:var\(--waiting-name-size\)[^}]*line-height:1\.51[^}]*overflow-wrap:anywhere[^}]*text-wrap:balance[^}]*max-height:calc\(3\.08em \+ 2px\)/);
 assert.match(localeCss,/\.number-grid\[data-density="triple"\] \.order-number strong\{line-height:1\.52\}/);
 assert.match(localeCss,/\.number-grid\[data-density="compact"\] \.order-number strong\{line-height:1\.53\}/);
 assert.match(localeCss,/\.number-grid\[data-density="dense"\] \.order-number strong\{line-height:1\.54\}/);
 assert.match(localeCss,/\.number-grid\[data-density="single"\] \.order-number strong\{line-height:1\.5\}/);
 assert.match(localeCss,/\.number-grid\[data-density="single"\] \.order-number:not\(\[lang="ko"\]\) strong\{line-height:1\.51;max-height:calc\(3\.02em \+ 2px\)\}/);
 assert.match(localeCss,/\.order-number\.name-length-long:not\(\[lang="ko"\]\) strong\{font-size:max\(18px,calc\(var\(--waiting-name-size\) \* \.9\)\)\}/);
 assert.match(localeCss,/\.order-number\.name-length-maximum:not\(\[lang="ko"\]\) strong\{font-size:max\(18px,calc\(var\(--waiting-name-size\) \* \.82\)\)\}/);
 assert.match(localeCss,/\.order-number \.order-status,\.order-number \.order-timing,\.order-number \.order-guidance\{flex-shrink:0\}/);
 assert.match(localeCss,/\.order-number \.order-timing,\.order-number \.order-guidance\{line-height:1\.4\}/);
 assert.match(localeCss,/\.order-number \.order-guidance\{max-height:2\.8em\}/);
 assert.doesNotMatch(localeCss,/text-overflow|ellipsis/);
});

test('waiting TV scales only foreign names beyond ten graphemes without changing input limits',()=>{
 assert.equal(context.waitingCustomerNameLengthClass({customerIdentityType:'phone_last4'}),'');
 for(const length of [1,10])assert.equal(context.waitingCustomerNameLengthClass({customerIdentityType:'name',customerDisplayName:'A'.repeat(length)}),'');
 for(const length of [11,15])assert.equal(context.waitingCustomerNameLengthClass({customerIdentityType:'name',customerDisplayName:'A'.repeat(length)}),' name-length-long');
 for(const length of [16,20])assert.equal(context.waitingCustomerNameLengthClass({customerIdentityType:'name',customerDisplayName:'A'.repeat(length)}),' name-length-maximum');
});

test('waiting TV typography measurement uses distinct semantic selectors',()=>{
 assert.match(densityVerifier,/querySelector\('\.order-guidance'\)/);
 assert.match(densityVerifier,/querySelector\('\.order-status'\)/);
 assert.doesNotMatch(densityVerifier,/label=card\?\.querySelector\('span'\)/);
 assert.match(densityVerifier,/guidances\[index\]!==statuses\[index\]/);
 for(const field of ['identityLength','lengthClass','orderCount','totalVertical','clipping'])assert.match(densityVerifier,new RegExp(field));
});
