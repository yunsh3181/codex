'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {electronResultDetails,spawnElectronSync}=require('./helpers/electron-verification-process');

const root=path.resolve(__dirname,'..');
test('actual Chromium preserves existing order modals beneath the inactivity warning',{timeout:120000},t=>{
 const electron=require('electron');let command=electron,args=['scripts/verify-kiosk-inactivity-warning-modal.js'];
 if(process.platform==='darwin'){
  const binary=spawnSync('file',[electron],{encoding:'utf8'}).stdout;
  const architecture=binary.includes('arm64')?'-arm64':binary.includes('x86_64')?'-x86_64':null;
  if(architecture){const supported=spawnSync('/usr/bin/arch',[architecture,'/usr/bin/true']);if(supported.status!==0){t.skip(`Electron ${architecture.slice(1)} is not supported by this host`);return}command='/usr/bin/arch';args=[architecture,electron,...args]}
 }
 const reportPath=path.join(os.tmpdir(),`inactivity-modal-${process.pid}.json`),profile=fs.mkdtempSync(path.join(os.tmpdir(),'inactivity-modal-profile-'));
 t.after(()=>fs.rmSync(reportPath,{force:true}));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const run=spawnElectronSync(command,args,{cwd:root,encoding:'utf8',env:{...process.env,ELECTRON_DISABLE_SECURITY_WARNINGS:'true',KIOSK_INACTIVITY_MODAL_REPORT:reportPath,ELECTRON_VERIFICATION_USER_DATA:profile},timeout:110000,maxBuffer:10*1024*1024});
 assert.equal(run.status,0,electronResultDetails(run));assert.equal(run.signal,null,electronResultDetails(run));
 const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
 assert.equal(report.overPizzaOptions.warningHosts,1);assert.equal(report.overPizzaOptions.warningVisible,true);assert.equal(report.overPizzaOptions.modalVisible,true);assert.equal(report.overPizzaOptions.modalMarker,'preserved');assert.equal(report.overPizzaOptions.sameModal,true);assert.equal(report.overPizzaOptions.stateModal,'halfGuide');assert.equal(report.overPizzaOptions.step,'pizzaOptions');assert.equal(report.overPizzaOptions.size,'L');assert.equal(report.overPizzaOptions.topping,1);assert.ok(report.overPizzaOptions.deadline>0);
 for(const result of [report.continuedPizzaOptions,report.escapedModal,...report.otherModals]){assert.equal(result.warningVisible,false);assert.equal(result.modalVisible,true);assert.equal(result.modalMarker,'preserved');assert.equal(result.sameModal,true);assert.equal(result.focusRestored,true);assert.equal(result.size,'L');assert.equal(result.topping,1)}
 assert.deepEqual(report.backdropIsolation,{backgroundClicks:0,modalClicks:0,generationUnchanged:true,deadlineUnchanged:true,warningVisible:true});
 assert.deepEqual(report.homeReset,{releases:1,step:'idle',stateModal:null,warningVisible:false});
 assert.deepEqual(report.automaticAndStale,{releases:1,resets:1,step:'idle',warningVisible:false});
});
