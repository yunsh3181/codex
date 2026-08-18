const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');

test('iPad DOM fork choice survives review back submit reload and admin detail',{timeout:180000},t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'disposables-production-path-')),report=path.join(temp,'report.json'),profile=path.join(temp,'profile');
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-disposables-production-path.js'],{cwd:root,encoding:'utf8',env:{...process.env,DISPOSABLES_REPORT:report,ELECTRON_VERIFICATION_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:170000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,report);
 const value=JSON.parse(fs.readFileSync(report,'utf8'));
 for(const [name,flow,expected,label] of [['needed',value.needed,true,'필요'],['notNeeded',value.notNeeded,false,'필요 없음']]){
  assert.deepEqual(flow.start.viewport,[834,1112],name);assert.deepEqual(flow.start.visualViewport,[834,1112],name);
  assert.equal(flow.afterChoice.value,expected,name);assert.equal(flow.review.value,expected,name);assert.match(flow.review.text,new RegExp(label),name);
  assert.equal(flow.previous,'accompaniment',name);assert.equal(flow.returned.step,'review',name);assert.equal(flow.returned.value,expected,name);
  assert.equal(flow.returned.cart,flow.review.cart,name);assert.equal(flow.returned.total,flow.review.total,name);
  assert.equal(flow.saved.calls,1,name);assert.equal(flow.saved.orders.length,1,name);assert.equal(flow.saved.orders[0].disposables,expected,name);assert.equal(typeof flow.saved.orders[0].disposables,'boolean',name);
 }
 assert.match(value.admin.needed,/<strong>O<\/strong>/);assert.match(value.admin.notNeeded,/<strong>X<\/strong>/);
 for(const key of ['missing','nullValue','stringTrue','stringFalse'])assert.match(value.admin[key],/<strong>확인 필요<\/strong>/,key);
});
