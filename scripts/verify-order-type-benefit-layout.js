const {app,BrowserWindow,session}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {runElectronVerification}=require('./electron-verification-lifecycle');
const {createCustomerGeometryRecorder}=require('./customer-geometry-diagnostics');

const root=path.resolve(__dirname,'..');
const reportPath=process.env.ORDER_TYPE_BENEFIT_REPORT||path.join(app.getPath('temp'),`order-type-benefit-${process.pid}.json`);
const captureDir=process.env.ORDER_TYPE_BENEFIT_CAPTURE_DIR||path.join(app.getPath('temp'),`order-type-benefit-captures-${process.pid}`);
const userDataPath=process.env.ELECTRON_VERIFICATION_USER_DATA||path.join(app.getPath('temp'),`order-type-benefit-profile-${process.pid}`);
fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.mkdirSync(captureDir,{recursive:true});fs.mkdirSync(userDataPath,{recursive:true});app.setPath('userData',userDataPath);
const firebaseRuntimeSource=fs.readFileSync(path.join(root,'tests','fixtures','admin-browser-runtime.js'),'utf8').replace(/\s*Object\.defineProperty\(window,'db'[^\n]+\);?/,'');
const firebaseRuntimePath=path.join(userDataPath,'fixture-firebase-runtime.js'),emptyRuntimePath=path.join(userDataPath,'fixture-empty-runtime.js'),externalRequests=[];
fs.writeFileSync(firebaseRuntimePath,`${firebaseRuntimeSource};window.__PJ_FIRESTORE_FIXTURE__={externalRequests:0,reads:0,writes:0,authAttempts:0}`);fs.writeFileSync(emptyRuntimePath,'void 0');
const firebaseRuntimeUrl=pathToFileURL(firebaseRuntimePath).href,emptyRuntimeUrl=pathToFileURL(emptyRuntimePath).href;
const recordGeometry=createCustomerGeometryRecorder({name:'promotion-title',captureDir});
app.commandLine.appendSwitch('headless');app.commandLine.appendSwitch('hide-scrollbars');app.commandLine.appendSwitch('force-device-scale-factor','2');

const viewports=[[834,1112],[834,1024],[834,940],[810,1080],[768,1024],[1112,834],[360,640],[375,667],[390,844],[393,852],[412,915],[430,932],[1080,1920],[1920,1080]];
const locales=['ko','en','ja','zh','es','vi'];
const wait=win=>win.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.getAnimations().forEach(a=>a.finish())})()`,true);
const resize=async(win,width,height)=>{for(let attempt=0;attempt<20;attempt++){win.setContentSize(width,height);await wait(win);const size=await win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight})`,true);if(size.width===width&&size.height===height)return;await new Promise(resolve=>setTimeout(resolve,40))}throw new Error(`viewport did not settle: ${width}x${height}`)};
const setup=(step,locale)=>`(()=>{PJ_I18N.setLanguage(${JSON.stringify(locale)});reset('idle',{skipRelease:true});if(${JSON.stringify(step)}==='promo'){isHappyHourBenefitVisible=()=>true;Object.assign(state,{step:'promo',orderType:'takeout',orderTiming:'now',cartItems:[]})}else Object.assign(state,{step:'home',orderType:null,cartItems:[]});render()})()`;
const measure=`(()=>{const rect=e=>{if(!e)return null;const r=e.getBoundingClientRect();return {left:+r.left.toFixed(2),top:+r.top.toFixed(2),right:+r.right.toFixed(2),bottom:+r.bottom.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)}};const stage=document.querySelector('.stage'),footer=document.querySelector('.cartbar'),cards=[...document.querySelectorAll('.darkBenefitCard')],last=cards.at(-1),visible=[...document.querySelectorAll('.stage h1,.stage h2,.stage p,.stage small,.stage span')].filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0}),clipped=visible.filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>({className:e.className,text:e.textContent.trim().slice(0,70),client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]}));return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,layout:document.documentElement.dataset.layout,step:document.body.dataset.step,documentOverflow:[document.documentElement.scrollWidth-document.documentElement.clientWidth,document.documentElement.scrollHeight-document.documentElement.clientHeight],stage:stage?{...rect(stage),scrollTop:stage.scrollTop,clientHeight:stage.clientHeight,scrollHeight:stage.scrollHeight,maxScrollTop:stage.scrollHeight-stage.clientHeight,overflowY:getComputedStyle(stage).overflowY}:null,footer:rect(footer),title:rect(document.querySelector('.darkBenefitTitle')),subtitle:rect(document.querySelector('.darkBenefitSub')),cards:cards.map(rect),lastFooterGap:last&&footer?+(footer.getBoundingClientRect().top-last.getBoundingClientRect().bottom).toFixed(2):null,note:rect(document.querySelector('.darkBenefitNote')),eyebrows:document.querySelectorAll('.heroChoice .eyebrow').length,homeTitles:[...document.querySelectorAll('.heroChoice h2')].map(e=>e.textContent.trim()),homeDescriptions:[...document.querySelectorAll('.heroChoiceDescription')].map(e=>e.textContent.trim()),homeCards:[...document.querySelectorAll('.heroChoice')].map(rect),clipped}})()`;

runElectronVerification({app},async lifecycle=>{
 lifecycle.expectReport(reportPath);
 session.defaultSession.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{const match=details.url.match(/\/assets\/vendor\/firebase\/firebase-(app|firestore|auth)-compat\.js(?:\?|$)/);if(match)return callback({redirectURL:match[1]==='app'?firebaseRuntimeUrl:emptyRuntimeUrl});if(/^https?:/i.test(details.url)){const parsed=new URL(details.url);externalRequests.push(`${parsed.protocol}//${parsed.host}${parsed.pathname}`)}callback({})});
 const win=lifecycle.trackWindow(new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}),'order-type-benefit');
 win.setContentSize(834,1112);await win.loadFile(path.join(root,'index.html'));await resize(win,834,1112);
 const rows=[];
 for(const [width,height] of viewports){await resize(win,width,height);for(const locale of locales){for(const step of ['home','promo']){
  await win.webContents.executeJavaScript(setup(step,locale),true);await wait(win);
  const row={width,height,locale,...await win.webContents.executeJavaScript(measure,true)};
  if(step==='promo'&&(row.clipped.length>0||(width===834&&height===1112&&locale==='ko'))){row.diagnostics=await recordGeometry(win,{caseName:`${width}x${height}-${locale}-${step}`,selector:'.darkBenefitTitle',assertionFailed:row.clipped.length!==0,fixture:{width,height,locale,step}})}
  rows.push(row);
 }}}
 const capture=async(name,step,locale='ko')=>{await resize(win,834,1112);await win.webContents.executeJavaScript(setup(step,locale),true);await wait(win);fs.writeFileSync(path.join(captureDir,name),(await win.capturePage()).toPNG())};
 await capture('834x1112-order-type-ko.png','home');await capture('834x1112-benefits-ko.png','promo');
 await resize(win,834,940);await win.webContents.executeJavaScript(setup('promo','ko'),true);await wait(win);fs.writeFileSync(path.join(captureDir,'834x940-benefits-ko.png'),(await win.capturePage()).toPNG());
 await lifecycle.writeReportAtomically(reportPath,{rows,captures:['834x1112-order-type-ko.png','834x1112-benefits-ko.png','834x940-benefits-ko.png'],isolation:{externalRequests,reads:0,writes:0,authAttempts:0,paymentCalls:0,seatTransactions:0}});
});
