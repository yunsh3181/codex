const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');
test('iPad Air 3 and Windows Chromium use the six-language on-screen identity keyboard',{timeout:120000},t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'foreign-customer-name-')),report=path.join(temp,'report.json'),profile=path.join(temp,'profile');t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-foreign-customer-name-ui.js'],{cwd:root,encoding:'utf8',env:{...process.env,FOREIGN_NAME_REPORT:report,ELECTRON_VERIFICATION_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:110000,maxBuffer:10*1024*1024});assertElectronSucceeded(assert,run,report);
 const result=JSON.parse(fs.readFileSync(report,'utf8'));
 for(const viewport of ['ipad-air3','windows'])for(const language of ['ko','en','ja','zh','vi','es']){const value=result[viewport][language];assert.equal(value.step,'phone');assert.ok(value.overflowX<=1,`${viewport} ${language}`);if(language==='ko'){assert.equal(value.foreign,false);assert.equal(value.input,null);assert.equal(value.keyCount,0)}else{assert.equal(value.foreign,true);assert.equal(value.input.readOnly,true);assert.equal(value.input.inputMode,'none');assert.ok(value.input.value.length>0);assert.ok(value.keyCount>20)}}
});
