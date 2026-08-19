const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {assertElectronSucceeded,spawnElectronVerificationSync}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');
if(!process.env.FIRESTORE_EMULATOR_HOST)test('actual admin Chromium starts takeout preparation through the Firestore emulator atomically',{skip:true},()=>{});else test('actual admin Chromium starts takeout preparation through the Firestore emulator atomically',{timeout:120000},t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'admin-takeout-emulator-')),report=path.join(temp,'report.json');t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-admin-takeout-preparation-emulator.js'],{cwd:root,encoding:'utf8',env:{...process.env,ADMIN_TAKEOUT_EMULATOR_REPORT:report,ELECTRON_VERIFICATION_USER_DATA:path.join(temp,'profile'),ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:110000,maxBuffer:10*1024*1024});assertElectronSucceeded(assert,run,report);
 const result=JSON.parse(fs.readFileSync(report,'utf8'));
 assert.deepEqual(result.cancel,{hidden:true,focus:'select-preparation-time',attempts:0});assert.deepEqual(result.escape,{hidden:true,focus:'select-preparation-time',attempts:0});
 assert.equal(result.success.attempts,1);assert.equal(result.success.modalHidden,true);assert.match(result.success.toast,/조리를 시작/);
 assert.equal(result.order.status,'cooking');assert.equal(result.display.status,'cooking');assert.equal(result.order.minutes,15);assert.equal(result.display.minutes,15);assert.equal(result.order.auto,true);assert.equal(result.display.auto,true);assert.equal(result.order.due-result.order.started,15*60000);assert.equal(result.display.due-result.display.started,15*60000);assert.deepEqual(result.writes,{orders:1,displays:1,seats:0,payments:0});assert.deepEqual(result.bridge,{attempts:1,commits:1});
});
