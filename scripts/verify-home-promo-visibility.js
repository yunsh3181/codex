const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {runElectronVerification}=require('./electron-verification-lifecycle');

const root=path.resolve(process.env.HOME_PROMO_ROOT||path.join(__dirname,'..'));
const reportPath=process.env.HOME_PROMO_REPORT||path.join(root,'artifacts','home-promo-visibility.json');
const screenshotDir=process.env.HOME_PROMO_SCREENSHOT_DIR||path.join(root,'artifacts','home-promo-visibility');
const screenshotLabel=process.env.HOME_PROMO_SCREENSHOT_LABEL||'after';
const capture=process.argv.includes('--screenshots');
const locales=['ko','en','ja','zh','vi','es'];
const viewports=[[1080,1920],[834,1112],[834,1000],[834,980],[834,940],[1112,834],[390,844],[360,640]];
const screenshotCases=new Set(['1080x1920/ko','834x1112/ko','834x940/ko','390x844/ko','390x844/es']);
fs.mkdirSync(path.dirname(reportPath),{recursive:true});
if(capture)fs.mkdirSync(screenshotDir,{recursive:true});
const fixtureDir=fs.mkdtempSync(path.join(app.getPath('temp'),'home-promo-document-'));
const fixturePath=path.join(fixtureDir,'index.html');
const sourceHtml=fs.readFileSync(path.join(root,'index.html'),'utf8');
const localBase=`<base href="${new URL(`file://${root.replaceAll('\\','/')}/`).href}">`;
const fixtureHtml=sourceHtml.replace('<head>','<head>'+localBase).replace('\nconnectKioskRuntime();\nwindow.reconnectKioskRuntimeDiagnostics','\nvoid 0;\nwindow.reconnectKioskRuntimeDiagnostics');
if(fixtureHtml===sourceHtml||fixtureHtml.includes('\nconnectKioskRuntime();\nwindow.reconnectKioskRuntimeDiagnostics'))throw new Error('local fixture did not disable the unrelated remote runtime');
fs.writeFileSync(fixturePath,fixtureHtml,{flag:'wx'});
app.once('will-quit',()=>fs.rmSync(fixtureDir,{recursive:true,force:true}));
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor','1');
const userDataPath=process.env.ELECTRON_VERIFICATION_USER_DATA||path.join(app.getPath('temp'),`home-promo-${process.pid}`);
fs.mkdirSync(userDataPath,{recursive:true});
app.setPath('userData',userDataPath);

