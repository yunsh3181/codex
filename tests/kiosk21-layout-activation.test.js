const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DeviceManager,LayoutToken}=require('../device-manager.js');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-kiosk21.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const compact=css.replace(/\s+/g,'');
const layoutAt=(width,height)=>new DeviceManager({
 viewportSource:{innerWidth:width,innerHeight:height}
}).current().layout;

test('kiosk21 layout token and portrait viewport matrix activate',()=>{
 assert.equal(LayoutToken.KIOSK21,'kiosk21');
 [[1080,1920],[1200,1920],[1280,1920]]
  .forEach(([width,height])=>assert.equal(layoutAt(width,height),LayoutToken.KIOSK21,`${width}x${height}`));
});

test('phone, tablet, and default viewport matrices remain protected',()=>{
 [[360,420],[375,667],[390,844],[393,852],[430,932],[560,900]]
  .forEach(([width,height])=>assert.equal(layoutAt(width,height),LayoutToken.PHONE,`${width}x${height}`));
 [[561,900],[640,960],[680,1024],[768,1024],[810,1080],[820,1180],[834,1194],[1024,1366]]
  .forEach(([width,height])=>assert.equal(layoutAt(width,height),LayoutToken.TABLET,`${width}x${height}`));
 [[1920,1080],[1280,720],[1024,768],[844,390]]
  .forEach(([width,height])=>assert.equal(layoutAt(width,height),LayoutToken.DEFAULT,`${width}x${height}`));
});

test('kiosk stylesheet is runtime scoped and loaded after existing device CSS',()=>{
 const phone='<link rel="stylesheet" href="styles/device-phone.css">';
 const tablet='<link rel="stylesheet" href="styles/device-tablet.css">';
 const kiosk='<link rel="stylesheet" href="styles/device-kiosk21.css">';
 assert.ok(html.indexOf(phone)<html.indexOf(tablet));
 assert.ok(html.indexOf(tablet)<html.indexOf(kiosk));
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map(rule=>rule.trim()).filter(Boolean);
 rules.filter(rule=>!rule.startsWith('@media')).forEach(rule=>{
  const selector=rule.split('{')[0];
  assert.ok(selector.includes('html[data-layout="kiosk21"]'),`unscoped selector: ${selector}`);
 });
 assert.doesNotMatch(css,/html\[data-layout="(?:phone|tablet|default)"\]/);
});

test('kiosk page, header, progress, and stage share centered geometry',()=>{
 assert.ok(compact.includes('--kiosk21-content-max:960px'));
 assert.ok(compact.includes('max-width:var(--kiosk21-content-max)!important'));
 assert.ok(compact.includes('margin-right:auto;margin-left:auto'));
 ['.head','.c-header','.progress','.c-progress','.stage','.mainContent','.sectionWrapper','.summaryContainer']
  .forEach(selector=>assert.ok(css.includes(selector),selector));
 assert.ok(compact.includes('overflow-x:hidden'));
 assert.ok(compact.includes('overflow-y:auto'));
});

test('generic grids use contained columns while specialized grids remain excluded',()=>{
 assert.ok(compact.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
 assert.ok(compact.includes('grid-template-columns:repeat(3,minmax(0,1fr))'));
 ['.adaptiveCards','.crustGrid','.sizeGuideGrid','.paymentGrid','.seatGrid','.areaGrid','.tableGrid','.modalGrid']
  .forEach(selector=>assert.ok(css.includes(`:not(${selector})`),`${selector} excluded`));
});

test('kiosk foundation consumes every existing safe-area token',()=>{
 ['--safe-top','--safe-right','--safe-bottom','--safe-left']
  .forEach(token=>assert.ok(css.includes(`var(${token})`),token));
});
