const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {assertElectronSucceeded,spawnElectronVerificationSync}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');
test('actual admin DOM preserves click, double-click, keyboard, focus, pagination, listener, and deletion behavior',{timeout:120000},t=>{
 const report=path.join(os.tmpdir(),`admin-central-browser-${process.pid}.json`),screens=fs.mkdtempSync(path.join(os.tmpdir(),'admin-central-screens-'));
 t.after(()=>{fs.rmSync(report,{force:true});fs.rmSync(screens,{recursive:true,force:true})});
 const run=spawnElectronVerificationSync(['scripts/verify-admin-central-order-list.js'],{cwd:root,encoding:'utf8',env:{...process.env,ADMIN_CENTRAL_REPORT:report,ADMIN_CENTRAL_SCREENSHOT_DIR:screens,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:110000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,report);
 const result=JSON.parse(fs.readFileSync(report,'utf8'));
 assert.equal(result.seatReservationSync.initial.status,'예약');assert.match(result.seatReservationSync.initial.className,/\breserved\b/);assert.equal(result.seatReservationSync.initial.disabled,undefined);
 assert.equal(result.seatReservationSync.cancelled.status,'빈자리');assert.match(result.seatReservationSync.cancelled.className,/\bempty\b/);assert.equal(result.seatReservationSync.cancelled.disabled,undefined);
 assert.deepEqual(result.seatReservationSync.reserved,result.seatReservationSync.initial);
 assert.equal(result.seatReservationSync.initial.cards,13);assert.equal(new Set(result.seatReservationSync.initial.order).size,13);assert.equal(result.seatReservationSync.initial.transactions,0);assert.equal(result.seatReservationSync.initial.writes,0);
 assert.deepEqual(result.singleClick,{id:'fixture-32',selected:true,aria:'true',modalHidden:true,sameNode:true,focused:true});
 assert.equal(result.doubleClick.opens,1);assert.equal(result.doubleClick.modalHidden,false);assert.match(result.doubleClick.title,/32번/);assert.match(result.doubleClick.reservation,/예약시간/);assert.match(result.doubleClick.split,/식권대장/);
 assert.deepEqual(result.closeX,{hidden:true,focusId:'fixture-32'});assert.deepEqual(result.enter,{opened:true,closed:true,focusId:'fixture-32'});assert.deepEqual(result.detailButton,{opened:true,closed:true});
 assert.equal(result.page2.label,'2 / 3');assert.equal(result.page2.selected,false);assert.equal(result.page2.detailDisabled,true);assert.match(result.page2.title,/다른 페이지/);
 assert.deepEqual(result.listener,{id:'fixture-32',selectedId:'fixture-32',connected:true});assert.deepEqual(result.deletion,{id:'fixture-32',selected:false,disabled:true});
 assert.deepEqual(result.consoleProblems,[]);
 assert.equal(result.preparationModal.value,'15분');assert.equal(result.preparationModal.decreaseEnabled,true);assert.equal(result.preparationModal.increaseEnabled,true);assert.equal(result.preparationModal.clipped,false);assert.equal(result.preparationModal.overflowX,0);assert.equal(result.preparationModal.detailStayedClosed,true);assert.equal(result.preparationModal.transactions,0);
 assert.deepEqual(result.preparationModal.minimum,{value:'5분',disabled:true});assert.deepEqual(result.preparationModal.maximum,{value:'60분',disabled:true});assert.match(result.preparationModal.cancel.focusAction,/select-preparation-time/);assert.equal(result.preparationModal.escape.hidden,true);assert.match(result.preparationModal.escape.focusAction,/select-preparation-time/);assert.equal(result.preparationModal.success.status,'cooking');assert.equal(result.preparationModal.success.minutes,15);assert.equal(result.preparationModal.success.autoReadyEnabled,true);assert.match(result.preparationModal.success.countdown,/조리중/);assert.equal(result.preparationModal.success.modalHidden,true);assert.equal(result.preparationModal.success.transactions,1);
 assert.equal(result.takeoutModal.button,'주문 완료');assert.equal(result.takeoutModal.title,'포장 주문을 완료할까요?');assert.match(result.takeoutModal.description,/4242번.*대면 포장/);assert.equal(result.takeoutModal.clipped,false);assert.equal(result.takeoutModal.overflowX,0);assert.equal(result.takeoutModal.overflowY,0);assert.equal(result.takeoutModal.backgroundBlocked,true);assert.equal(result.takeoutModal.detailStayedClosed,true);assert.equal(result.takeoutModal.transactions,0);
 assert.deepEqual(result.takeoutModal.cancel.hidden,true);assert.equal(result.takeoutModal.cancel.focusAction,'confirm-takeout-complete');assert.deepEqual(result.takeoutModal.escape,{hidden:true,focusAction:'confirm-takeout-complete',detailHidden:true});assert.deepEqual(result.takeoutModal.success,{status:'ready',modalHidden:true,transactions:1,detailHidden:true});
 assert.equal(result.pickupModal.button,'픽업 완료');assert.equal(result.pickupModal.title,'픽업 완료 처리할까요?');assert.match(result.pickupModal.description,/4242번.*대면 포장.*고객 대기화면에서 제거/);assert.equal(result.pickupModal.clipped,false);assert.equal(result.pickupModal.overflowX,0);assert.equal(result.pickupModal.overflowY,0);assert.equal(result.pickupModal.backgroundBlocked,true);assert.equal(result.pickupModal.detailStayedClosed,true);assert.equal(result.pickupModal.transactions,0);
 assert.deepEqual(result.pickupModal.cancel,{hidden:true,focusAction:'confirm-takeout-pickup'});assert.deepEqual(result.pickupModal.escape,{hidden:true,focusAction:'confirm-takeout-pickup',detailHidden:true});assert.deepEqual(result.pickupModal.success,{status:'completed',modalHidden:true,transactions:1,detailHidden:true});
 assert.deepEqual(result.expiryTriggers,{released:[1,0,0,0],transactions:1,status:'occupied',clockResult:0,clockTransactions:0});
 assert.equal(result.forceModal.button,'강제완료');assert.equal(result.forceModal.modalCount,1);assert.equal(result.forceModal.title,'주문 강제완료');assert.equal(result.forceModal.clipped,false);assert.equal(result.forceModal.overflowX,0);assert.equal(result.forceModal.overflowY,0);assert.equal(result.forceModal.confirmDisabled,true);assert.equal(result.forceModal.backgroundBlocked,true);assert.equal(result.forceModal.detailStayedClosed,true);assert.match(result.forceModal.detail,/papa-2.*orderId 없음/);
 assert.deepEqual(result.forceModal.invalid,{disabled:true,transactions:0,error:''});assert.deepEqual(result.forceModal.valid,{disabled:false,transactions:0});assert.deepEqual(result.forceModal.escape,{hidden:true,focusAction:'force-complete'});assert.deepEqual(result.forceModal.narrow,{clipped:false,overflowX:0,overflowY:0,disabled:true});assert.deepEqual(result.forceModal.cancel,{hidden:true,focusAction:'force-complete'});assert.deepEqual(result.forceModal.success,{status:'completed',modalHidden:true,transactions:1,payment:'결제완료',forceButton:false});
 assert.deepEqual(result.safePaymentStates,{
  'fixture-31':{label:'취소',action:false,seatAction:false,overlap:0},
  'fixture-30':{label:'확인 필요',action:false,seatAction:false,overlap:0},
  'fixture-29':{label:'확인 필요',action:false,seatAction:false,overlap:0}
 });
 assert.deepEqual(result.beforeProcessing.newBadge,'신규주문');assert.deepEqual(result.beforeProcessing.payment,'결제대기');assert.deepEqual(result.beforeProcessing.counts,['1','11','17']);
 assert.deepEqual(result.paymentProcessing,{newBadge:false,payment:'결제완료',seat:'사용중',counts:['0','12','17']});
 assert.deepEqual(result.seatProcessing,{seat:'완료',seatOverview:'빈자리',counts:['0','11','18']});
 assert.deepEqual(result.metrics.after1440.viewport,[1440,900]);assert.deepEqual(result.metrics.operating.viewport,[1920,1080]);assert.deepEqual(result.metrics.narrow.viewport,[1100,800]);
 for(const [name,metric] of Object.entries(result.metrics)){
  const expected=name==='operating'?{header:14,body:15,sequence:21,row:56,action:44,font:13}:name==='after1440'?{header:13,body:14,sequence:20,row:52,action:42,font:12}:{header:11,body:12,sequence:17,row:45,action:40,font:11};
  assert.equal(metric.horizontalOverflow,0);assert.deepEqual(metric.clipped,[]);assert.equal(metric.headerFont,expected.header);assert.equal(metric.bodyFont,expected.body);assert.equal(metric.sequenceFont,expected.sequence);assert.equal(metric.rowHeight,expected.row);assert.equal(metric.actionHeight,expected.action);assert.equal(metric.actionFont,expected.font);assert.equal(metric.rows,15);
  assert.deepEqual(metric.columnRatios,[6.5,6,5,11.5,5,7.5,9.5,12.5,4.5,21.5,10.5]);assert.ok(metric.criticalMeasurements.every(entry=>entry.fits&&entry.scrollWidth<=entry.clientWidth));
  assert.ok(metric.criticalMeasurements.find(entry=>entry.label==='순번 + 신규주문').safetyPx>=4);
  assert.ok(metric.requiredMeasurements.length>0);assert.ok(metric.requiredMeasurements.every(entry=>entry.fits&&entry.scrollWidth<=entry.clientWidth));
  for(const value of ['010-8888-1032','1032','O','X','확인 필요','97,100원'])assert.ok(metric.requiredMeasurements.some(entry=>entry.text===value),`${value} is measured without clipping at ${metric.viewport.join('x')}`);
  assert.match(metric.fontFamily,/Arial/);assert.match(metric.numericFontFamily,/Arial/);assert.match(metric.numericVariant,/tabular-nums/);
 }
 if(process.platform==='win32')console.log('WINDOWS_ADMIN_CENTRAL_MEASUREMENTS='+JSON.stringify(Object.fromEntries(Object.entries(result.metrics).map(([name,metric])=>[name,{viewport:metric.viewport,columnRatios:metric.columnRatios,widths:metric.widths,overflow:metric.horizontalOverflow,clipped:metric.clipped,criticalMeasurements:metric.criticalMeasurements,values:Object.fromEntries(['010-8888-1032','1032','파파존 4인 바테이블','97,100원','카드','현금','제로페이','식권대장','식권대장/2인','식권대장/4인'].map(value=>{const entry=metric.requiredMeasurements.find(item=>item.text===value);return [value,{clientWidth:entry.clientWidth,scrollWidth:entry.scrollWidth}]}))}]))));
});
