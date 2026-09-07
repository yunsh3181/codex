const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');
const root=path.resolve(__dirname,'..');

test('drink volume, included sauce and independent quantities work in the real renderer',{timeout:120000},t=>{
 const report=path.join(os.tmpdir(),`drink-sauce-quantity-${process.pid}.json`),captures=fs.mkdtempSync(path.join(os.tmpdir(),'drink-sauce-captures-')),profile=fs.mkdtempSync(path.join(os.tmpdir(),'drink-sauce-profile-'));
 t.after(()=>fs.rmSync(report,{force:true}));t.after(()=>fs.rmSync(captures,{recursive:true,force:true}));t.after(()=>fs.rmSync(profile,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-drink-sauce-order-quantity.js'],{cwd:root,encoding:'utf8',env:{...process.env,DRINK_SAUCE_QUANTITY_REPORT:report,DRINK_SAUCE_QUANTITY_CAPTURE_DIR:captures,ELECTRON_VERIFICATION_USER_DATA:profile},timeout:110000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,report);const result=JSON.parse(fs.readFileSync(report,'utf8'));
 assert.equal(result.initial.extras!==null,true);assert.match(result.initial.labels,/1\.25L/);assert.equal(result.initial.clipped.length,0);assert.equal(result.initial.documentOverflow[0],0);
 assert.deepEqual(result.visualStates.base1.meta.length,4);assert.equal(result.visualStates.base2.quantity,2);assert.equal(result.visualStates.base9.quantity,9);assert.equal(result.visualStates.base9.clipped,0);assert.equal(result.visualStates.extra2,2);assert.equal(result.visualStates.extra9,9);
 assert.equal(result.mutation.doubled-result.mutation.start,33000);assert.equal(result.mutation.restored,result.mutation.start);assert.deepEqual(result.mutation.extrasAfter,result.mutation.extras);assert.equal(result.mutation.limitModal,'quantityLimit');assert.equal(result.mutation.deleteModal,'quantityDelete');assert.equal(result.mutation.cancelPreserves,true);assert.equal(result.mutation.finalCount,2);
 assert.deepEqual(result.extraMutation,{before:1,after:2,restored:1,baseQty:1,total:84800});
 assert.equal(result.locales.length,6);for(const row of result.locales){assert.equal(row.clipped.length,0,row.locale);assert.equal(row.documentOverflow[0],0,row.locale);assert.equal(row.controls.every(rect=>rect.height>=44),true,row.locale)}
 assert.deepEqual(result.focusRestore,{opened:true,restored:true});
 assert.deepEqual(result.setDrinkNextFlow,{upsell:'setDrinkUpsell',included:'includedSauce',labels:['추가안함','추가선택'],fontSizes:['28px','28px'],afterNext:{step:'review',modal:null,orders:1}});
 assert.equal(result.sauceTakeout.modal,'includedSauce');assert.deepEqual(result.sauceTakeout.summary,{garlic:2,pickle:1,hotSauce:2,honeyMustard:0,tomato:1,storeFree:[]});assert.match(result.sauceTakeout.text,/토마토소스/);
 assert.deepEqual(result.sauceDinein.summary.storeFree,['pickle','hotSauce']);assert.match(result.sauceDinein.text,/무료/);
 assert.ok(result.phoneModal.rect.top>=0);assert.ok(result.phoneModal.rect.bottom<=844);assert.equal(result.phoneModal.documentOverflow,0);assert.ok(result.phoneModal.scrollHeight>=result.phoneModal.clientHeight);
 assert.equal(result.phoneReview.layout,'phone');assert.deepEqual(result.phoneReview.documentOverflow,[0,0]);assert.deepEqual(result.phoneReview.overlaps,{frameSummary:0,listSummary:0,controlsSummary:0,summaryActions:0,actionsNetwork:0,summaryNetwork:0});assert.deepEqual(result.phoneReview.clipped,[]);assert.ok(result.phoneReview.listScroll[1]>result.phoneReview.listScroll[0]);assert.ok(result.phoneReview.summary.top>=result.phoneReview.frame.bottom);assert.ok(result.phoneReview.actions.top>=result.phoneReview.summary.bottom);assert.ok(result.phoneReview.network.bottom<=844);for(const button of result.phoneReview.buttons){assert.ok(button.top>=result.phoneReview.actions.top);assert.ok(button.bottom<=result.phoneReview.actions.bottom)}
 for(const name of result.captures)assert.equal(fs.existsSync(path.join(captures,name)),true,name);
});
