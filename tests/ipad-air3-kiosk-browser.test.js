const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');

test('production kiosk passes iPad Air 3 portrait integration and landscape regression', {timeout:180000}, t=>{
 const reportPath=path.join(os.tmpdir(),`ipad-air3-${process.pid}.json`),profile=fs.mkdtempSync(path.join(os.tmpdir(),'ipad-air3-profile-'));
 t.after(()=>fs.rmSync(reportPath,{force:true}));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-ipad-air3-kiosk.js'],{cwd:root,encoding:'utf8',env:{...process.env,IPAD_AIR3_REPORT:reportPath,ELECTRON_VERIFICATION_USER_DATA:profile},timeout:170000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,reportPath);const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 assert.equal(report.results.filter(x=>x.viewport==='834x1112').length,6*20);
 const ratio=report.partyBaseline.after.button.height/report.partyBaseline.before.button.height;assert.ok(ratio>=.80&&ratio<=.90,`party reduction ${ratio}`);
 for(const row of report.results){const m=row.metrics,ctx=`${row.viewport}/${row.locale}/${row.scenario}`;assert.equal(m.document.scrollWidth,m.document.clientWidth,`${ctx} horizontal overflow`);assert.deepEqual(m.clipped,[],`${ctx} clipping`);assert.deepEqual(m.overlaps,[],`${ctx} overlap`);assert.deepEqual(m.verticalText,[],`${ctx} vertical text`);assert.equal(m.scaleApplied,false,`${ctx} whole-page scale`);if(row.viewport==='834x1112'){const viewportViolations=row.scenario.startsWith('review-')?m.viewportViolations.filter(x=>!String(x.className).includes('reviewOrderCard')):m.viewportViolations;assert.deepEqual(viewportViolations,[],`${ctx} viewport visibility`);assert.deepEqual(m.touchFailures,[],`${ctx} touch targets`);assert.equal(m.document.scrollHeight,m.document.clientHeight,`${ctx} document overflow`);assert.ok(m.stage.scrollHeight>=m.stage.clientHeight,`${ctx} stage geometry`);if(['topping-add','topping-selected','side-included','side-extra','drink-included','drink-extra','accompaniment'].includes(row.scenario)){assert.ok(m.action,`${ctx} action`);assert.ok(m.centerError<=1,`${ctx} centered ${m.centerError}`);assert.ok(m.action.bottom<=1112,`${ctx} action visible`)}}else{assert.equal(m.portraitMediaMatch,false,ctx);assert.equal(m.portraitRuleActive,false,ctx);assert.ok(m.touch.every(x=>x.left>=0&&x.right<=1112&&x.top>=0),`${ctx} button access`)}}
 const setRows=report.results.filter(x=>x.viewport==='834x1112'&&x.scenario==='set-choice');for(const row of setRows){const cards=row.metrics.touch.filter(x=>/2|3|4/.test(x.text)&&x.height>100);assert.ok(cards.length>=3,`${row.locale} set rows`)}
 assert.equal(report.safariResults.length,4*7);
 for(const row of report.safariResults){const m=row.metrics,ctx=`Safari/${row.viewport}/${row.scenario}`;assert.equal(m.portraitMediaMatch,true,`${ctx} portrait query`);assert.equal(m.portraitRuleActive,true,`${ctx} portrait rule`);assert.equal(m.document.scrollWidth,m.document.clientWidth,`${ctx} horizontal overflow`);assert.deepEqual(m.clipped,[],`${ctx} clipping`);assert.deepEqual(m.overlaps,[],`${ctx} overlap`);assert.deepEqual(m.viewportViolations,[],`${ctx} viewport visibility`);assert.ok(m.action,`${ctx} action`);assert.ok(m.action.left>=0&&m.action.right<=834&&m.action.top>=0&&m.action.bottom<=m.visualViewport.height,`${ctx} action visible`);assert.ok(m.centerError<=1,`${ctx} viewport center ${m.centerError}`);assert.ok(m.actionAreaCenterError<=1,`${ctx} action area center ${m.actionAreaCenterError}`);assert.equal(m.stackOverlap,0,`${ctx} cart overlap`);assert.equal(m.actionProgressOverlap,0,`${ctx} progress overlap`)}
 assert.equal(report.scrollResults.length,4*8);
 for(const row of report.scrollResults){const s=row.scroll,m=row.metrics,ctx=`Scroll/${row.viewport}/${row.scenario}`;assert.equal(s.styles.overflowX,'hidden',`${ctx} overflow-x`);assert.equal(s.styles.overflowY,'auto',`${ctx} overflow-y`);assert.equal(s.styles.touchAction,'pan-y',`${ctx} touch action`);assert.equal(m.document.scrollWidth,m.document.clientWidth,`${ctx} horizontal overflow`);if(s.maxScrollTop>1){assert.ok(s.wheelTop>0,`${ctx} wheel moved`);assert.ok(s.touchTop>0,`${ctx} touch moved`);assert.ok(Math.abs(s.scrollTop-s.maxScrollTop)<=1,`${ctx} reached end`);if(s.lastBottom!==null)assert.ok(s.lastBottom<=s.visibleBottom+1,`${ctx} last content reachable`)}else{assert.equal(s.wheelTop,0,`${ctx} short wheel stable`);assert.equal(s.touchTop,0,`${ctx} short touch stable`)}}
 assert.deepEqual(report.dynamicResults.map(x=>x.metrics.visualViewport.height),[1112,980,940,1000]);
 for(const row of report.dynamicResults){assert.equal(row.metrics.portraitRuleActive,true,`${row.viewport} dynamic portrait rule`);assert.ok(row.scrollTop>0,`${row.viewport} scroll position preserved`);assert.ok(row.metrics.centerError<=1,`${row.viewport} dynamic center`);assert.equal(row.metrics.stackOverlap,0,`${row.viewport} dynamic cart overlap`)}
 for(const row of report.clickCases){assert.equal(row.actual.clicks,1,`${row.scenario} click count`);assert.equal(row.actual.step,row.expected.step,`${row.scenario} next step`);assert.equal(row.actual.modal,row.expected.modal,`${row.scenario} next modal`)}
 assert.deepEqual(report.resetBehavior.cancel,{releaseCount:0,resetCount:0,preserved:true});
 assert.deepEqual(report.resetBehavior.escape,{releaseCount:0,resetCount:0,preserved:true});
 assert.deepEqual(report.resetBehavior.success,{releaseCount:1,resetCount:1,step:'idle'});
 assert.deepEqual(report.resetBehavior.doubleClick,{releaseCount:1,resetCount:1,step:'idle'});
 assert.deepEqual(report.resetBehavior.failure,{releaseCount:1,resetCount:0,preserved:true,modal:'reviewResetConfirm'});
 assert.deepEqual(report.resetBehavior.retry,{releaseCount:1,resetCount:1,step:'idle'});
 assert.deepEqual(report.resetBehavior.takeout,{releaseCount:0,resetCount:1,seatWriteCount:0,step:'idle'});
 assert.equal(report.reviewNavigation.preserved,true);assert.equal(report.reviewNavigation.returned,true);assert.match(report.reviewNavigation.confirmTarget,/confirmReviewOrder/);
});
