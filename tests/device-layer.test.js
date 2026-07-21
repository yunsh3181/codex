const test=require('node:test');
const assert=require('node:assert/strict');
const {
 DeviceToken,ViewportToken,OrientationToken,LayoutToken,
 DeviceManager,createDeviceContext,classifyViewport
}=require('../device-manager.js');

test('device tokens remain stable',()=>{
 assert.deepEqual(Object.values(DeviceToken),['phone','tablet','kiosk21','default']);
 assert.deepEqual(Object.values(ViewportToken),['phone','tabletPortrait','kioskPortrait','default']);
});

test('viewport classification is independent from the current layout',()=>{
 assert.equal(classifyViewport(390,844),ViewportToken.PHONE);
 assert.equal(classifyViewport(820,1180),ViewportToken.TABLET_PORTRAIT);
 assert.equal(classifyViewport(1080,1920),ViewportToken.KIOSK_PORTRAIT);
 assert.equal(classifyViewport(1280,720),ViewportToken.DEFAULT);
});

test('device context keeps the current UI on the default layout',()=>{
 const context=createDeviceContext({deviceType:DeviceToken.TABLET,viewportSource:{innerWidth:820,innerHeight:1180}});
 assert.equal(context.deviceType,DeviceToken.TABLET);
 assert.equal(context.viewport,ViewportToken.TABLET_PORTRAIT);
 assert.equal(context.orientation,OrientationToken.PORTRAIT);
 assert.equal(context.layout,LayoutToken.DEFAULT);
});

test('device manager falls back to the default device token',()=>{
 const current=new DeviceManager({deviceType:'unknown',viewportSource:{innerWidth:1280,innerHeight:720}}).current();
 assert.equal(current.deviceType,DeviceToken.DEFAULT);
 assert.equal(current.layout,LayoutToken.DEFAULT);
});
