const {app,BrowserView,BrowserWindow,nativeImage}=require('electron');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {runElectronVerification}=require('./electron-verification-lifecycle');

const root=path.resolve(__dirname,'..');
const reportPath=process.env.WAITING_TV_DENSITY_REPORT;
const screenshotDir=process.env.WAITING_TV_DENSITY_SCREENSHOTS;
const userDataPath=process.env.WAITING_TV_DENSITY_USER_DATA;
if(!reportPath||!userDataPath)throw new Error('WAITING_TV_DENSITY_REPORT and WAITING_TV_DENSITY_USER_DATA are required');
fs.mkdirSync(userDataPath,{recursive:true});
if(screenshotDir)fs.mkdirSync(screenshotDir,{recursive:true});
app.setPath('userData',userDataPath);
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('force-device-scale-factor','1');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const languages=['ko','en','ja','zh','vi','es'];
const customerNames={en:'ALEXANDER',ja:'さくら',zh:'王小明',vi:'NGUYỄN THỊ MINH',es:'MARÍA ALEJANDRA'};

function exportFixtureSite(target){
 for(const directory of ['waiting-tv','assets/images','tests/fixtures'])fs.mkdirSync(path.join(target,directory),{recursive:true});
 for(const file of ['waiting-tv.css','waiting-tv-locales.css','waiting-tv-locales.js','waiting-tv.js'])fs.copyFileSync(path.join(root,'waiting-tv',file),path.join(target,'waiting-tv',file));
 for(const file of ['speech.js','assets/images/papajohns_red_logo.png','tests/fixtures/waiting-tv-browser-runtime.js'])fs.copyFileSync(path.join(root,file),path.join(target,file));
 let html=fs.readFileSync(path.join(root,'waiting-tv/index.html'),'utf8');
 html=html.replace(/\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs[^>]+><\/script>/g,'').replace(/\s*<script src="\.\.\/firebase-config\.js"><\/script>/,'\n  <script src="../tests/fixtures/waiting-tv-browser-runtime.js"></script>');
 fs.writeFileSync(path.join(target,'waiting-tv/index.html'),html);
}
const businessDay=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));const date=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day,12));if(+parts.hour<9)date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)};
const row=(status,index,now,language='ko')=>({id:`${language}-${status}-${index}`,orderNumber:String(9000+index).slice(-4),displayStatus:status,businessDay:businessDay(),updatedAt:now+index,language,...(language==='ko'?{customerIdentityType:'phone_last4'}:{customerIdentityType:'name',customerDisplayName:customerNames[language]})});
const rows=(cookingCount,readyCount,now=Date.now(),language='ko')=>[
 ...Array.from({length:cookingCount},(_,index)=>row('cooking',index,now,language)),
 ...Array.from({length:readyCount},(_,index)=>row('ready',index+100,now+1000,language))
];
const measure=`(()=>{
 const header=document.querySelector('header'),button=document.querySelector('#enableVoice'),logo=document.querySelector('.takeout-display-logo');
 const rectOverlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 const list=id=>{const container=document.querySelector(id),cards=[...container.querySelectorAll('.order-number')],card=cards[0],number=card?.querySelector('strong'),guidances=cards.map(value=>value.querySelector('.order-guidance')),statuses=cards.map(value=>value.querySelector('.order-status')),guidance=guidances[0],status=statuses[0],helper=card?.querySelector('small');const dimensions=value=>value?{clientWidth:value.clientWidth,scrollWidth:value.scrollWidth,clientHeight:value.clientHeight,scrollHeight:value.scrollHeight,overflowX:value.scrollWidth-value.clientWidth,overflowY:value.scrollHeight-value.clientHeight}:null;const rect=value=>{if(!value)return null;const bounds=value.getBoundingClientRect();return {left:bounds.left,top:bounds.top,right:bounds.right,bottom:bounds.bottom,width:bounds.width,height:bounds.height}};const typographyMetric=(value,index,selector)=>{if(!value)return {missing:true,selector,cardIndex:index,orderKey:cards[index]?.dataset.orderKey||null,cardRect:rect(cards[index]),sameNode:guidances[index]===statuses[index]};const style=getComputedStyle(value),metrics=dimensions(value),fontSize=parseFloat(style.fontSize),lineHeight=parseFloat(style.lineHeight);return {...metrics,fontSize,lineHeight,minHeight:style.minHeight,verticalSafety:metrics.clientHeight-metrics.scrollHeight,lineBoxSafety:lineHeight-fontSize,selector,text:value.textContent,cardIndex:index,orderKey:cards[index]?.dataset.orderKey||null,cardRect:rect(cards[index]),sameNode:guidances[index]===statuses[index]}};const cardMetrics=dimensions(card),elementMetrics={card:cardMetrics,strong:dimensions(number),guidance:dimensions(guidance),status:dimensions(status),small:dimensions(helper)};const overflows=value=>value.scrollWidth-value.clientWidth>1||value.scrollHeight-value.clientHeight>1;const textChildren=cards.flatMap(value=>[...value.querySelectorAll('span,small')]),lineCount=value=>Math.max(1,Math.round(value.getBoundingClientRect().height/parseFloat(getComputedStyle(value).lineHeight)));return {count:cards.length,density:container.dataset.density,numberFontSize:number?getComputedStyle(number).fontSize:null,guidanceFontSize:guidance?getComputedStyle(guidance).fontSize:null,statusFontSize:status?getComputedStyle(status).fontSize:null,helperFontSize:helper?getComputedStyle(helper).fontSize:null,card:cardMetrics,elements:elementMetrics,guidanceMetrics:guidances.map((value,index)=>typographyMetric(value,index,'.order-guidance')),statusMetrics:statuses.map((value,index)=>typographyMetric(value,index,'.order-status')),selectorIntegrity:{guidanceCount:guidances.filter(Boolean).length,statusCount:statuses.filter(Boolean).length,exact:cards.every(value=>value.querySelectorAll('.order-guidance').length===1&&value.querySelectorAll('.order-status').length===1),distinct:cards.every((value,index)=>guidances[index]&&statuses[index]&&guidances[index]!==statuses[index])},container:{clientHeight:container.clientHeight,scrollHeight:container.scrollHeight},clipping:cards.some(value=>overflows(value)||[...value.children].some(overflows)),overlap:cards.some((value,index)=>cards.slice(index+1).some(other=>rectOverlap(value.getBoundingClientRect(),other.getBoundingClientRect()))),internalOverlap:cards.some(value=>[...value.children].some((child,index,children)=>index>0&&child.getBoundingClientRect().top<children[index-1].getBoundingClientRect().bottom)),verticalKorean:textChildren.some(value=>value.textContent.trim().length>1&&value.getBoundingClientRect().width<parseFloat(getComputedStyle(value).fontSize)*1.5&&lineCount(value)>2),maxTextLines:textChildren.reduce((maximum,value)=>Math.max(maximum,lineCount(value)),0),languages:cards.map(value=>value.dataset.language),texts:cards.map(value=>value.textContent)}};
 const all=[...document.querySelectorAll('.order-number')],hr=header.getBoundingClientRect();
 return {cooking:list('#cookingOrders'),ready:list('#readyOrders'),horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),documentVerticalOverflow:Math.max(0,document.documentElement.scrollHeight-document.documentElement.clientHeight),headerOverlap:all.some(card=>card.getBoundingClientRect().top<hr.bottom),buttonOverlap:all.some(card=>rectOverlap(card.getBoundingClientRect(),button.getBoundingClientRect())),logoOverlap:all.some(card=>rectOverlap(card.getBoundingClientRect(),logo.getBoundingClientRect()))};
})()`;