const wait=win=>win.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.getAnimations().forEach(a=>a.finish())})()`,true);
const resize=async(win,width,height)=>{for(let attempt=0;attempt<20;attempt++){win.setContentSize(width,height);await wait(win);const actual=await win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight})`,true);if(actual.width===width&&actual.height===height)return;await new Promise(resolve=>setTimeout(resolve,40))}throw new Error(`viewport ${width}x${height} did not settle`)};
const fixture=(locale)=>`(()=>{PJ_I18N.setLanguage(${JSON.stringify(locale)});reset('idle',{skipRelease:true});Object.assign(state,{step:'home'});render();window.scrollTo(0,0)})()`;
const measure=`(()=>{
 const visible=e=>{if(!e)return false;const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
 const rect=e=>{const r=e.getBoundingClientRect();return {left:+r.left.toFixed(2),top:+r.top.toFixed(2),right:+r.right.toFixed(2),bottom:+r.bottom.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)}};
 const details=e=>e&&visible(e)?{text:e.textContent.trim(),rect:rect(e),fontSize:+parseFloat(getComputedStyle(e).fontSize).toFixed(2),lineHeight:getComputedStyle(e).lineHeight,client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]}:null;
 const cards=[...document.querySelectorAll('.heroPromoStrip>.heroPromo')];
 const cardMetrics=cards.map(card=>{const children=[...card.children].filter(visible),r=card.getBoundingClientRect(),left=Math.min(...children.map(e=>e.getBoundingClientRect().left)),right=Math.max(...children.map(e=>e.getBoundingClientRect().right)),top=Math.min(...children.map(e=>e.getBoundingClientRect().top)),bottom=Math.max(...children.map(e=>e.getBoundingClientRect().bottom)),overlaps=[];for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){const a=children[i].getBoundingClientRect(),b=children[j].getBoundingClientRect();if(a.left<b.right-.5&&a.right>b.left+.5&&a.top<b.bottom-.5&&a.bottom>b.top+.5)overlaps.push([children[i].className||children[i].tagName,children[j].className||children[j].tagName])}return {className:card.className,rect:rect(card),contentRect:{left:+left.toFixed(2),top:+top.toFixed(2),right:+right.toFixed(2),bottom:+bottom.toFixed(2),width:+(right-left).toFixed(2),height:+(bottom-top).toFixed(2)},usedAreaRatio:+(((right-left)*(bottom-top))/(r.width*r.height)).toFixed(4),emptyArea:+((r.width*r.height)-((right-left)*(bottom-top))).toFixed(2),clipped:children.filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>e.className||e.tagName),overlaps,backgroundImage:getComputedStyle(card).backgroundImage};});
 const badge=document.querySelector('.happyTakeoutOnly'),root=document.documentElement;
 const orphanLines=[...document.querySelectorAll('.heroPromoStrip h3,.heroPromoStrip strong,.heroPromoStrip span,.heroPromoStrip p')].filter(visible).flatMap(e=>{const node=[...e.childNodes].find(n=>n.nodeType===Node.TEXT_NODE&&n.data.trim());if(!node)return[];const lines=new Map;for(let i=0;i<node.data.length;i++){const range=document.createRange();range.setStart(node,i);range.setEnd(node,i+1);const r=range.getBoundingClientRect(),key=Math.round(r.top);lines.set(key,(lines.get(key)||'')+node.data[i])}return [...lines.values()].map(value=>value.trim()).filter(value=>value.length===1).map(value=>({className:e.className||e.tagName,value,text:e.textContent.trim()}))});
 return {layout:root.dataset.layout,document:{clientWidth:root.clientWidth,scrollWidth:root.scrollWidth,clientHeight:root.clientHeight,scrollHeight:root.scrollHeight,overflowY:getComputedStyle(document.body).overflowY},cards:cardMetrics,title:details(document.querySelector('.happyPromo h3')),benefit:details(document.querySelector('.happyPrice, .happyDealLine')),condition:details(document.querySelector('.takeoutSizeNote')),hours:details(document.querySelector('.happyHours')),badge:details(badge),badgeStyle:badge?{color:getComputedStyle(badge).color,backgroundColor:getComputedStyle(badge).backgroundColor,borderWidth:getComputedStyle(badge).borderWidth}:null,helper:details(document.querySelector('.happyDineInExclusion')),takeoutTitle:details(document.querySelector('.takeoutPromo h3')),takeoutBenefit:details(document.querySelector('.takeoutDiscount')),horizontalOverflow:Math.max(0,root.scrollWidth-innerWidth),verticalText:[...document.querySelectorAll('.heroPromoStrip h3,.heroPromoStrip strong,.heroPromoStrip span,.heroPromoStrip p')].filter(visible).filter(e=>e.textContent.trim().length>3&&e.getBoundingClientRect().width<parseFloat(getComputedStyle(e).fontSize)*1.35).map(e=>e.textContent.trim()),orphanLines,heineken:/Heineken|하이네켄/i.test(document.body.textContent),count:cards.length};
})()`;
async function shot(win,name,width,height){const png=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const image=nativeImage.createFromBuffer(Buffer.from(png.data,'base64'));if(image.getSize().width!==width||image.getSize().height!==height)throw new Error(`${name} screenshot size`);fs.writeFileSync(path.join(screenshotDir,`${name}.png`),image.toPNG())}

runElectronVerification({app},async lifecycle=>{
 lifecycle.expectReport(reportPath);
 const win=lifecycle.trackWindow(new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}));
 lifecycle.attachDebugger();
 const consoleMessages=[];
 win.webContents.on('console-message',(_event,level,message)=>{if(level>=2)consoleMessages.push({level,message})});
 win.setContentSize(834,1112);await win.loadFile(fixturePath);await wait(win);
 const results=[];
 for(const [width,height] of viewports)for(const locale of locales){await resize(win,width,height);await win.webContents.executeJavaScript(fixture(locale),true);await wait(win);const metrics=await win.webContents.executeJavaScript(measure,true);results.push({viewport:`${width}x${height}`,locale,metrics});if(capture&&screenshotCases.has(`${width}x${height}/${locale}`))await shot(win,`${screenshotLabel}-${locale}-${width}x${height}`,width,height)}
 await resize(win,834,1112);await win.webContents.executeJavaScript(fixture('ko'),true);await wait(win);
 const clickResults=await win.webContents.executeJavaScript(`(()=>{const out=[];document.querySelector('.happyPromo').click();out.push({card:'happy',step:state.step,orderType:state.orderType,promo:state.promo});reset('idle',{skipRelease:true});Object.assign(state,{step:'home'});render();document.querySelector('.takeoutPromo').click();out.push({card:'takeout',step:state.step,orderType:state.orderType,promo:state.promo});return out})()`,true);
 await lifecycle.writeReportAtomically(reportPath,{root,viewports:viewports.map(v=>v.join('x')),locales,results,clickResults,consoleMessages});
});
