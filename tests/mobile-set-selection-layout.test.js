const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');
const compact=css.replace(/\s+/g,'');

test('phone set selection uses one compact full-width column',()=>{
 assert.ok(compact.includes('html[data-layout="phone"]body[data-step="setChoice"].darkSetGrid{grid-template-columns:minmax(0,1fr)!important;gap:5px!important;'));
 assert.ok(compact.includes('grid-template-columns:62pxminmax(0,1fr)auto'));
 assert.ok(compact.includes('min-height:91px!important'));
 assert.ok(compact.includes('aspect-ratio:auto!important'));
 assert.ok(compact.includes('.darkSetPage{padding-bottom:0!important;'));
});

test('phone set cards keep every text field visible and aligned',()=>{
 for(const area of ['badge','title','size','desc','price','action']){
  assert.ok(compact.includes(`grid-area:${area}`),`${area} keeps a stable grid area`);
 }
 assert.ok(compact.includes('.darkSetDesc{display:block!important'));
 assert.ok(compact.includes('overflow:visible!important'));
 assert.ok(compact.includes('-webkit-line-clamp:unset!important'));
 assert.ok(compact.includes('.darkSetSelect{display:inline-flex!important'));
});

test('set selection change remains phone-scoped',()=>{
 const rules=css.split('}').filter(rule=>rule.includes('body[data-step="setChoice"]'));
 assert.ok(rules.length>=10);
 rules.forEach(rule=>assert.ok(rule.includes('html[data-layout="phone"]')));
 assert.ok(html.includes('styles/device-phone.css?v=order-review-single-screen-v17'));
});