async function main(lifecycle){
 lifecycle.expectReport(reportPath);
 const site=fs.mkdtempSync(path.join(os.tmpdir(),'waiting-tv-density-'));
 exportFixtureSite(site);
 const host=lifecycle.trackWindow(new BrowserWindow({show:true,opacity:0,width:800,height:600,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}}),'waiting-tv-density-host');
 const view=new BrowserView({webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 host.setBrowserView(view);lifecycle.trackWebContents(view.webContents,'waiting-tv-density-view');
 const consoleProblems=[];view.webContents.on('console-message',event=>{if(event.level>=2)consoleProblems.push(event.message)});
 try{
  await view.webContents.loadFile(path.join(site,'waiting-tv/index.html'));await delay(250);
  const result={viewports:{},locales:{},transitions:{},semantics:{},consoleProblems};
  const captures=new Map([['ready-1','orders-1.png'],['ready-2','orders-2.png'],['ready-3','orders-3.png'],['ready-4','orders-4.png'],['ready-5','orders-5-plus.png'],['mixed-4-1','cooking-4-ready-1.png'],['mixed-1-4','cooking-1-ready-4.png'],['maximum-12-12','maximum-mixed-24.png']]);
  for(const [width,height] of [[1080,1920],[1920,1080],[1440,900],[1100,800]]){
   view.setBounds({x:0,y:0,width,height});await delay(100);const viewportKey=`${width}x${height}`;result.locales[viewportKey]={};
   const scenarios=[...Array.from({length:5},(_,index)=>[`cooking-${index+1}`,index+1,0]),...Array.from({length:5},(_,index)=>[`ready-${index+1}`,0,index+1]),['mixed-1-3',1,3],['mixed-3-1',3,1],['mixed-4-1',4,1],['mixed-1-4',1,4],['mixed-4-4',4,4],['maximum-12-12',12,12]];
   for(const language of languages){const samples={};for(const [name,cookingCount,readyCount] of scenarios){
    await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(cookingCount,readyCount,Date.now(),language))})`);await delay(35);samples[name]=await view.webContents.executeJavaScript(measure);
    if(language==='ko'&&width===1080&&height===1920&&captures.has(name)&&screenshotDir){const image=await view.webContents.capturePage();fs.writeFileSync(path.join(screenshotDir,captures.get(name)),nativeImage.createFromBuffer(image.toPNG()).toPNG())}
   }result.locales[viewportKey][language]=samples}
   result.viewports[viewportKey]=result.locales[viewportKey].ko;
  }
  view.setBounds({x:0,y:0,width:1080,height:1920});const now=Date.now();
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(1,0,now))})`);await delay(60);result.transitions.cooking1=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(2,0,now))})`);await delay(60);result.transitions.cooking2=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(3,0,now))})`);await delay(60);result.transitions.cooking3=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(4,0,now))})`);await delay(60);result.transitions.cooking4=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(5,0,now))})`);await delay(60);result.transitions.cooking5=await view.webContents.executeJavaScript(measure);
  const moving=rows(4,0,now);moving[0].displayStatus='ready';moving[0].updatedAt=now+5000;await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(moving)})`);await delay(60);result.transitions.cookingToReady=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(moving.slice(1))})`);await delay(60);result.transitions.pickupDeleted=await view.webContents.executeJavaScript(measure);
  const pickup=now+30*60*1000,mixed=languages.map((language,index)=>({...row(index%2?'ready':'cooking',index+300,now,language),reservationOrder:index>=4,pickupAt:pickup,autoReadyEnabled:index<4&&index%2===0,preparationMinutes:15,preparationStartedAt:now-1000,readyDueAt:now+8*60*1000+20000}));
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(mixed)})`);await delay(100);result.semantics.mixed=await view.webContents.executeJavaScript(measure);
  const invalidLanguages=[undefined,null,'','fr'];const invalid=invalidLanguages.map((language,index)=>({...row(index%2?'ready':'cooking',index+400,now,'ko'),id:`invalid-${index}`,language}));
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(invalid)})`);await delay(100);result.semantics.fallback=await view.webContents.executeJavaScript(measure);
  await lifecycle.writeReportAtomically(reportPath,result);
 }finally{fs.rmSync(site,{recursive:true,force:true})}
}
runElectronVerification({app},main);
