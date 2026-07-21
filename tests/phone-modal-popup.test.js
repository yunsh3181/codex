const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DeviceManager,LayoutToken}=require('../device-manager.js');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const compact=value=>value.replace(/\s+/g,'');
const phoneCss=compact(css);
const layoutAt=(width,height)=>new DeviceManager({
  viewportSource:{innerWidth:width,innerHeight:height}
}).current().layout;

test('phone backdrop remains viewport scoped and accounts for every safe area edge',()=>{
  assert.match(phoneCss,/html\[data-layout="phone"\]:where\(\.backdrop,\.c-popup-backdrop\)\{/);
  assert.ok(phoneCss.includes('inset:0'));
  assert.ok(phoneCss.includes('max-width:100vw'));
  assert.ok(phoneCss.includes('padding-top:calc(18px+var(--safe-top))'));
  assert.ok(phoneCss.includes('padding-right:calc(18px+var(--safe-right))'));
  assert.ok(phoneCss.includes('padding-bottom:calc(18px+var(--safe-bottom))'));
  assert.ok(phoneCss.includes('padding-left:calc(18px+var(--safe-left))'));
  assert.ok(phoneCss.includes('overflow-x:hidden'));
});

test('every existing phone modal surface is bounded and internally scrollable',()=>{
  for(const selector of ['.c-popup','.modal','.upsellModal','.finalUpsellModal','.benefitHelperModal']){
    assert.ok(css.includes(selector),`${selector} remains selected`);
  }
  assert.ok(phoneCss.includes('max-width:100%'));
  assert.ok(phoneCss.includes('max-height:100%'));
  assert.ok(phoneCss.includes('overflow-y:auto'));
  assert.ok(phoneCss.includes('overscroll-behavior:contain'));
  assert.ok(phoneCss.includes('width:min(var(--popup-width),100%)'));
});

test('phone modal actions remain visible, ordered, and safe-area aware',()=>{
  for(const selector of ['.modalBtns','.upsellActions','.finalUpsellGrid','.benefitActions']){
    assert.ok(css.includes(selector),`${selector} remains selected`);
  }
  assert.ok(phoneCss.includes('grid-template-columns:minmax(0,1fr)!important'));
  assert.ok(phoneCss.includes('padding-bottom:var(--safe-bottom)'));
  assert.ok(phoneCss.includes('overflow-wrap:anywhere'));
  assert.ok(phoneCss.includes('white-space:normal'));
});

test('phone popup activation matches all required portrait and default viewports',()=>{
  const cases=[
    [390,844,LayoutToken.PHONE],
    [430,932,LayoutToken.PHONE],
    [560,900,LayoutToken.PHONE],
    [561,900,LayoutToken.TABLET],
    [844,390,LayoutToken.DEFAULT],
    [820,1180,LayoutToken.TABLET],
    [1080,1920,LayoutToken.DEFAULT],
    [1280,720,LayoutToken.DEFAULT]
  ];
  cases.forEach(([width,height,expected])=>{
    assert.equal(layoutAt(width,height),expected,`${width}x${height}`);
  });
  assert.doesNotMatch(css,/^\s*@media/m);
});

test('legacy popup markup and CTA/summary geometry remain intact',()=>{
  for(const selector of ['backdrop','modal','upsellModal','finalUpsellModal','benefitHelperModal']){
    assert.ok(html.includes(selector),`${selector} remains in the existing UI`);
  }
  assert.ok(phoneCss.includes('height:var(--selection-footer-height)'));
  assert.ok(phoneCss.includes('height:var(--order-summary-height)!important'));
  assert.ok(phoneCss.includes('bottom:var(--order-summary-bottom)'));
});
