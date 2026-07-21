const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-tablet.css'),'utf8');
const phoneCss=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');
const compact=css.replace(/\s+/g,'');

test('tablet card and grid activation remains runtime scoped',()=>{
  ['.card','.c-card','.darkBenefitCard','.darkSetCard','.sizeGuideCard','.crustTextCard','.setCrustCard',
    '.grid','.c-grid','.adaptiveCards','.crustGrid','.crustTextGrid','.setCrustGrid','.sizeGuideGrid','.halfPreview']
    .forEach(selector=>assert.ok(css.includes(selector),selector));
  assert.doesNotMatch(css,/html\[data-layout="phone"\]/);
  assert.match(css,/html\[data-layout="tablet"\]/);
});

test('tablet product grids use semantic wide-tablet columns',()=>{
  assert.ok(compact.includes('grid-template-columns:repeat(2,minmax(0,1fr))!important'));
  assert.match(compact,/\.sizeGuideGrid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
  assert.match(compact,/\.halfPreview\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  ['.grid.four','.darkBenefitGrid','.darkSetGrid','.crustTextGrid','.setCrustGrid']
    .forEach(selector=>assert.ok(css.includes(selector),selector));
});

test('compact tablets provide one and two column fallbacks',()=>{
  assert.match(css,/@media \(max-width: 680px\)/);
  assert.ok(compact.includes('grid-template-columns:minmax(0,1fr)!important'));
  assert.ok(compact.includes('.grid.four'));
  assert.ok(compact.includes('.drinkTextGrid'));
});

test('tablet cards contain content while preserving state ownership',()=>{
  assert.ok(compact.includes('min-width:0;max-width:100%'));
  assert.ok(compact.includes('overflow-wrap:anywhere'));
  assert.ok(compact.includes('word-break:keep-all'));
  assert.ok(compact.includes('white-space:nowrap'));
  ['.active','.disabled','.selected','.hidden','.on','.done'].forEach(state=>{
    assert.doesNotMatch(css,new RegExp(`\\${state}\\s*\\{`),`${state} must remain in legacy state layer`);
  });
});

test('tablet selection and quantity retain touch geometry',()=>{
  ['.optionBtn','.c-selection-control','.crustTextCard','.setCrustCard','.qty','.c-quantity-control']
    .forEach(selector=>assert.ok(css.includes(selector),selector));
  assert.ok(compact.includes('grid-template-columns:48pxminmax(42px,1fr)48px!important'));
  assert.ok(compact.includes('width:48px!important'));
  assert.ok(compact.includes('height:48px!important'));
  assert.ok(compact.includes('touch-action:manipulation'));
  assert.match(css,/:disabled/);
});

test('tablet product media stays contained at device-specific heights',()=>{
  assert.ok(compact.includes('object-fit:contain!important'));
  assert.ok(compact.includes('object-position:center!important'));
  ['height:160px!important','height:144px!important','height:132px!important','height:120px']
    .forEach(rule=>assert.ok(compact.includes(rule),rule));
});

test('phone card geometry remains unchanged and tablet rules cannot activate by default',()=>{
  assert.ok(phoneCss.includes('html[data-layout="phone"]'));
  assert.ok(phoneCss.replace(/\s+/g,'').includes('width:42px!important'));
  assert.doesNotMatch(css,/html:not\(\[data-layout="tablet"\]\)/);
  assert.doesNotMatch(css,/(^|,)\s*(body|\.card|\.grid)\s*\{/m);
});
