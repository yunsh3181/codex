const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {runElectronVerification}=require('./electron-verification-lifecycle');

const root=path.resolve(__dirname,'..');
const reportPath=process.env.MEAL_TICKET_SPLIT_REPORT;
const userData=process.env.ELECTRON_VERIFICATION_USER_DATA;
if(!reportPath||!userData)throw new Error('MEAL_TICKET_SPLIT_REPORT and ELECTRON_VERIFICATION_USER_DATA are required');
fs.mkdirSync(userData,{recursive:true});
app.setPath('userData',userData);
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('force-device-scale-factor','1');

async function wait(win){
 const result=await win.webContents.executeJavaScript(`(async()=>{try{if(document.fonts?.ready)await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));return {ok:true}}catch(error){return {ok:false,error:error.stack||String(error)}}})()`,true);
 if(!result.ok)throw new Error(result.error);
}

runElectronVerification({app},async lifecycle=>{
 lifecycle.expectReport(reportPath);
 const win=lifecycle.trackWindow(new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}));
 win.setContentSize(834,1112);
 await win.loadFile(path.join(root,'index.html'));
 await wait(win);
 const report=await win.webContents.executeJavaScript(`(async()=>{
  const makeItem=total=>({promo:'normal',set:null,size:'L',mode:'single',pizzaLeft:'P001',pizzaRight:null,pizzaName:'페퍼로니',crust:'오리지널',dough:'오리지널',qty:1,price:total,normalPrice:total,discount:0,toppings:{},sides:{},drinks:{},includedSides:{},includedDrinks:{}});
  const seed=(total,count,method='meal_ticket')=>{Object.assign(state,{step:'payment',orderType:'takeout',orderTiming:'now',phone:'12341234',disposables:false,paymentMethod:method,splitCount:count,cartItems:[makeItem(total)],left:null,right:null});render()};
  const valid=[];
  for(const [total,count] of [[30100,3],[30500,3],[30800,3],[42000,4]]){seed(total,count);const ui=[...document.querySelectorAll('.splitAmounts strong')].map(node=>Number(node.textContent.replace(/\\D/g,''))),payload=JSON.parse(JSON.stringify(buildMobileOrderPayload()));valid.push({total,count,ui,payload:payload.payment.splitAmounts,buttonDisabled:document.getElementById('paymentSubmitBtn').disabled,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth})}
  window.__orderWrites=0;window.__paymentApiCalls=0;const originalFetch=window.fetch;window.fetch=(...args)=>{window.__paymentApiCalls+=1;return originalFetch(...args)};db.runTransaction=async callback=>{window.__orderWrites+=1;return callback({set(){window.__orderWrites+=1}})};
  seed(30101,3);await complete();const invalid={validPayment:validPayment(),buttonDisabled:document.getElementById('paymentSubmitBtn').disabled,error:document.getElementById('submitError').textContent,orderWrites:window.__orderWrites,paymentApiCalls:window.__paymentApiCalls,splitRows:document.querySelectorAll('.splitAmounts strong').length};
  const ordinary=[];for(const method of ['card','cash']){seed(30101,99,method);const payload=JSON.parse(JSON.stringify(buildMobileOrderPayload()));ordinary.push({method,total:payload.total,totalAmount:payload.totalAmount,splitCount:payload.payment.splitCount,splitAmounts:payload.payment.splitAmounts})}
  return {viewport:[innerWidth,innerHeight],valid,invalid,ordinary}
 })()`,true);
 await lifecycle.writeReportAtomically(reportPath,report);
});
