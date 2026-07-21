const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DeviceManager,LayoutToken}=require('../device-manager.js');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-tablet.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const compact=css.replace(/\s+/g,'');
const layoutAt=(width,height)=>new DeviceManager({
 viewportSource:{innerWidth:width,innerHeight:height}
}).current().layout;

test('tablet portrait viewport matrix activates the tablet layout',()=>{
 [
  [768,1024],[810,1080],[820,1180],[834,1194],[1024,1366],[561,900]
 ].forEach(([width,height])=>assert.equal(layoutAt(width,height),LayoutToken.TABLET,`${width}x${height}`));
});

test('phone and default viewport matrices remain protected',()=>{
 [[390,844],[430,932],[560,900],[360,420],[375,667],[393,852]]
  .forEach(([width,height])=>assert.equal(layoutAt(width,height),LayoutToken.PHONE,`${width}x${height}`));
 [[844,390],[1024,768],[1080,1920],[1280,720]]
  .forEach(([width,height])=>assert.equal(layoutAt(width,height),LayoutToken.DEFAULT,`${width}x${height}`));
});

test('tablet stylesheet is runtime scoped and loaded after phone CSS',()=>{
 const link='<link rel="stylesheet" href="styles/device-tablet.css">';
 assert.ok(html.includes(link));
 assert.ok(html.indexOf(link)>html.indexOf('<link rel="stylesheet" href="styles/device-phone.css">'));
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map(rule=>rule.trim()).filter(Boolean);
 rules.filter(rule=>!rule.startsWith('@media')).forEach(rule=>{
  const selector=rule.split('{')[0];
  assert.ok(selector.includes('html[data-layout="tablet"]'),`unscoped selector: ${selector}`);
 });
 assert.doesNotMatch(css,/html\[data-layout="phone"\]/);
});

test('tablet page geometry uses a centered max width and safe areas',()=>{
 assert.ok(compact.includes('--tablet-content-max:880px'));
 assert.match(compact,/\.stage[^}]*\{[^}]*max-width:var\(--tablet-content-max\)!important/);
 assert.ok(compact.includes('margin-right:auto;margin-left:auto'));
 ['--safe-top','--safe-right','--safe-left','--safe-bottom'].forEach(token=>assert.ok(css.includes(`var(${token})`)));
 assert.ok(compact.includes('overflow-x:hidden'));
 assert.ok(compact.includes('overflow-y:auto'));
});

test('tablet foundations remain scoped away from checkout geometry',()=>{
 ['.head','.c-header','.progress','.c-progress','.c-grid','.summaryContainer','.sectionWrapper']
  .forEach(selector=>assert.ok(css.includes(selector),selector));
 assert.ok(compact.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
 ['.crustGrid','.sizeGuideGrid','.paymentGrid','.seatGrid','.adaptiveCards']
  .forEach(selector=>assert.ok(css.includes(`:not(${selector})`),`${selector} excluded`));
 assert.doesNotMatch(css,/\.checkout/);
});
