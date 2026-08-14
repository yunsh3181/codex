const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');

test('iPad Air 3 portrait review uses one complete scrollable card column', {timeout:240000}, t=>{
 const reportPath=path.join(os.tmpdir(),`ipad-air3-review-${process.pid}.json`),profile=fs.mkdtempSync(path.join(os.tmpdir(),'ipad-air3-review-profile-'));
 t.after(()=>fs.rmSync(reportPath,{force:true}));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-ipad-air3-review-list.js'],{cwd:root,encoding:'utf8',env:{...process.env,IPAD_AIR3_REVIEW_REPORT:reportPath,ELECTRON_VERIFICATION_USER_DATA:profile},timeout:230000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,reportPath);const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 assert.equal(report.results.length,4*9);
 for(const row of report.results){const m=row.metrics,s=row.scroll,expected=report.scenarios.find(x=>x.name===row.scenario).count,ctx=`${row.viewport}/${row.scenario}`;
  assert.equal(m.document.scrollWidth,m.document.clientWidth,`${ctx} document horizontal overflow`);assert.equal(m.horizontalOverflow,0,`${ctx} horizontal overflow`);assert.deepEqual(m.clipped,[],`${ctx} clipping`);assert.deepEqual(m.verticalText,[],`${ctx} vertical text`);
  assert.equal(m.allCount,expected,`${ctx} DOM card count`);assert.equal(m.visibleCount,expected,`${ctx} visible card count`);assert.deepEqual(m.indexes,Array.from({length:expected},(_,index)=>index),`${ctx} missing or duplicate cards`);assert.equal(new Set(m.indexes).size,expected,`${ctx} duplicate indexes`);
  assert.equal(m.pagerHidden,true,`${ctx} pager hidden`);assert.equal(m.reviewDensity,'scroll',`${ctx} review density`);assert.equal(m.cardOverlap,false,`${ctx} card overlap`);assert.ok(m.stage.bottom<=m.dock.top+1,`${ctx} stage/dock separation`);assert.equal(m.dockActionOverlap,0,`${ctx} dock/action overlap`);assert.ok(m.confirmCenterError<=1,`${ctx} action center ${m.confirmCenterError}`);assert.ok(m.confirm.left>=0&&m.confirm.right<=834&&m.confirm.top>=0&&m.confirm.bottom<=m.viewport.height,`${ctx} confirm visible`);
  for(const card of m.cards){assert.ok(Math.abs(card.rect.width-m.list.width)<=1,`${ctx} full-width card ${card.index}`);assert.ok(card.rect.height>0,`${ctx} auto-height card ${card.index}`);assert.ok(card.financial.left>card.content.left,`${ctx} financial column ${card.index}`)}
  assert.equal(s.maxScrollTop,Math.max(0,s.scrollHeight-s.clientHeight),`${ctx} scroll range`);if(s.maxScrollTop>1){assert.ok(s.wheelTop>0,`${ctx} wheel moved`);assert.ok(s.touchTop>0,`${ctx} touch moved`);assert.ok(Math.abs(s.scrollTop-s.maxScrollTop)<=1,`${ctx} reached end`)}
  assert.ok(s.lastBottom<=s.visibleBottom+1,`${ctx} last card reachable above dock`)
 }
 assert.deepEqual(report.dynamic.map(x=>x.height),[1112,980,940,1000]);for(const row of report.dynamic){assert.ok(row.scrollTop>0,`${row.height} scroll retained`);assert.equal(row.metrics.visibleCount,10,`${row.height} all cards retained`);assert.ok(row.metrics.confirmCenterError<=1,`${row.height} action center`)}
 assert.deepEqual(report.confirmNavigation,{clicks:1,step:'phone'});
 assert.equal(report.d8222.totals.normal,84800);assert.equal(report.d8222.totals.discount,18300);assert.equal(report.d8222.totals.final,66500);assert.deepEqual(report.d8222.totals.discounts,{'3인 세트':7900,'UP & UP':10400});assert.equal(report.d8222.previous,'promo');assert.equal(report.d8222.restored,true);assert.equal(report.d8222.count,2);assert.equal(report.d8222.density,'scroll');assert.equal(report.d8222.setPayment,37000);assert.equal(report.d8222.paidCrustDelta,4000);assert.match(report.d8222.labels,/UP & UP/);assert.match(report.d8222.labels,/3인 세트/);
 assert.equal(report.mutation.qty,2);assert.equal(report.mutation.countAfterQty,3);assert.equal(report.mutation.countAfterDelete,2);assert.equal(report.mutation.stateCount,2);assert.deepEqual(report.mutation.indexes,[0,1]);assert.ok(report.mutation.afterQty>report.mutation.before);assert.ok(report.mutation.finalAfterDelete>0);
});
