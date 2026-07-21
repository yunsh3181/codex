const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DeviceManager,LayoutToken}=require('../device-manager.js');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');
const tokens=fs.readFileSync(path.join(root,'styles/tokens.css'),'utf8');

const compact=value=>value.replace(/\s+/g,'');
const phoneCss=compact(css);
const tokenValue=name=>tokens.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim();
const layoutAt=(width,height)=>new DeviceManager({
  viewportSource:{innerWidth:width,innerHeight:height}
}).current().layout;

test('phone CTA and order summary retain the established geometry tokens',()=>{
  assert.equal(tokenValue('--selection-footer-height'),'104px');
  assert.equal(tokenValue('--order-summary-height'),'92px');
  assert.equal(tokenValue('--order-summary-bottom'),'0px');
  assert.equal(tokenValue('--safe-bottom'),'env(safe-area-inset-bottom, 0px)');
  assert.match(phoneCss,/html\[data-layout="phone"\]:where\(\.selectionFooter,\.c-selection-footer\)/);
  assert.ok(phoneCss.includes('height:var(--selection-footer-height)'));
  assert.ok(phoneCss.includes('height:var(--order-summary-height)!important'));
});

test('phone CTA sits above the summary and safe area while the summary keeps its default bottom without a CTA',()=>{
  assert.ok(phoneCss.includes('bottom:calc(var(--order-summary-bottom)+var(--order-summary-height)+var(--safe-bottom))'));
  assert.ok(phoneCss.includes(':where(.cartbar,.c-order-summary){position:fixed;bottom:var(--order-summary-bottom)'));
  assert.ok(phoneCss.includes('height:calc(var(--order-summary-height)+var(--safe-bottom))!important'));
  assert.ok(phoneCss.includes('padding-bottom:calc(8px+var(--safe-bottom))!important'));
});

test('phone spacer reserves the fixed CTA, summary, safe area, and existing margin',()=>{
  assert.match(phoneCss,/html\[data-layout="phone"\]:where\(\.selectionFooterSpacer,\.c-selection-footer-spacer\)/);
  assert.ok(phoneCss.includes('height:calc(var(--selection-footer-height)+var(--order-summary-height)+var(--safe-bottom)+var(--selection-footer-margin))'));
});

test('CTA and summary activation is limited to phone portrait viewports',()=>{
  const cases=[
    [390,844,LayoutToken.PHONE],
    [430,932,LayoutToken.PHONE],
    [560,900,LayoutToken.PHONE],
    [561,900,LayoutToken.DEFAULT],
    [844,390,LayoutToken.DEFAULT],
    [820,1180,LayoutToken.DEFAULT],
    [1080,1920,LayoutToken.DEFAULT],
    [1280,720,LayoutToken.DEFAULT]
  ];
  cases.forEach(([width,height,expected])=>{
    assert.equal(layoutAt(width,height),expected,`${width}x${height}`);
  });
  assert.doesNotMatch(css,/^\s*@media/m);
});
