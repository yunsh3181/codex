const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronSync,electronResultDetails}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');
test('actual Chromium unlocks and reuses one completion AudioContext without duplicate alerts',{timeout:120000},t=>{
 const report=path.join(os.tmpdir(),`waiting-tv-completion-${process.pid}.json`),screenshot=path.join(os.tmpdir(),`waiting-tv-completion-${process.pid}.png`);t.after(()=>{fs.rmSync(report,{force:true});fs.rmSync(screenshot,{force:true})});
 const run=spawnElectronSync(require('electron'),['scripts/verify-waiting-tv-completion.js'],{cwd:root,encoding:'utf8',env:{...process.env,WAITING_TV_REPORT:report,WAITING_TV_SCREENSHOT:screenshot,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:110000,maxBuffer:10*1024*1024});assert.equal(run.status,0,electronResultDetails(run));assert.equal(run.signal,null,electronResultDetails(run));
 const result=JSON.parse(fs.readFileSync(report,'utf8'));
 assert.deepEqual(result.initial,{starts:0,contexts:0,ready:0,button:'알림음·음성 안내 시작'});assert.equal(result.unlock.contexts,1);assert.equal(result.unlock.resumeCalls,1);assert.equal(result.unlock.state,'running');assert.equal(result.unlock.button,'알림음·음성 안내 켜짐');
 assert.equal(result.transition.starts,2);assert.match(result.transition.ready,/1111번.*포장 주문이 완료되었습니다.*카운터에서 주문을 받아주세요/s);assert.equal(result.duplicate,2);
 assert.deepEqual(result.reload,{starts:0,ready:1});assert.equal(result.newReady,2);assert.equal(result.twoOrders,6);
 assert.equal(result.resumeFailure.starts,result.resumeFailure.before);assert.equal(result.resumeFailure.resumeCalls,2);assert.match(result.resumeFailure.ready,/5555번/);assert.match(result.resumeFailure.button,/알림음 차단됨/);
 assert.equal(result.hidden,result.resumeFailure.starts);assert.equal(result.reappeared,result.resumeFailure.starts);
 assert.deepEqual(result.layout,{viewport:[1080,1920],horizontalOverflow:0,verticalOverflow:0,clipped:0,overlap:false});assert.deepEqual(result.consoleProblems,[]);assert.ok(fs.statSync(screenshot).size>10000);
});
