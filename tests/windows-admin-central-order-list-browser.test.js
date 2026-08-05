const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronSync,electronResultDetails}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');
test('actual admin DOM preserves click, double-click, keyboard, focus, pagination, listener, and deletion behavior',{timeout:120000},t=>{
 const report=path.join(os.tmpdir(),`admin-central-browser-${process.pid}.json`),screens=fs.mkdtempSync(path.join(os.tmpdir(),'admin-central-screens-'));
 t.after(()=>{fs.rmSync(report,{force:true});fs.rmSync(screens,{recursive:true,force:true})});
 const run=spawnElectronSync(require('electron'),['scripts/verify-admin-central-order-list.js'],{cwd:root,encoding:'utf8',env:{...process.env,ADMIN_CENTRAL_REPORT:report,ADMIN_CENTRAL_SCREENSHOT_DIR:screens,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:110000,maxBuffer:10*1024*1024});
 assert.equal(run.status,0,electronResultDetails(run));assert.equal(run.signal,null,electronResultDetails(run));assert.equal(run.error,undefined,electronResultDetails(run));
 const result=JSON.parse(fs.readFileSync(report,'utf8'));
 assert.deepEqual(result.singleClick,{id:'fixture-32',selected:true,aria:'true',modalHidden:true,sameNode:true,focused:true});
 assert.equal(result.doubleClick.opens,1);assert.equal(result.doubleClick.modalHidden,false);assert.match(result.doubleClick.title,/32번/);assert.match(result.doubleClick.reservation,/예약시간/);assert.match(result.doubleClick.split,/식권대장/);
 assert.deepEqual(result.closeX,{hidden:true,focusId:'fixture-32'});assert.deepEqual(result.enter,{opened:true,closed:true,focusId:'fixture-32'});assert.deepEqual(result.detailButton,{opened:true,closed:true});
 assert.equal(result.page2.label,'2 / 3');assert.equal(result.page2.selected,false);assert.equal(result.page2.detailDisabled,true);assert.match(result.page2.title,/다른 페이지/);
 assert.deepEqual(result.listener,{id:'fixture-32',selectedId:'fixture-32',connected:true});assert.deepEqual(result.deletion,{id:'fixture-32',selected:false,disabled:true});
 assert.deepEqual(result.consoleProblems,[]);
 assert.deepEqual(result.beforeProcessing.newBadge,'신규주문');assert.deepEqual(result.beforeProcessing.payment,'결제대기');assert.deepEqual(result.beforeProcessing.counts,['1','13','18']);
 assert.deepEqual(result.paymentProcessing,{newBadge:false,payment:'결제완료',seat:'사용중',counts:['0','14','18']});
 assert.deepEqual(result.seatProcessing,{seat:'완료',seatOverview:'빈자리',counts:['0','13','19']});
 assert.deepEqual(result.metrics.after1440.viewport,[1440,900]);assert.deepEqual(result.metrics.operating.viewport,[1920,1080]);assert.deepEqual(result.metrics.narrow.viewport,[1100,800]);
 for(const metric of Object.values(result.metrics)){
  assert.equal(metric.horizontalOverflow,0);assert.deepEqual(metric.clipped,[]);assert.equal(metric.headerFont,11);assert.equal(metric.bodyFont,12);assert.equal(metric.rows,15);
  assert.ok(metric.requiredMeasurements.length>0);assert.ok(metric.requiredMeasurements.every(entry=>entry.fits&&entry.scrollWidth<=entry.clientWidth));
  for(const value of ['010-8888-1032','1032','파파존 4인 바테이블','97,100원','카드','현금','제로페이','식권대장','식권대장/2인','식권대장/4인'])assert.ok(metric.requiredMeasurements.some(entry=>entry.text===value),`${value} is measured without clipping at ${metric.viewport.join('x')}`);
  assert.match(metric.fontFamily,/Arial/);assert.match(metric.numericFontFamily,/Arial/);assert.match(metric.numericVariant,/tabular-nums/);
 }
 if(process.platform==='win32')console.log('WINDOWS_ADMIN_CENTRAL_MEASUREMENTS='+JSON.stringify(Object.fromEntries(Object.entries(result.metrics).map(([name,metric])=>[name,{viewport:metric.viewport,overflow:metric.horizontalOverflow,clipped:metric.clipped,values:Object.fromEntries(['010-8888-1032','1032','파파존 4인 바테이블','97,100원','카드','현금','제로페이','식권대장','식권대장/2인','식권대장/4인'].map(value=>{const entry=metric.requiredMeasurements.find(item=>item.text===value);return [value,{clientWidth:entry.clientWidth,scrollWidth:entry.scrollWidth}]}))}]))));
});
