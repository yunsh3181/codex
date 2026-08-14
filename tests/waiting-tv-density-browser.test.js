const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {assertElectronSucceeded,spawnElectronVerificationSync}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');
const expectedDensity=count=>count<=1?'single':count===2?'double':count===3?'triple':count===4?'compact':'dense';

test('actual waiting-TV Chromium applies independent adaptive density without clipping or document overflow',{timeout:180000},t=>{
 const tempRoot=fs.mkdtempSync(path.join(os.tmpdir(),'waiting-tv-density-test-')),report=path.join(tempRoot,'report.json'),screens=path.join(tempRoot,'screens'),profile=path.join(tempRoot,'profile');
 t.after(()=>fs.rmSync(tempRoot,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-waiting-tv-density.js'],{cwd:root,encoding:'utf8',env:{...process.env,WAITING_TV_DENSITY_REPORT:report,WAITING_TV_DENSITY_SCREENSHOTS:screens,WAITING_TV_DENSITY_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:170000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,report);const result=JSON.parse(fs.readFileSync(report,'utf8'));
 for(const [viewport,samples] of Object.entries(result.viewports))for(const [name,sample] of Object.entries(samples)){
  assert.equal(sample.cooking.density,expectedDensity(sample.cooking.count),`${viewport} ${name} cooking density`);assert.equal(sample.ready.density,expectedDensity(sample.ready.count),`${viewport} ${name} ready density`);
  assert.equal(sample.cooking.clipping,false,`${viewport} ${name} cooking clipping`);assert.equal(sample.ready.clipping,false,`${viewport} ${name} ready clipping`);assert.equal(sample.cooking.overlap,false);assert.equal(sample.ready.overlap,false);assert.equal(sample.cooking.verticalKorean,false);assert.equal(sample.ready.verticalKorean,false);
  assert.equal(sample.horizontalOverflow,0);assert.equal(sample.documentVerticalOverflow,0);assert.equal(sample.headerOverlap,false);assert.equal(sample.buttonOverlap,false);assert.equal(sample.logoOverlap,false);
  for(const list of [sample.cooking,sample.ready])if(list.card){assert.equal(list.card.scrollWidth,list.card.clientWidth);assert.equal(list.card.scrollHeight,list.card.clientHeight);assert.ok(parseFloat(list.numberFontSize)>=34);if(list.labelFontSize)assert.ok(parseFloat(list.labelFontSize)>=22);if(list.helperFontSize)assert.ok(parseFloat(list.helperFontSize)>=18)}
 }
 const portrait=result.viewports['1080x1920'];const readySteps=[1,2,3,4,5].map(count=>portrait[`ready-${count}`].ready);
 for(let index=1;index<readySteps.length;index++){assert.ok(parseFloat(readySteps[index].numberFontSize)<parseFloat(readySteps[index-1].numberFontSize));assert.ok(parseFloat(readySteps[index].labelFontSize)<parseFloat(readySteps[index-1].labelFontSize));assert.ok(parseFloat(readySteps[index].helperFontSize)<parseFloat(readySteps[index-1].helperFontSize));assert.ok(readySteps[index].card.clientHeight<readySteps[index-1].card.clientHeight)}
 assert.deepEqual([portrait['mixed-4-1'].cooking.density,portrait['mixed-4-1'].ready.density],['compact','single']);assert.deepEqual([portrait['mixed-1-4'].cooking.density,portrait['mixed-1-4'].ready.density],['single','compact']);
 assert.deepEqual([result.transitions.cookingToReady.cooking.count,result.transitions.cookingToReady.ready.count],[3,1]);assert.deepEqual([result.transitions.pickupDeleted.cooking.count,result.transitions.pickupDeleted.ready.count],[3,0]);assert.equal(result.transitions.pickupDeleted.cooking.density,'triple');assert.ok(parseFloat(result.transitions.cookingToReady.cooking.numberFontSize)>parseFloat(result.transitions.cooking5.cooking.numberFontSize),'density decrease immediately restores larger type');assert.equal(result.transitions.pickupDeleted.ready.card,null,'pickup completion removes the ready DOM card');assert.deepEqual(result.consoleProblems,[]);assert.equal(fs.readdirSync(screens).length,8);
});
