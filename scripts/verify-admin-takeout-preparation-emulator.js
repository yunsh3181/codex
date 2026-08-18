const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,collection,getDocs}=require('firebase/firestore');
const {exportAdminVisualSite}=require('./serve-admin-visual');
const {runElectronVerification}=require('./electron-verification-lifecycle');
const root=path.resolve(__dirname,'..'),reportPath=process.env.ADMIN_TAKEOUT_EMULATOR_REPORT,userData=process.env.ELECTRON_VERIFICATION_USER_DATA;
if(!reportPath||!userData||!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('report, userData, and FIRESTORE_EMULATOR_HOST are required');
fs.mkdirSync(userData,{recursive:true});app.setPath('userData',userData);app.disableHardwareAcceleration();app.commandLine.appendSwitch('headless');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function main(lifecycle){
 const environment=await initializeTestEnvironment({projectId:'demo-admin-takeout-completion'}),admin=environment.authenticatedContext('seed',{admin:true}).firestore();
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'admin-takeout-emulator-site-'));
 const seed=async(id,status='payment_pending')=>environment.withSecurityRulesDisabled(async context=>{const db=context.firestore(),order={businessDay:'2026-08-19',createdAtClient:new Date().toISOString(),status,orderType:'takeout',source:'mobile',channel:'mobile',customerNumber:id,orderNo:id,total:15000,payment:{method:'card'},items:[]};await setDoc(doc(db,'orders',id),order);await setDoc(doc(db,'publicOrderDisplays',id),{orderNumber:id,displayStatus:status,storeId:'pangyo',businessDay:'2026-08-19',updatedAt:new Date()})});
 try{
  await seed('P-EMU-15');exportAdminVisualSite(site);
  const bridge=fs.readFileSync(path.join(root,'tests/fixtures/admin-takeout-emulator-bridge.js'),'utf8').replace('__WORKSPACE_NODE_MODULES__',path.join(root,'node_modules'));
  fs.writeFileSync(path.join(site,'tests/fixtures/admin-takeout-emulator-bridge.js'),bridge);
  const htmlPath=path.join(site,'admin/index.html');let html=fs.readFileSync(htmlPath,'utf8');html=html.replace('<script src="../common-data.js', '<script src="../tests/fixtures/admin-takeout-emulator-bridge.js"></script>\n  <script src="../common-data.js');fs.writeFileSync(htmlPath,html);
  const win=lifecycle.trackWindow(new BrowserWindow({show:false,width:1440,height:900,webPreferences:{contextIsolation:false,nodeIntegration:true,sandbox:false,backgroundThrottling:false}}));
  win.webContents.on('console-message',(_event,level,message)=>process.stderr.write(`[admin console ${level}] ${message}\n`));
  await win.loadFile(htmlPath,{query:{uid:'admin-ui'}});await win.webContents.executeJavaScript('__takeoutEmulator.ready');
  await win.webContents.executeJavaScript(`(()=>{PJAdminVisualFixture.add({id:'P-EMU-15',businessDay:seoulBusinessDayKey(),createdAtClient:new Date().toISOString(),status:'payment_pending',orderType:'takeout',source:'mobile',channel:'mobile',customerNumber:'P-EMU-15',orderNo:'P-EMU-15',total:15000,payment:{method:'card'},items:[]});render()})()`);await wait(50);
  const cancel=await win.webContents.executeJavaScript(`(()=>{const button=document.querySelector('[data-order-id="P-EMU-15"] .payment-pending'),before=__takeoutEmulator.attempts;button.click();cancelPreparationTime.click();return {hidden:preparationTimeModal.hidden,focus:document.activeElement?.dataset?.action,attempts:__takeoutEmulator.attempts-before}})()`);
  const escape=await win.webContents.executeJavaScript(`(()=>{const button=document.querySelector('[data-order-id="P-EMU-15"] .payment-pending'),before=__takeoutEmulator.attempts;button.click();preparationTimeModal.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return {hidden:preparationTimeModal.hidden,focus:document.activeElement?.dataset?.action,attempts:__takeoutEmulator.attempts-before}})()`);
  const success=await win.webContents.executeJavaScript(`(()=>new Promise((resolve,reject)=>{const button=document.querySelector('[data-order-id="P-EMU-15"] .payment-pending'),before=__takeoutEmulator.attempts;button.click();confirmPreparationTime.click();confirmPreparationTime.click();const started=Date.now(),poll=()=>{if(__takeoutEmulator.commits===1&&preparationTimeModal.hidden)resolve({attempts:__takeoutEmulator.attempts-before,modalHidden:true,toast:document.getElementById('toastText')?.textContent});else if(Date.now()-started>5000)reject(new Error(JSON.stringify({reason:'UI transaction timeout',attempts:__takeoutEmulator.attempts,commits:__takeoutEmulator.commits,toast:document.getElementById('toastText')?.textContent,modal:preparationTimeModal.hidden})));else setTimeout(poll,20)};poll()}))()`);
  const order=(await getDoc(doc(admin,'orders','P-EMU-15'))).data(),display=(await getDoc(doc(admin,'publicOrderDisplays','P-EMU-15'))).data();
  const writtenPaths=await win.webContents.executeJavaScript('__takeoutEmulator.writtenPaths');
  const result={cancel,escape,success,order:{status:order.status,minutes:order.preparationMinutes,started:order.preparationStartedAt.toMillis(),due:order.readyDueAt.toMillis(),auto:order.autoReadyEnabled},display:{status:display.displayStatus,minutes:display.preparationMinutes,started:display.preparationStartedAt.toMillis(),due:display.readyDueAt.toMillis(),auto:display.autoReadyEnabled},writes:{orders:writtenPaths.filter(value=>value.startsWith('orders/')).length,displays:writtenPaths.filter(value=>value.startsWith('publicOrderDisplays/')).length,seats:writtenPaths.filter(value=>value.startsWith('seats/')).length,payments:writtenPaths.filter(value=>value.startsWith('payments/')).length},bridge:{attempts:await win.webContents.executeJavaScript('__takeoutEmulator.attempts'),commits:await win.webContents.executeJavaScript('__takeoutEmulator.commits')}};
  await fs.promises.writeFile(reportPath,JSON.stringify(result,null,2));await win.webContents.executeJavaScript('__takeoutEmulator.close()');
 }finally{await environment.cleanup();fs.rmSync(site,{recursive:true,force:true})}
}
runElectronVerification({app},main);
