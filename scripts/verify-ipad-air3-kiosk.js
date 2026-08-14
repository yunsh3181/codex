const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { runElectronVerification } = require('./electron-verification-lifecycle');

const root = path.resolve(__dirname, '..');
const reportPath = process.env.IPAD_AIR3_REPORT || path.join(root, 'artifacts', 'ipad-air3-kiosk-measurements.json');
const screenshotDir = process.env.IPAD_AIR3_SCREENSHOT_DIR || path.join(root, 'artifacts', 'ipad-air3-kiosk');
const capture = process.argv.includes('--screenshots');
const locales = ['ko', 'en', 'ja', 'zh', 'vi', 'es'];
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
if (capture) fs.mkdirSync(screenshotDir, { recursive: true });
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const userDataPath = process.env.ELECTRON_VERIFICATION_USER_DATA || path.join(app.getPath('temp'), `ipad-air3-${process.pid}`);
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);

const order = (set = null, quantity = 1, long = false) => ({
  kind:set?'set':'single',set,name:set?`${set}인 세트`:'수퍼 파파스',size:set===2?'R':set===4?'F':'L',promo:set?'set':'normal',
  price:set===3?33000:set===4?42000:28500,normalPrice:set===3?40900:set===4?49900:28500,discount:set?7900:0,discountLabel:set?'세트 할인':'',qty:quantity,
  mode:long?'half':'single',pizza:'P001',pizzaLeft:'P001',pizzaRight:long?'P002':null,pizzaName:'수퍼 파파스',crust:long?'치즈롤':'오리지널',dough:'오리지널',
  toppings:long?{T001:2,T002:2,T003:1}:{},sides:long?{S001:2,S002:2}:{},drinks:long?{D001:2,D002:2}:{},includedSides:set?{S007:set===4?2:1}:{},includedDrinks:set?{D004:1}:{}
});
const scenarios = [
  ['type',{step:'type',orderType:null}],
  ['party-2',{step:'party',orderType:'dinein',partySize:2}],
  ['party-max',{step:'party',orderType:'dinein',partySize:16}],
  ['area',{step:'area',orderType:'dinein',partySize:4,diningArea:null}],
  ['set-choice',{step:'setChoice',orderType:'takeout',orderTiming:'now',promo:'set'}],
  ['set-3-next',{step:'mode',orderType:'takeout',orderTiming:'now',promo:'set',set:3,size:'L',mode:'single',dough:'오리지널',crust:'오리지널'}],
  ['set-4-next',{step:'mode',orderType:'takeout',orderTiming:'now',promo:'set',set:4,size:'F',mode:'single',dough:'오리지널',crust:'오리지널'}],
  ['pizza-first',{step:'pizza',orderType:'takeout',orderTiming:'now',promo:'set',set:3,size:'L',mode:'half',left:null,cat:'ALL'}],
  ['topping-add',{step:'topping',orderType:'takeout',promo:'normal',size:'L',left:'P001',toppingChoice:null}],
  ['topping-selected',{step:'topping',orderType:'takeout',promo:'normal',size:'L',left:'P001',toppingChoice:'add',toppings:{T001:1}}],
  ['side-included',{step:'side',orderType:'takeout',promo:'set',set:3,size:'L',left:'P001',setSides:{S007:1}}],
  ['side-extra',{step:'side',orderType:'takeout',promo:'set',set:3,size:'L',left:'P001',setSides:{S007:1},setSideExtraMode:true,extraSides:{S001:1}}],
  ['drink-included',{step:'drink',orderType:'takeout',promo:'set',set:3,size:'L',left:'P001',setSides:{S007:1},setDrink:'D004'}],
  ['drink-extra',{step:'drink',orderType:'takeout',promo:'set',set:3,size:'L',left:'P001',setSides:{S007:1},setDrink:'D004',setDrinkExtraMode:true,extraDrinks:{D001:1}}],
  ['accompaniment',{step:'accompaniment',orderType:'takeout',promo:'normal',size:'L',left:'P001',extraDrinks:{D001:1}}],
  ['review-normal',{step:'review',orderType:'takeout',orderTiming:'now',cartItems:[order()]}],
  ['review-set-3',{step:'review',orderType:'takeout',orderTiming:'now',cartItems:[order(3),order(3),order(3)]}],
  ['review-set-4',{step:'review',orderType:'takeout',orderTiming:'now',cartItems:[order(4),order(4),order(4),order(4)]}],
  ['review-long',{step:'review',orderType:'takeout',orderTiming:'now',cartItems:Array.from({length:8},()=>order(4,2,true))}],
  ['review-reset-modal',{step:'review',orderType:'takeout',orderTiming:'now',cartItems:[order()],modal:'reviewResetConfirm'}]
];
const safariHeights = [1112, 1000, 980, 940];
const safariActionScenarios = scenarios.filter(([name]) => [
  'topping-add','topping-selected','side-included','side-extra',
  'drink-included','drink-extra','accompaniment'
].includes(name));
const wait = win => win.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.getAnimations().forEach(a=>a.finish())})()`, true);
const fixture = (locale, values) => `(()=>{PJ_I18N.setLanguage(${JSON.stringify(locale)});reset('idle',{skipRelease:true});Object.assign(state,${JSON.stringify(values)});render();window.scrollTo(0,0)})()`;
const measure = `(()=>{
 const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
 const rect=e=>{const r=e.getBoundingClientRect();return {left:+r.left.toFixed(2),top:+r.top.toFixed(2),right:+r.right.toFixed(2),bottom:+r.bottom.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)}};
 const text=[...document.querySelectorAll('h1,h2,h3,p,strong,span')].filter(e=>visible(e)&&!e.classList.contains('srOnly'));
 const clipsAxis=value=>/^(hidden|clip|auto|scroll)$/.test(value);
 const clipped=text.filter(e=>{const s=getComputedStyle(e);return (e.scrollWidth>e.clientWidth+1&&clipsAxis(s.overflowX))||(e.scrollHeight>e.clientHeight+1&&clipsAxis(s.overflowY))}).map(e=>({tag:e.tagName,className:e.className,text:e.textContent.trim().slice(0,80),client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]}));
 const groups=[...document.querySelectorAll('.grid,.areaGrid,.darkSetGrid,.reviewBottomActions,.modalBtns')].filter(visible),overlaps=[];
 for(const g of groups){const kids=[...g.children].filter(visible);for(let i=0;i<kids.length;i++)for(let j=i+1;j<kids.length;j++){const a=kids[i].getBoundingClientRect(),b=kids[j].getBoundingClientRect();if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([kids[i].className,kids[j].className])}}
 const action=document.querySelector('.selectionFooterCard,.partyNext,.optionContinue,.reviewBottomActions');
 const ar=action&&visible(action)?rect(action):null;
 const touch=[...document.querySelectorAll('button,[role="button"]')].filter(visible).map(e=>({text:e.textContent.trim().slice(0,40),css:{width:getComputedStyle(e).width,height:getComputedStyle(e).height,boxSizing:getComputedStyle(e).boxSizing},...rect(e)}));
 const verticalText=text.filter(e=>e.textContent.trim().length>3&&e.getBoundingClientRect().width<parseFloat(getComputedStyle(e).fontSize)*1.35).map(e=>e.textContent.trim().slice(0,40));
 const stage=document.querySelector('.stage'),head=document.querySelector('.head'),footer=document.querySelector('.selectionFooter,.reviewBottomActions,.cartbar'),actionArea=document.querySelector('.selectionFooter');
 const cartbar=document.querySelector('.cartbar'),selectionFooter=document.querySelector('.selectionFooter');
 const stackOverlap=cartbar&&selectionFooter&&visible(cartbar)&&visible(selectionFooter)?(()=>{const a=cartbar.getBoundingClientRect(),b=selectionFooter.getBoundingClientRect();return +(Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top))*Math.max(0,Math.min(a.right,b.right)-Math.max(a.left,b.left))).toFixed(2)})():0;
 const viewportViolations=[...document.querySelectorAll('.partyNext,.areaCard,.areaPolicyGuide,.occupancyNote,body[data-step="area"] .seatRuleNotice,body[data-step="type"] .card,.darkSetCard,.optionContinue,.selectionFooter,.reviewOrderCard:not([hidden]),.reviewBottomActions')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth+1||r.top<0||r.bottom>innerHeight+1}).map(e=>({className:e.className,...rect(e)}));
 return {viewport:{width:innerWidth,height:innerHeight},visualViewport:window.visualViewport?{width:+visualViewport.width.toFixed(2),height:+visualViewport.height.toFixed(2),offsetLeft:+visualViewport.offsetLeft.toFixed(2),offsetTop:+visualViewport.offsetTop.toFixed(2)}:null,layout:document.documentElement.dataset.layout,document:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight},stage:stage?{clientHeight:stage.clientHeight,scrollHeight:stage.scrollHeight,...rect(stage)}:null,header:head?rect(head):null,footer:footer&&visible(footer)?rect(footer):null,actionArea:actionArea&&visible(actionArea)?rect(actionArea):null,action:ar,centerError:ar?+Math.abs((ar.left+ar.right)/2-innerWidth/2).toFixed(2):null,actionAreaCenterError:ar&&actionArea?+Math.abs((ar.left+ar.right-actionArea.getBoundingClientRect().left-actionArea.getBoundingClientRect().right)/2).toFixed(2):null,stackOverlap,clipped,overlaps,verticalText,viewportViolations,touchFailures:touch.filter(x=>x.width<44||x.height<44),touch,portraitMediaMatch:matchMedia('(min-width:820px) and (max-width:850px) and (orientation:portrait)').matches,portraitRuleActive:[...document.styleSheets].some(s=>s.href&&s.href.includes('device-ipad-air3-portrait')&&!s.disabled)&&matchMedia('(min-width:820px) and (max-width:850px) and (orientation:portrait)').matches,scaleApplied:getComputedStyle(document.body).transform!=='none'||getComputedStyle(document.querySelector('.app')).transform!=='none'}
})()`;
async function shot(win,name,width,height){const png=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});const image=nativeImage.createFromBuffer(Buffer.from(png.data,'base64'));if(image.getSize().width!==width||image.getSize().height!==height)throw new Error(`${name}: screenshot size`);fs.writeFileSync(path.join(screenshotDir,`${name}.png`),image.toPNG())}

runElectronVerification({app},async lifecycle=>{
 lifecycle.expectReport(reportPath);
 const win=lifecycle.trackWindow(new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}));
 lifecycle.attachDebugger();
 const results=[];
 win.setContentSize(834,1112);await win.loadFile(path.join(root,'index.html'));
 let partyBaseline=null;
 for(const locale of locales){for(const [name,values] of scenarios){await win.webContents.executeJavaScript(fixture(locale,values),true);await wait(win);const metrics=await win.webContents.executeJavaScript(measure,true);results.push({viewport:'834x1112',locale,scenario:name,metrics});if(capture&&locale==='ko'&&['party-2','area','set-choice','set-4-next','pizza-first','topping-selected','review-normal','review-reset-modal'].includes(name))await shot(win,`ipad-air3-${name}-834x1112`,834,1112)}}
 await win.webContents.executeJavaScript(fixture('ko',scenarios.find(x=>x[0]==='party-2')[1]),true);await wait(win);
 await win.webContents.executeJavaScript(`document.querySelector('link[href*="device-ipad-air3-portrait.css"]').disabled=true`,true);await wait(win);
 const partyBefore=await win.webContents.executeJavaScript(`(()=>{const q=s=>{const r=document.querySelector(s).getBoundingClientRect();return {width:r.width,height:r.height}};return {button:q('.partyStepBtn'),count:q('.partyCountDisplay')}})()`,true);
 await win.webContents.executeJavaScript(`document.querySelector('link[href*="device-ipad-air3-portrait.css"]').disabled=false`,true);await wait(win);
 const partyAfter=await win.webContents.executeJavaScript(`(()=>{const q=s=>{const r=document.querySelector(s).getBoundingClientRect();return {width:r.width,height:r.height}};return {button:q('.partyStepBtn'),count:q('.partyCountDisplay')}})()`,true);
 partyBaseline={before:partyBefore,after:partyAfter};
 const resetBehavior=await win.webContents.executeJavaScript(`(async()=>{
  const originalRelease=releaseSeats,originalReset=reset;let releaseCount=0,resetCount=0,fail=false;
 releaseSeats=async()=>{releaseCount++;if(fail)throw new Error('fixture release failure')};
 reset=(...args)=>{resetCount++;return originalReset(...args)};
  const counts=()=>({releaseCount,resetCount}),delta=before=>({releaseCount:releaseCount-before.releaseCount,resetCount:resetCount-before.resetCount});
  const seed=(dine=true)=>{Object.assign(state,{step:'review',modal:'reviewResetConfirm',orderType:dine?'dinein':'takeout',selectedTables:dine?['papa-2']:[],cartItems:[${JSON.stringify(order())}],firebaseOrderId:null});render()};
  seed();let before=counts();cancelReviewReset();const cancel={...delta(before),preserved:state.step==='review'&&state.cartItems.length===1&&state.selectedTables.length===1};
  seed();before=counts();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));const escape={...delta(before),preserved:state.step==='review'&&state.cartItems.length===1&&state.selectedTables.length===1};
  seed();before=counts();await Promise.all([confirmReviewReset(),confirmReviewReset()]);const doubleClick={...delta(before),step:state.step};
  seed();fail=true;before=counts();const failureBefore=JSON.stringify({step:state.step,cartItems:state.cartItems,selectedTables:state.selectedTables});await confirmReviewReset();const failure={...delta(before),preserved:failureBefore===JSON.stringify({step:state.step,cartItems:state.cartItems,selectedTables:state.selectedTables}),modal:state.modal};
  fail=false;before=counts();await confirmReviewReset();const retry={...delta(before),step:state.step};
  seed(false);before=counts();await Promise.all([confirmReviewReset(),confirmReviewReset()]);const takeout={...delta(before),seatWriteCount:releaseCount-before.releaseCount,step:state.step};
  releaseSeats=originalRelease;reset=originalReset;return {cancel,escape,success:doubleClick,doubleClick,failure,retry,takeout}
 })()`,true);
 await win.webContents.executeJavaScript(fixture('ko',{step:'review',orderType:'takeout',orderTiming:'now',promo:'set',set:3,size:'L',mode:'single',left:'P001',crust:'치즈롤',toppings:{T001:1},cartItems:[order(3,2)]}),true);await wait(win);
 const reviewNavigation=await win.webContents.executeJavaScript(`(()=>{const before=JSON.stringify({cartItems:state.cartItems,set:state.set,left:state.left,crust:state.crust,toppings:state.toppings,total:reviewTotals().final});prevStep();const after=JSON.stringify({cartItems:state.cartItems,set:state.set,left:state.left,crust:state.crust,toppings:state.toppings,total:reviewTotals().final});state.step='review';render();return {preserved:before===after,previousStep:'promo',returned:state.step==='review',confirmTarget:document.querySelector('.reviewDockConfirm')?.getAttribute('onclick')}})()`,true);
 const safariResults=[];
 for(const height of safariHeights){
  win.setContentSize(834,height);await wait(win);
  for(const [name,values] of safariActionScenarios){await win.webContents.executeJavaScript(fixture('ko',values),true);await wait(win);const metrics=await win.webContents.executeJavaScript(measure,true);safariResults.push({viewport:`834x${height}`,locale:'ko',scenario:name,metrics});if(capture&&['topping-selected','side-included','drink-included','accompaniment'].includes(name))await shot(win,`ipad-air3-safari-${name}-834x${height}`,834,height)}
 }
 const dynamicResults=[];
 for(const height of [1112,980,940,1000]){win.setContentSize(834,height);await wait(win);await win.webContents.executeJavaScript(fixture('ko',scenarios.find(x=>x[0]==='topping-selected')[1]),true);await wait(win);dynamicResults.push({viewport:`834x${height}`,metrics:await win.webContents.executeJavaScript(measure,true)})}
 win.setContentSize(834,940);await wait(win);
 const clickCases=[];
 for(const [name,values,expected] of [
  ['topping-add',scenarios.find(x=>x[0]==='topping-add')[1],{step:'side',modal:null}],
  ['topping-selected',scenarios.find(x=>x[0]==='topping-selected')[1],{step:'side',modal:null}],
  ['side-included',scenarios.find(x=>x[0]==='side-included')[1],{step:'side',modal:'setSideUpsell'}],
  ['side-extra',scenarios.find(x=>x[0]==='side-extra')[1],{step:'drink',modal:null}],
  ['drink-included',scenarios.find(x=>x[0]==='drink-included')[1],{step:'drink',modal:'setDrinkUpsell'}],
  ['drink-extra',scenarios.find(x=>x[0]==='drink-extra')[1],{step:'accompaniment',modal:null}],
  ['accompaniment',scenarios.find(x=>x[0]==='accompaniment')[1],{step:'accompaniment',modal:'betterBenefit'}]
 ]){await win.webContents.executeJavaScript(fixture('ko',values),true);await wait(win);const actual=await win.webContents.executeJavaScript(`(()=>{let clicks=0;const button=document.querySelector('.selectionFooterCard');button.addEventListener('click',()=>clicks++,{once:true});button.click();return {clicks,step:state.step,modal:state.modal}})()`,true);clickCases.push({scenario:name,expected,actual})}
 win.setContentSize(1112,834);await win.loadFile(path.join(root,'index.html'));
 for(const [name,values] of [['landscape-review',scenarios.find(x=>x[0]==='review-normal')[1]],['landscape-pizza-options',{step:'pizzaOptions',orderType:'takeout',orderTiming:'now',promo:'normal',size:'L',dough:'오리지널',crust:'오리지널'}]]){await win.webContents.executeJavaScript(fixture('ko',values),true);await wait(win);const metrics=await win.webContents.executeJavaScript(measure,true);results.push({viewport:'1112x834',locale:'ko',scenario:name,metrics});if(capture)await shot(win,`ipad-air3-${name}-1112x834`,1112,834)}
 const report={viewports:['834x1112','834x1000','834x980','834x940','1112x834'],locales,partyBaseline,resetBehavior,reviewNavigation,safariResults,dynamicResults,clickCases,results};await lifecycle.writeReportAtomically(reportPath,report);
});
