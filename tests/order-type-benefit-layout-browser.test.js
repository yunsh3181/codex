const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');

const root=path.resolve(__dirname,'..');
test('order type and maximum benefit layouts remain safe across customer viewports',{timeout:180000},t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'order-type-benefit-')),report=path.join(temp,'report.json'),captures=path.join(temp,'captures'),profile=path.join(temp,'profile');t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-order-type-benefit-layout.js'],{cwd:root,encoding:'utf8',env:{...process.env,ORDER_TYPE_BENEFIT_REPORT:report,ORDER_TYPE_BENEFIT_CAPTURE_DIR:captures,ELECTRON_VERIFICATION_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:170000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,report);const value=JSON.parse(fs.readFileSync(report,'utf8'));
 for(const row of value.rows){if(row.clipped.length&&row.diagnostics)console.error('PROMOTION_TITLE_GEOMETRY_DIAGNOSTICS',JSON.stringify(row.diagnostics,null,2))}
 for(const row of value.rows){assert.deepEqual(row.documentOverflow,[0,0],`${row.width}x${row.height}/${row.locale}/${row.step}`);assert.equal(row.clipped.length,0,`${row.width}x${row.height}/${row.locale}/${row.step}: ${JSON.stringify(row.clipped)}`);if(row.step==='home'){assert.equal(row.eyebrows,0);assert.equal(row.homeCards.length,2);assert.equal(row.homeTitles.length,2);assert.equal(row.homeDescriptions.length,2)}else{assert.equal(row.cards.length,5);assert.ok(row.cards.every(card=>card.width>=44&&card.height>=44));if(row.width===834&&[1112,1024].includes(row.height)){assert.equal(row.stage.maxScrollTop,0,`${row.height}/${row.locale}`);assert.ok(row.lastFooterGap>=12,`${row.height}/${row.locale}: ${row.lastFooterGap}`)}if(row.width===834&&row.height===940)assert.ok(row.stage.maxScrollTop>20,`${row.locale}: ${row.stage.maxScrollTop}`)}}
 assert.deepEqual(value.isolation,{externalRequests:[],reads:0,writes:0,authAttempts:0,paymentCalls:0,seatTransactions:0});
 for(const file of value.captures)assert.ok(fs.statSync(path.join(captures,file)).size>10000,file);
});
