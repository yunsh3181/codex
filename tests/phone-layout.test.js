const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {DeviceManager,LayoutToken}=require('../device-manager.js');
const {DeviceRuntime}=require('../device-runtime.js');

const layoutAt=(width,height)=>new DeviceManager({
 viewportSource:{innerWidth:width,innerHeight:height}
}).current().layout;

test('phone layout is limited to portrait phone viewports',()=>{
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
 cases.forEach(([width,height,expected])=>assert.equal(layoutAt(width,height),expected,`${width}x${height}`));
});

test('runtime keeps data-layout and its CSS custom property in sync',()=>{
 const attributes=new Map(),properties=new Map();
 const view={innerWidth:430,innerHeight:932};
 const target={
  setAttribute(name,value){attributes.set(name,value)},
  style:{setProperty(name,value){properties.set(name,value)}}
 };
 new DeviceRuntime({view,target}).apply();
 assert.equal(attributes.get('data-layout'),LayoutToken.PHONE);
 assert.equal(properties.get('--device-layout'),attributes.get('data-layout'));
});

test('phone stylesheet is loaded after legacy inline styles and scopes the four foundations',()=>{
 const root=path.join(__dirname,'..');
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const css=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');
 const link='<link rel="stylesheet" href="styles/device-phone.css">';
 assert.ok(html.includes(link));
 assert.ok(html.lastIndexOf(link)>html.lastIndexOf('</style>'));
 ['.head','.progress','.stage','.grid.two','.grid.four','.halfPreview','.grid.adaptiveCards'].forEach(selector=>{
  assert.ok(css.includes(selector),`${selector} is connected to the phone device layer`);
 });
 assert.match(css,/html\[data-layout="phone"\]/);
});
