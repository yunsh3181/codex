const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {initializeTestEnvironment}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc}=require('firebase/firestore');
const {runElectronVerification}=require('./electron-verification-lifecycle');
const root=path.resolve(__dirname,'..');
const reportPath=process.env.ADMIN_SEAT_LAYOUT_EMULATOR_REPORT;
const userData=process.env.ELECTRON_VERIFICATION_USER_DATA;
if(!reportPath||!userData||!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('report, userData, and FIRESTORE_EMULATOR_HOST are required');
fs.mkdirSync(userData,{recursive:true});app.setPath('userData',userData);app.disableHardwareAcceleration();app.commandLine.appendSwitch('headless');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function exportSite(target){for(const dir of ['seat','tests/fixtures'])fs.mkdirSync(path.join(target,dir),{recursive:true});for(const file of ['admin.css','seats.css','seats-mobile.css','bottle-seat-policy.css','bottle-seat-policy.js','seat-layout.css','seat-layout.js','seats.js'])fs.copyFileSync(path.join(root,file),path.join(target,file));const runtime=fs.readFileSync(path.join(root,'tests/fixtures/seat-layout-emulator-runtime.js'),'utf8').replace('__WORKSPACE_NODE_MODULES__',path.join(root,'node_modules')).replace('__WORKSPACE_SEAT_LAYOUT__',path.join(root,'seat-layout.js'));fs.writeFileSync(path.join(target,'tests/fixtures/seat-layout-emulator-runtime.js'),runtime);let html=fs.readFileSync(path.join(root,'seat/index.html'),'utf8');html=html.replace(/<script src="https:\/\/www\.gstatic\.com[^>]+><\/script>/g,'').replace(/<script src="\.\.\/firebase-config\.js[^>]+><\/script>/,'<script src="../tests/fixtures/seat-layout-emulator-runtime.js"></script>');fs.writeFileSync(path.join(target,'seat/index.html'),html)}
async function main(lifecycle){
 const environment=await initializeTestEnvironment({projectId:'demo-admin-seat-layout'}),seed=environment.authenticatedContext('seed',{admin:true}).firestore(),target=doc(seed,'adminSettings','seatLayout'),defaults=require('../seat-layout').copyDefault();
 await setDoc(target,{positions:defaults,revision:1,updatedAt:require('firebase/firestore').serverTimestamp(),updatedBy:'seed'});
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'admin-seat-layout-emulator-site-')),create=async uid=>{const win=lifecycle.trackWindow(new BrowserWindow({show:false,width:1440,height:900,webPreferences:{contextIsolation:false,nodeIntegration:true,sandbox:false,backgroundThrottling:false}}));win.webContents.on('console-message',(_event,level,message)=>process.stderr.write(`[${uid} console ${level}] ${message}\n`));await win.loadFile(path.join(site,'seat/index.html'),{query:{uid}});const probe=await win.webContents.executeJavaScript(`({runtime:typeof __seatLayoutEmulator,requireType:typeof require})`);if(probe.runtime!=='object')throw new Error(`${uid} runtime unavailable: ${JSON.stringify(probe)}`);await win.webContents.executeJavaScript(`__seatLayoutEmulator.ready`);await delay(120);return win};exportSite(site);
 try{
  const a=await create('admin-a'),b=await create('admin-b');
  await Promise.all([a.webContents.executeJavaScript(`editSeatLayout.click();PJSeatLayoutEditor.applyDraftMove('papa-2',10)`),b.webContents.executeJavaScript(`editSeatLayout.click();PJSeatLayoutEditor.applyDraftMove('papa-bar4',11)`)]);
  const before={a:await a.webContents.executeJavaScript(`PJSeatLayoutEditor.getState()`),b:await b.webContents.executeJavaScript(`PJSeatLayoutEditor.getState()`)};
  const aSaved=await a.webContents.executeJavaScript(`PJSeatLayoutEditor.saveLayout()`);await delay(180);const bAfterSnapshot=await b.webContents.executeJavaScript(`PJSeatLayoutEditor.getState()`),bSaved=await b.webContents.executeJavaScript(`PJSeatLayoutEditor.saveLayout()`);await delay(80);
  const final=(await getDoc(target)).data(),result={before,aSaved,bAfterSnapshot,bSaved,aTransactionSets:await a.webContents.executeJavaScript(`__seatLayoutEmulator.transactionSetCount`),bTransactionSets:await b.webContents.executeJavaScript(`__seatLayoutEmulator.transactionSetCount`),final};
  const temporary=`${reportPath}.${process.pid}.tmp`;await fs.promises.mkdir(path.dirname(reportPath),{recursive:true});await fs.promises.writeFile(temporary,JSON.stringify(result,null,2));await fs.promises.rename(temporary,reportPath);
  await Promise.all([a.webContents.executeJavaScript(`__seatLayoutEmulator.close()`),b.webContents.executeJavaScript(`__seatLayoutEmulator.close()`)]);
 }finally{await environment.cleanup();fs.rmSync(site,{recursive:true,force:true})}
}
runElectronVerification({app},main);
