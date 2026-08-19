const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {runElectronVerification}=require('./electron-verification-lifecycle');
const root=path.resolve(__dirname,'..'),reportPath=process.env.FOREIGN_NAME_REPORT,userData=process.env.ELECTRON_VERIFICATION_USER_DATA;
if(!reportPath||!userData)throw new Error('FOREIGN_NAME_REPORT and ELECTRON_VERIFICATION_USER_DATA are required');
fs.mkdirSync(userData,{recursive:true});app.setPath('userData',userData);app.commandLine.appendSwitch('headless');app.commandLine.appendSwitch('force-device-scale-factor','1');
const settle=win=>win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`,true);
runElectronVerification({app},async lifecycle=>{
 lifecycle.expectReport(reportPath);
 const win=lifecycle.trackWindow(new BrowserWindow({show:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}));
 const results={};
 for(const [viewport,width,height] of [['ipad-air3',834,1112],['windows',1280,720]]){
  win.setContentSize(width,height);await win.loadFile(path.join(root,'index.html'));await settle(win);results[viewport]={};
  for(const language of ['ko','en','ja','zh','vi','es'])results[viewport][language]=await win.webContents.executeJavaScript(`(()=>{setLanguage('${language}');Object.assign(state,{step:'phone',phone:'',customerDisplayName:''});render();const input=document.querySelector('#customerNameDisplay'),key=document.querySelector('.customerNameKeyRow button');if(key)key.click();const body=document.body,root=document.documentElement;return {step:state.step,foreign:foreignCustomerIdentity(),input:input?{readOnly:input.readOnly,inputMode:input.inputMode,value:document.querySelector('#customerNameDisplay')?.value}:null,keyCount:document.querySelectorAll('.customerNameKeyRow button').length,overflowX:Math.max(body.scrollWidth,root.scrollWidth)-innerWidth,overflowY:Math.max(body.scrollHeight,root.scrollHeight)-innerHeight}})()`,true)
 }
 await lifecycle.writeReportAtomically(reportPath,results)
});
