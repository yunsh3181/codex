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

function exportFixtureSite(target){
 for(const directory of ['waiting-tv','assets/images','tests/fixtures'])fs.mkdirSync(path.join(target,directory),{recursive:true});
 for(const file of ['waiting-tv.css','waiting-tv.js'])fs.copyFileSync(path.join(root,'waiting-tv',file),path.join(target,'waiting-tv',file));
 for(const file of ['speech.js','assets/images/papajohns_red_logo.png','tests/fixtures/waiting-tv-browser-runtime.js'])fs.copyFileSync(path.join(root,file),path.join(target,file));
 let html=fs.readFileSync(path.join(root,'waiting-tv/index.html'),'utf8');
 html=html.replace(/\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs[^>]+><\/script>/g,'').replace(/\s*<script src="\.\.\/firebase-config\.js"><\/script>/,'\n  <script src="../tests/fixtures/waiting-tv-browser-runtime.js"></script>');
 fs.writeFileSync(path.join(target,'waiting-tv/index.html'),html);
}
const businessDay=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));const date=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day,12));if(+parts.hour<9)date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)};
const row=(status,index,now)=>({id:`${status}-${index}`,orderNumber:String(9000+index).slice(-4),displayStatus:status,businessDay:businessDay(),updatedAt:now+index});
const rows=(cookingCount,readyCount,now=Date.now())=>[
 ...Array.from({length:cookingCount},(_,index)=>row('cooking',index,now)),
 ...Array.from({length:readyCount},(_,index)=>row('ready',index+100,now+1000))
];
const measure=`(()=>{
 const header=document.querySelector('header'),button=document.querySelector('#enableVoice'),logo=document.querySelector('.takeout-display-logo');
 const rectOverlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 const list=id=>{const container=document.querySelector(id),cards=[...container.querySelectorAll('.order-number')],card=cards[0],number=card?.querySelector('strong'),label=card?.querySelector('span'),helper=card?.querySelector('small');const dimensions=value=>value?{clientWidth:value.clientWidth,scrollWidth:value.scrollWidth,clientHeight:value.clientHeight,scrollHeight:value.scrollHeight,overflowX:value.scrollWidth-value.clientWidth,overflowY:value.scrollHeight-value.clientHeight}:null;const cardMetrics=dimensions(card),elementMetrics={card:cardMetrics,strong:dimensions(number),span:dimensions(label),small:dimensions(helper)};const overflows=value=>value.scrollWidth-value.clientWidth>1||value.scrollHeight-value.clientHeight>1;return {count:cards.length,density:container.dataset.density,numberFontSize:number?getComputedStyle(number).fontSize:null,labelFontSize:label?getComputedStyle(label).fontSize:null,helperFontSize:helper?getComputedStyle(helper).fontSize:null,card:cardMetrics,elements:elementMetrics,container:{clientHeight:container.clientHeight,scrollHeight:container.scrollHeight},clipping:cards.some(value=>overflows(value)||[...value.children].some(overflows)),overlap:cards.some((value,index)=>cards.slice(index+1).some(other=>rectOverlap(value.getBoundingClientRect(),other.getBoundingClientRect()))),verticalKorean:cards.some(value=>[...value.querySelectorAll('span,small')].some(child=>child.getBoundingClientRect().height>parseFloat(getComputedStyle(child).lineHeight)*1.5))}};
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
  const result={viewports:{},transitions:{},consoleProblems};
  const captures=new Map([['ready-1','orders-1.png'],['ready-2','orders-2.png'],['ready-3','orders-3.png'],['ready-4','orders-4.png'],['ready-5','orders-5-plus.png'],['mixed-4-1','cooking-4-ready-1.png'],['mixed-1-4','cooking-1-ready-4.png'],['maximum-12-12','maximum-mixed-24.png']]);
  for(const [width,height] of [[1080,1920],[1920,1080],[1440,900],[1100,800]]){
   view.setBounds({x:0,y:0,width,height});await delay(100);const viewportKey=`${width}x${height}`,samples={};
   const scenarios=[...Array.from({length:5},(_,index)=>[`cooking-${index+1}`,index+1,0]),...Array.from({length:5},(_,index)=>[`ready-${index+1}`,0,index+1]),['mixed-1-3',1,3],['mixed-3-1',3,1],['mixed-4-1',4,1],['mixed-1-4',1,4],['mixed-4-4',4,4],['maximum-12-12',12,12]];
   for(const [name,cookingCount,readyCount] of scenarios){
    await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(cookingCount,readyCount))})`);await delay(60);samples[name]=await view.webContents.executeJavaScript(measure);
    if(width===1080&&height===1920&&captures.has(name)&&screenshotDir){const image=await view.webContents.capturePage();fs.writeFileSync(path.join(screenshotDir,captures.get(name)),nativeImage.createFromBuffer(image.toPNG()).toPNG())}
   }
   result.viewports[viewportKey]=samples;
  }
  view.setBounds({x:0,y:0,width:1080,height:1920});const now=Date.now();
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(1,0,now))})`);await delay(60);result.transitions.cooking1=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(2,0,now))})`);await delay(60);result.transitions.cooking2=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(3,0,now))})`);await delay(60);result.transitions.cooking3=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(4,0,now))})`);await delay(60);result.transitions.cooking4=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(rows(5,0,now))})`);await delay(60);result.transitions.cooking5=await view.webContents.executeJavaScript(measure);
  const moving=rows(4,0,now);moving[0].displayStatus='ready';moving[0].updatedAt=now+5000;await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(moving)})`);await delay(60);result.transitions.cookingToReady=await view.webContents.executeJavaScript(measure);
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(moving.slice(1))})`);await delay(60);result.transitions.pickupDeleted=await view.webContents.executeJavaScript(measure);
  await lifecycle.writeReportAtomically(reportPath,result);
 }finally{fs.rmSync(site,{recursive:true,force:true})}
}
runElectronVerification({app},main);
