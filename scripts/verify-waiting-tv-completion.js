const {app,BrowserView,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {runElectronVerification}=require('./electron-verification-lifecycle');
const root=path.resolve(__dirname,'..'),reportPath=process.env.WAITING_TV_REPORT,screenshotPath=process.env.WAITING_TV_SCREENSHOT;
app.disableHardwareAcceleration();app.commandLine.appendSwitch('headless');app.commandLine.appendSwitch('force-device-scale-factor','1');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function trustedClick(window,selector){const bounds=await window.webContents.executeJavaScript(`(()=>{const rect=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(rect.left+rect.width/2),y:Math.round(rect.top+rect.height/2)}})()`);window.webContents.sendInputEvent({type:'mouseDown',...bounds,button:'left',clickCount:1});window.webContents.sendInputEvent({type:'mouseUp',...bounds,button:'left',clickCount:1});await delay(150)}
function exportFixtureSite(target){
 fs.mkdirSync(path.join(target,'waiting-tv'),{recursive:true});fs.mkdirSync(path.join(target,'assets','images'),{recursive:true});fs.mkdirSync(path.join(target,'tests','fixtures'),{recursive:true});
 for(const file of ['waiting-tv.css','waiting-tv.js'])fs.copyFileSync(path.join(root,'waiting-tv',file),path.join(target,'waiting-tv',file));
 fs.copyFileSync(path.join(root,'speech.js'),path.join(target,'speech.js'));fs.copyFileSync(path.join(root,'assets/images/papajohns_red_logo.png'),path.join(target,'assets/images/papajohns_red_logo.png'));fs.copyFileSync(path.join(root,'tests/fixtures/waiting-tv-browser-runtime.js'),path.join(target,'tests/fixtures/waiting-tv-browser-runtime.js'));
 let html=fs.readFileSync(path.join(root,'waiting-tv/index.html'),'utf8');html=html.replace(/\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs[^>]+><\/script>/g,'').replace(/\s*<script src="\.\.\/firebase-config\.js"><\/script>/,'\n  <script src="../tests/fixtures/waiting-tv-browser-runtime.js"></script>');fs.writeFileSync(path.join(target,'waiting-tv/index.html'),html);
}
const ready=(id,number,updatedAt)=>({id,orderNumber:number,displayStatus:'ready',businessDay:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),updatedAt});
const cooking=(id,number,updatedAt)=>({...ready(id,number,updatedAt),displayStatus:'cooking'});
async function main(lifecycle){
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'waiting-tv-completion-'));exportFixtureSite(site);
 const host=lifecycle.trackWindow(new BrowserWindow({show:true,opacity:0,width:800,height:600,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}}));
 const view=new BrowserView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});host.setBrowserView(view);view.setBounds({x:0,y:0,width:1080,height:1920});
 const window={webContents:view.webContents,loadFile:file=>view.webContents.loadFile(file),reload:()=>view.webContents.reload()};
 const consoleProblems=[];window.webContents.on('console-message',event=>{if(event.level>=2)consoleProblems.push(event.message)});
 try{
  await window.loadFile(path.join(site,'waiting-tv/index.html'));await delay(300);
  const now=Date.now(),results={};
  results.initial=await window.webContents.executeJavaScript(`(()=>({starts:__tvAudioFixture.oscillatorStarts,contexts:__tvAudioFixture.contexts,ready:document.querySelectorAll('#readyOrders [data-order-key]').length,button:enableVoice.textContent}))()`);
  await window.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify([cooking('a','1111',now)])})`);await trustedClick(window,'#enableVoice');
  results.unlock=await window.webContents.executeJavaScript(`(()=>({contexts:__tvAudioFixture.contexts,resumeCalls:__tvAudioFixture.resumeCalls,state:completionAudioContext?.state,button:enableVoice.textContent}))()`);
  await window.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify([ready('a','1111',now+1)])})`);await delay(650);results.transition=await window.webContents.executeJavaScript(`(()=>({starts:__tvAudioFixture.oscillatorStarts,ready:document.querySelector('#readyOrders').textContent}))()`);
  await window.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify([ready('a','1111',now+1)])});renderAll()`);await delay(650);results.duplicate=await window.webContents.executeJavaScript(`__tvAudioFixture.oscillatorStarts`);
  await window.webContents.executeJavaScript(`__tvFixture.setInitial(${JSON.stringify([ready('a','1111',now+1)])})`);await window.reload();await delay(350);results.reload=await window.webContents.executeJavaScript(`(()=>({starts:__tvAudioFixture.oscillatorStarts,ready:document.querySelectorAll('#readyOrders [data-order-key]').length}))()`);
  await trustedClick(window,'#enableVoice');await window.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify([ready('a','1111',now+1),ready('b','2222',now+2)])})`);await delay(650);results.newReady=await window.webContents.executeJavaScript(`__tvAudioFixture.oscillatorStarts`);
  await window.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify([ready('a','1111',now+1),ready('b','2222',now+2),cooking('c','3333',now+3),cooking('d','4444',now+4)])});__tvFixture.emitPublic(${JSON.stringify([ready('a','1111',now+1),ready('b','2222',now+2),ready('c','3333',now+5),ready('d','4444',now+6)])})`);await delay(1200);results.twoOrders=await window.webContents.executeJavaScript(`__tvAudioFixture.oscillatorStarts`);
  await window.webContents.executeJavaScript(`(async()=>{await completionAudioContext.close();completionSoundEnabled=false;__tvAudioFixture.failResume=true})()`);await trustedClick(window,'#enableVoice');const beforeFailure=await window.webContents.executeJavaScript(`__tvAudioFixture.oscillatorStarts`);await window.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify([ready('failure','5555',now+7)])})`);await delay(650);results.resumeFailure=await window.webContents.executeJavaScript(`(()=>({starts:__tvAudioFixture.oscillatorStarts,before:${beforeFailure},resumeCalls:__tvAudioFixture.resumeCalls,ready:document.querySelector('#readyOrders').textContent,button:enableVoice.textContent}))()`);
  await window.webContents.executeJavaScript(`__tvAudioFixture.failResume=false;__tvFixture.setHidden(true);__tvFixture.emitPublic(${JSON.stringify([ready('hidden','6666',now+8)])});__tvFixture.setHidden(false);__tvFixture.emitPublic(${JSON.stringify([ready('hidden','6666',now+8)])})`);await delay(650);results.hidden=await window.webContents.executeJavaScript(`__tvAudioFixture.oscillatorStarts`);
  await window.webContents.executeJavaScript(`__tvFixture.emitPublic([]);__tvFixture.emitPublic(${JSON.stringify([ready('hidden','6666',now+8)])})`);await delay(650);results.reappeared=await window.webContents.executeJavaScript(`__tvAudioFixture.oscillatorStarts`);
  results.layout=await window.webContents.executeJavaScript(`(()=>{const readyCards=[...document.querySelectorAll('#readyOrders .order-number')];return {viewport:[innerWidth,innerHeight],horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),verticalOverflow:Math.max(0,document.documentElement.scrollHeight-document.documentElement.clientHeight),clipped:readyCards.filter(card=>{const r=card.getBoundingClientRect();return r.left<0||r.right>innerWidth}).length,overlap:readyCards.some((card,index)=>{const r=card.getBoundingClientRect();return readyCards.slice(index+1).some(other=>{const o=other.getBoundingClientRect();return r.bottom>o.top&&r.top<o.bottom})})}})()`);results.consoleProblems=consoleProblems;
  if(screenshotPath){const image=await window.webContents.capturePage();fs.mkdirSync(path.dirname(screenshotPath),{recursive:true});fs.writeFileSync(screenshotPath,nativeImage.createFromBuffer(image.toPNG()).toPNG())}
  fs.writeFileSync(reportPath,JSON.stringify(results,null,2));
 }finally{fs.rmSync(site,{recursive:true,force:true})}
}
runElectronVerification({app},main);
