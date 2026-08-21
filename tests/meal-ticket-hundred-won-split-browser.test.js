'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnElectronVerificationSync,assertElectronSucceeded}=require('./helpers/electron-verification-process');

const root=path.resolve(__dirname,'..');

test('actual Chromium keeps meal-ticket UI, payload, and fail-closed boundary identical',{timeout:180000},t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'meal-ticket-split-')),report=path.join(temp,'report.json'),profile=path.join(temp,'profile');
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const run=spawnElectronVerificationSync(['scripts/verify-meal-ticket-hundred-won-split.js'],{cwd:root,encoding:'utf8',env:{...process.env,MEAL_TICKET_SPLIT_REPORT:report,ELECTRON_VERIFICATION_USER_DATA:profile,ELECTRON_DISABLE_SECURITY_WARNINGS:'true'},timeout:170000,maxBuffer:10*1024*1024});
 assertElectronSucceeded(assert,run,report);
 const value=JSON.parse(fs.readFileSync(report,'utf8'));
 assert.deepEqual(value.viewport,[834,1112]);
 const expected=[[10000,10000,10100],[10100,10200,10200],[10200,10300,10300],[10500,10500,10500,10500]];
 value.valid.forEach((row,index)=>{assert.deepEqual(row.ui,expected[index]);assert.deepEqual(row.payload,expected[index]);assert.equal(row.buttonDisabled,false);assert.equal(row.overflow,0)});
 assert.deepEqual(value.invalid,{validPayment:false,buttonDisabled:true,error:'분할 결제 금액을 확인할 수 없습니다. 관리자에게 확인해 주세요.',orderWrites:0,paymentApiCalls:0,splitRows:0});
 assert.deepEqual(value.ordinary,[
  {method:'card',total:30101,totalAmount:30101,splitCount:1,splitAmounts:[30101]},
  {method:'cash',total:30101,totalAmount:30101,splitCount:1,splitAmounts:[30101]}
 ]);
});
