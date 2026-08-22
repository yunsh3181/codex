const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');

test('promo hierarchy and takeout-only badge pass the complete Chromium viewport and locale matrix',{timeout:180000},t=>{
 const reportPath=path.join(os.tmpdir(),`home-promo-${process.pid}.json`),profile=fs.mkdtempSync(path.join(os.tmpdir(),'home-promo-profile-'));
 t.after(()=>fs.rmSync(reportPath,{force:true}));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-home-promo-visibility.js'],{cwd:root,encoding:'utf8',env:{...process.env,HOME_PROMO_REPORT:reportPath,ELECTRON_VERIFICATION_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:170000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,reportPath);const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 assert.equal(report.results.length,8*6);assert.deepEqual(report.consoleMessages,[]);
 for(const row of report.results){const m=row.metrics,ctx=`${row.viewport}/${row.locale}`;assert.equal(m.count,2,ctx);assert.equal(m.heineken,false,ctx);assert.equal(m.horizontalOverflow,0,ctx);assert.deepEqual(m.verticalText,[],ctx);assert.deepEqual(m.orphanLines,[],`${ctx}/single-character line`);assert.equal(m.cards.length,2,ctx);for(const card of m.cards){assert.deepEqual(card.clipped,[],`${ctx}/${card.className} clipping`);assert.deepEqual(card.overlaps,[],`${ctx}/${card.className} overlap`);assert.equal(card.backgroundImage,'none',`${ctx}/${card.className} image-free`);assert.ok(card.usedAreaRatio>.18&&card.usedAreaRatio<1,`${ctx}/${card.className} used area ${card.usedAreaRatio}`)}assert.ok(m.badge,`${ctx}/badge`);assert.equal(m.badgeStyle.backgroundColor,'rgb(200, 16, 46)',ctx);assert.equal(m.badgeStyle.color,'rgb(255, 255, 255)',ctx);assert.equal(m.badgeStyle.borderWidth,'2px',ctx);assert.ok(m.badge.fontSize>=18,`${ctx}/badge font`);assert.ok(m.badge.rect.height>=44,`${ctx}/badge height`);assert.ok(m.title.fontSize>=22,`${ctx}/title`);assert.ok(m.benefit.fontSize>=28,`${ctx}/benefit`);assert.ok(m.hours.fontSize>=15,`${ctx}/hours`);assert.ok(m.condition.fontSize>=15,`${ctx}/condition`)}
 assert.deepEqual(report.clickResults[0],{card:'happy',step:report.clickResults[0].step,orderType:'takeout',promo:'happy'});assert.ok(['pizza','reserve'].includes(report.clickResults[0].step));
 assert.deepEqual(report.clickResults[1],{card:'takeout',step:'pizzaOptions',orderType:'takeout',promo:'takeout'});
});
