const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DeviceManager,LayoutToken}=require('../device-manager.js');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');
const foundations=fs.readFileSync(path.join(root,'styles/foundations.css'),'utf8');
const compact=value=>value.replace(/\s+/g,'');
const phoneCss=compact(css);
const layoutAt=(width,height)=>new DeviceManager({
  viewportSource:{innerWidth:width,innerHeight:height}
}).current().layout;

test('card, selection, quantity, and media aliases preserve legacy selectors',()=>{
  ['.c-card','.card','.sizeGuideCard','.darkBenefitCard','.darkSetCard','.c-selection-control','.optionBtn','.crustTextCard',
    '.setCrustCard','.c-quantity-control','.qty','.c-card-media','.imagePic']
    .forEach(selector=>assert.ok(foundations.includes(selector),`${selector} foundation`));
});

test('phone cards keep compact geometry, text wrapping, states, and prices',()=>{
  assert.match(phoneCss,/html\[data-layout="phone"\]:where\(\.card,\.c-card\)/);
  assert.ok(phoneCss.includes('border-radius:16px!important'));
  assert.ok(phoneCss.includes('padding:8px!important'));
  assert.ok(phoneCss.includes('overflow-wrap:anywhere'));
  assert.ok(phoneCss.includes('word-break:keep-all'));
  assert.ok(phoneCss.includes('white-space:nowrap'));
  assert.match(css,/:hover:not\(:disabled\)/);
  assert.ok(phoneCss.includes('min-height:150px!important'));
});

test('phone grids use one minmax column with the approved compact spacing',()=>{
  ['.grid','.c-grid','.grid.two','.grid.four','.crustGrid','.crustTextGrid',
    '.setCrustGrid','.halfPreview','.adaptiveCards']
    .forEach(selector=>assert.ok(css.includes(selector),`${selector} phone grid`));
  assert.ok(phoneCss.includes('grid-template-columns:minmax(0,1fr)!important'));
  assert.ok(phoneCss.includes('gap:7px!important'));
  assert.ok(phoneCss.includes('body[data-step].grid.adaptiveCards{gap:9px!important;}'));
});

test('phone selection controls retain active and disabled state ownership',()=>{
  ['.optionBtn','.c-selection-control','.crustTextCard','.setCrustCard']
    .forEach(selector=>assert.ok(css.includes(selector),`${selector} phone selection`));
  assert.match(css,/:disabled/);
  assert.doesNotMatch(css,/\.active\s*\{[^}]*content/);
  assert.ok(phoneCss.includes('min-height:42px'));
  assert.ok(phoneCss.includes('min-height:112px'));
});

test('phone quantity controls preserve 42px controls and touch behavior',()=>{
  assert.match(phoneCss,/html\[data-layout="phone"\]:where\(\.qty,\.c-quantity-control\)button/);
  assert.ok(phoneCss.includes('grid-template-columns:42pxminmax(34px,1fr)42px!important'));
  assert.ok(phoneCss.includes('width:42px!important'));
  assert.ok(phoneCss.includes('height:42px!important'));
  assert.ok(phoneCss.includes('touch-action:manipulation'));
});

test('phone product images retain containment and established heights',()=>{
  assert.ok(phoneCss.includes('object-fit:contain!important'));
  assert.ok(phoneCss.includes('object-position:center!important'));
  ['height:118px!important','height:103px!important','height:92px!important',
    'height:72px','height:105px']
    .forEach(rule=>assert.ok(phoneCss.includes(rule),rule));
});

test('activation remains limited to portrait phone viewports',()=>{
  const cases=[
    [390,844,LayoutToken.PHONE],
    [430,932,LayoutToken.PHONE],
    [560,900,LayoutToken.PHONE],
    [561,900,LayoutToken.TABLET],
    [844,390,LayoutToken.DEFAULT],
    [820,1180,LayoutToken.TABLET],
    [1080,1920,LayoutToken.KIOSK21],
    [1280,720,LayoutToken.DEFAULT]
  ];
  cases.forEach(([width,height,expected])=>{
    assert.equal(layoutAt(width,height),expected,`${width}x${height}`);
  });
  assert.doesNotMatch(css,/^\s*@media/m);
  assert.match(css,/html\[data-layout="phone"\]/);
});
