const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DeviceManager,LayoutToken}=require('../device-manager.js');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-kiosk21.css'),'utf8');
const phoneCss=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');
const tabletCss=fs.readFileSync(path.join(root,'styles/device-tablet.css'),'utf8');
const compact=css.replace(/\s+/g,'');
const layoutAt=(width,height)=>new DeviceManager({
  viewportSource:{innerWidth:width,innerHeight:height}
}).current().layout;

test('kiosk card selectors remain limited to the runtime scope',()=>{
  assert.match(css,/html\[data-layout="kiosk21"\]/);
  assert.doesNotMatch(css,/html\[data-layout="(?:phone|tablet|default)"\]/);
  ['.card','.productCard','.pizzaCard','.sideCard','.drinkCard','.menuCard']
    .forEach(selector=>assert.ok(css.includes(selector),selector));
});

test('phone, tablet, and default layouts remain protected',()=>{
  [[390,844],[430,932],[560,900]].forEach(([w,h])=>assert.equal(layoutAt(w,h),LayoutToken.PHONE));
  [[768,1024],[820,1180],[1024,1366]].forEach(([w,h])=>assert.equal(layoutAt(w,h),LayoutToken.TABLET));
  [[1920,1080],[1280,720],[1024,768]].forEach(([w,h])=>assert.equal(layoutAt(w,h),LayoutToken.DEFAULT));
  assert.ok(phoneCss.includes('html[data-layout="phone"]'));
  assert.ok(tabletCss.includes('html[data-layout="tablet"]'));
});

test('kiosk product grids use three contained columns while excluded grids stay untouched',()=>{
  assert.ok(compact.includes('grid-template-columns:repeat(3,minmax(0,1fr))!important'));
  assert.ok(compact.includes('body:is([data-step="pizza"],[data-step="topping"],[data-step="side"],[data-step="drink"],[data-step="accompaniment"]).grid.adaptiveCards'));
  ['.adaptiveCards','.pizzaGrid','.sideGrid','.drinkGrid','.accompanimentGrid']
    .forEach(selector=>assert.ok(css.includes(selector),selector));
  ['.seatGrid','.areaGrid','.tableGrid','.paymentGrid','.modalGrid']
    .forEach(selector=>assert.ok(css.includes(`:not(${selector})`),`${selector} exclusion`));
});

test('product cards contain stable touch geometry and content',()=>{
  ['box-sizing:border-box','width:100%','min-height:280px','overflow:hidden']
    .forEach(rule=>assert.ok(compact.includes(rule),rule));
  ['.active','.selected',':disabled'].forEach(state=>assert.ok(css.includes(state),state));
  ['.hidden','.on','.done'].forEach(state=>assert.doesNotMatch(css,new RegExp(`\\${state}\\s*\\{`)));
});

test('product media stays uniformly contained',()=>{
  assert.ok(compact.includes('min-height:180px'));
  assert.ok(compact.includes('object-fit:contain!important'));
  assert.ok(compact.includes('object-position:center!important'));
});

test('names and descriptions clamp safely while prices do not wrap',()=>{
  assert.ok(compact.includes('-webkit-line-clamp:2'));
  assert.ok(compact.includes('-webkit-line-clamp:3'));
  assert.ok(compact.includes('overflow-wrap:anywhere'));
  assert.ok(compact.includes('white-space:nowrap'));
});

test('quantity controls retain balanced 64px touch targets',()=>{
  assert.ok(compact.includes('grid-template-columns:64pxminmax(64px,1fr)64px!important'));
  assert.ok(compact.includes('width:64px!important'));
  assert.ok(compact.includes('height:64px!important'));
  assert.ok(compact.includes('touch-action:manipulation'));
  assert.ok(css.includes(':disabled'));
});

test('size, dough, crust, and option cards retain at least 120px height',()=>{
  ['.optionBtn','.sizeGuideCard','.doughCard','.crustCard','.crustTextCard','.setCrustCard']
    .forEach(selector=>assert.ok(css.includes(selector),selector));
  assert.ok(compact.includes('min-height:120px'));
});

test('kiosk portrait matrix activates without horizontal page overflow',()=>{
  [[1080,1920],[1200,1920],[1280,1920]].forEach(([w,h])=>{
    assert.equal(layoutAt(w,h),LayoutToken.KIOSK21,`${w}x${h}`);
  });
  assert.ok(compact.includes('overflow-x:hidden'));
  assert.ok(compact.includes('min-width:0'));
  assert.ok(compact.includes('max-width:100%'));
});
