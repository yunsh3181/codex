const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {runElectronVerification}=require('./electron-verification-lifecycle');
const root=path.resolve(__dirname,'..'),reportPath=process.env.DISPOSABLES_REPORT,userData=process.env.ELECTRON_VERIFICATION_USER_DATA;
if(!reportPath||!userData)throw new Error('DISPOSABLES_REPORT and ELECTRON_VERIFICATION_USER_DATA are required');
fs.mkdirSync(userData,{recursive:true});app.setPath('userData',userData);app.commandLine.appendSwitch('headless');app.commandLine.appendSwitch('force-device-scale-factor','1');
async function wait(win){const result=await win.webContents.executeJavaScript(`(async()=>{try{if(document.fonts?.ready)await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return {ok:true}}catch(error){return {ok:false,error:error.stack||String(error)}}})()`,true);if(!result.ok)throw new Error(`renderer wait failed: ${result.error}`)}
const seed=`(()=>{try{reset('idle',{skipRelease:true});kioskTestModeController.isEnabled=()=>false;window.PJ_NETWORK.isOnline=()=>true;Object.assign(state,{step:'side',orderType:'takeout',orderTiming:'now',promo:'set',set:2,size:'R',mode:'single',left:'P001',right:null,dough:'오리지널',crust:'오리지널',toppingChoice:'skip',toppings:{},extraSides:{S001:1},extraDrinks:{},setSides:{S007:1},setDrink:'D004',setSidePrompted:true,setDrinkPrompted:false,finalUpsellPrompted:false,cartItems:[],disposables:null,phone:'01012345678',paymentMethod:'card',orderNo:'P4242',modal:'disposables'});window.__savedOrders=[];window.__transactionCalls=0;db.collection=name=>({doc:()=>({id:'fixture-order',collectionName:name})});db.runTransaction=async callback=>{window.__transactionCalls++;return callback({set(_ref,value){window.__savedOrders.push(value)}})};render();return {ok:true,viewport:[innerWidth,innerHeight],visualViewport:[visualViewport.width,visualViewport.height]}}catch(error){return {ok:false,error:error.stack||String(error)}}})()`;
async function click(win,selector){const result=await win.webContents.executeJavaScript(`(()=>{try{const element=document.querySelector(${JSON.stringify(selector)});if(!element)return {ok:false,error:'missing selector',step:state?.step,modal:state?.modal,text:document.body.innerText.slice(0,1000)};element.click();return {ok:true}}catch(error){return {ok:false,error:error.stack||String(error)}}})()`,true);if(!result.ok)throw new Error(`click ${selector} failed: ${JSON.stringify(result)}`);await wait(win)}
async function runChoice(win,needed){
 const start=await win.webContents.executeJavaScript(seed,true);if(!start.ok)throw new Error(start.error);await wait(win);
 await click(win,needed?'.disposablesModal .next':'.disposablesModal .prev');
 const afterChoice=await win.webContents.executeJavaScript(`({value:state.disposables,step:state.step})`,true);
 await click(win,'.selectionFooterCard');await click(win,'.upsellModal .upsellNo');await click(win,'.selectionFooterCard');
 const review=await win.webContents.executeJavaScript(`({step:state.step,value:state.disposables,text:document.querySelector('.reviewDisposables')?.innerText||'',cart:JSON.stringify(state.cartItems),total:reviewTotals().final})`,true);
 await click(win,'.reviewBackBtn');const previous=await win.webContents.executeJavaScript(`state.step`,true);await click(win,'.selectionFooterCard');
 const returned=await win.webContents.executeJavaScript(`({step:state.step,value:state.disposables,text:document.querySelector('.reviewDisposables')?.innerText||'',cart:JSON.stringify(state.cartItems),total:reviewTotals().final})`,true);
 await win.webContents.executeJavaScript(`state.phone='12345678';state.step='payment';render()`,true);await wait(win);await win.webContents.executeJavaScript(`(()=>{const b=document.querySelector('#paymentSubmitBtn');b.click();b.click()})()`,true);await new Promise(resolve=>setTimeout(resolve,100));
 const saved=await win.webContents.executeJavaScript(`({calls:window.__transactionCalls,orders:window.__savedOrders.map(value=>JSON.parse(JSON.stringify(value))),step:state.step,testMode:isTestModeEnabled(),validPhone:validPhone(),validPayment:validPayment(),error:document.querySelector('#submitError')?.innerText||''})`,true);return {start,afterChoice,review,previous,returned,saved}
}
runElectronVerification({app},async lifecycle=>{
 lifecycle.expectReport(reportPath);const win=lifecycle.trackWindow(new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}));win.setContentSize(834,1112);
 await win.loadFile(path.join(root,'index.html'));await wait(win);const needed=await runChoice(win,true);
 const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.webContents.reload();await loaded;await wait(win);const notNeeded=await runChoice(win,false);
 const payload=needed.saved.orders[0];await win.loadFile(path.join(root,'admin','index.html'));await wait(win);
 const admin=await win.webContents.executeJavaScript(`(()=>{const base=${JSON.stringify({id:'fixture-order'})},payload=Object.assign(base,${JSON.stringify(payload)}),render=value=>{const order={...payload};if(value==='missing')delete order.disposables;else order.disposables=value;return orderDetailForkHTML(order)};return {needed:render(true),notNeeded:render(false),missing:render('missing'),nullValue:render(null),stringTrue:render('true'),stringFalse:render('false')}})()`,true);
 await lifecycle.writeReportAtomically(reportPath,{needed,notNeeded,admin})
});
