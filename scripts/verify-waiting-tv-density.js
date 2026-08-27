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
const customerNames={en:['ALEXANDER','MARY JANE','JANE WATSON'],ja:['さくら','山田 はなこ','田中 あきら'],zh:['王小明','李 小龙','欧阳娜娜'],vi:['MINH ANH','NGUYỄN MINH','THỊ BÍCH'],es:['MARÍA JOSÉ','JOSÉ LUIS','ANA MARÍA']};
const maximumCustomerNames={en:'MARY JANE',ja:'アレクサンダー田中',zh:'欧阳娜娜测试顾客甲',vi:'NGUYỄN MIN',es:'ALEJANDRA'};
const fixtureNameLengths=[1,6,7,8,9,10];
const graphemes=value=>typeof Intl!=='undefined'&&Intl.Segmenter?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),part=>part.segment):Array.from(value);
const fixtureName=(language,length)=>{const parts=graphemes(maximumCustomerNames[language]).slice(0,length);while(parts.at(-1)===' ')parts.pop();while(parts.length<length)parts.push('I');return parts.join('')};

function exportFixtureSite(target){
 for(const directory of ['waiting-tv','assets/images','tests/fixtures'])fs.mkdirSync(path.join(target,directory),{recursive:true});
 for(const file of ['waiting-tv.css','waiting-tv-locales.css','waiting-tv-locales.js','waiting-tv.js'])fs.copyFileSync(path.join(root,'waiting-tv',file),path.join(target,'waiting-tv',file));
 for(const file of ['speech.js','assets/images/papajohns_red_logo.png','tests/fixtures/waiting-tv-browser-runtime.js'])fs.copyFileSync(path.join(root,file),path.join(target,file));
 let html=fs.readFileSync(path.join(root,'waiting-tv/index.html'),'utf8');
 html=html.replace(/\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs[^>]+><\/script>/g,'').replace(/\s*<script src="\.\.\/firebase-config\.js"><\/script>/,'\n  <script src="../tests/fixtures/waiting-tv-browser-runtime.js"></script>');
 fs.writeFileSync(path.join(target,'waiting-tv/index.html'),html);
}
const businessDay=()=>{const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));const date=new Date(Date.UTC(+parts.year,+parts.month-1,+parts.day,12));if(+parts.hour<9)date.setUTCDate(date.getUTCDate()-1);return date.toISOString().slice(0,10)};
const row=(status,index,now,language='ko')=>({id:`${language}-${status}-${index}`,orderNumber:String(9000+index).slice(-4),displayStatus:status,businessDay:businessDay(),updatedAt:now+index,language,...(language==='ko'?{customerIdentityType:'phone_last4'}:{customerIdentityType:'name',customerDisplayName:customerNames[language][index%customerNames[language].length]})});
const rows=(cookingCount,readyCount,now=Date.now(),language='ko')=>[
 ...Array.from({length:cookingCount},(_,index)=>row('cooking',index,now,language)),
 ...Array.from({length:readyCount},(_,index)=>row('ready',index+100,now+1000,language))
];
const measure=`(()=>{
 const header=document.querySelector('header'),button=document.querySelector('#enableVoice'),logo=document.querySelector('.takeout-display-logo');
 const rectOverlap=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
 const list=id=>{const container=document.querySelector(id),cards=[...container.querySelectorAll('.order-number')],card=cards[0],identities=cards.map(value=>value.querySelector('strong')),guidances=cards.map(value=>value.querySelector('.order-guidance')),statuses=cards.map(value=>value.querySelector('.order-status')),timings=cards.map(value=>value.querySelector('.order-timing')),number=identities[0],guidance=guidances[0],status=statuses[0],helper=card?.querySelector('small');const dimensions=value=>value?{clientWidth:value.clientWidth,scrollWidth:value.scrollWidth,clientHeight:value.clientHeight,scrollHeight:value.scrollHeight,overflowX:value.scrollWidth-value.clientWidth,overflowY:value.scrollHeight-value.clientHeight}:null;const rect=value=>{if(!value)return null;const bounds=value.getBoundingClientRect();return {left:bounds.left,top:bounds.top,right:bounds.right,bottom:bounds.bottom,width:bounds.width,height:bounds.height}};const textRect=value=>{if(!value?.firstChild)return null;const range=document.createRange();range.selectNodeContents(value);const bounds=range.getBoundingClientRect();return {left:bounds.left,top:bounds.top,right:bounds.right,bottom:bounds.bottom,width:bounds.width,height:bounds.height}};const typographyMetric=(value,index,selector)=>{const cardValue=cards[index],cardRect=rect(cardValue);if(!value)return {missing:true,selector,cardIndex:index,orderKey:cardValue?.dataset.orderKey||null,cardRect,sameNode:guidances[index]===statuses[index]};const style=getComputedStyle(value),metrics=dimensions(value),fontSize=parseFloat(style.fontSize),lineHeight=parseFloat(style.lineHeight),containerRect=rect(value),contentRect=textRect(value),textSafety=contentRect?{top:contentRect.top-containerRect.top,bottom:containerRect.bottom-contentRect.bottom,left:contentRect.left-containerRect.left,right:containerRect.right-contentRect.right}:null,cardSafety=cardRect?{top:containerRect.top-cardRect.top,bottom:cardRect.bottom-containerRect.bottom,left:containerRect.left-cardRect.left,right:cardRect.right-containerRect.right}:null;return {...metrics,fontFamily:style.fontFamily,fontSize,fontWeight:style.fontWeight,lineHeight,minHeight:style.minHeight,maxHeight:style.maxHeight,padding:style.padding,margin:style.margin,display:style.display,alignItems:style.alignItems,overflow:style.overflow,whiteSpace:style.whiteSpace,wordBreak:style.wordBreak,overflowWrap:style.overflowWrap,writingMode:style.writingMode,verticalSafety:metrics.clientHeight-metrics.scrollHeight,lineBoxSafety:lineHeight-fontSize,selector,text:value.textContent,identityType:cardValue?.lang==='ko'?'phone_last4':'name',cardIndex:index,orderKey:cardValue?.dataset.orderKey||null,densityClass:container.dataset.density,containerRect,contentRect,textSafety,cardRect,cardSafety,sameNode:guidances[index]===statuses[index]}};const cardMetrics=dimensions(card),elementMetrics={card:cardMetrics,strong:dimensions(number),guidance:dimensions(guidance),status:dimensions(status),small:dimensions(helper)};const overflows=value=>value.scrollWidth-value.clientWidth>1||value.scrollHeight-value.clientHeight>1;const textChildren=cards.flatMap(value=>[...value.querySelectorAll('strong,span,small')]),lineCount=value=>Math.max(1,Math.round(value.getBoundingClientRect().height/parseFloat(getComputedStyle(value).lineHeight)));return {count:cards.length,density:container.dataset.density,numberFontSize:number?getComputedStyle(number).fontSize:null,guidanceFontSize:guidance?getComputedStyle(guidance).fontSize:null,statusFontSize:status?getComputedStyle(status).fontSize:null,helperFontSize:helper?getComputedStyle(helper).fontSize:null,card:cardMetrics,elements:elementMetrics,identityMetrics:identities.map((value,index)=>typographyMetric(value,index,'strong')),guidanceMetrics:guidances.map((value,index)=>typographyMetric(value,index,'.order-guidance')),statusMetrics:statuses.map((value,index)=>typographyMetric(value,index,'.order-status')),timingMetrics:timings.flatMap((value,index)=>value?[typographyMetric(value,index,'.order-timing')]:[]),selectorIntegrity:{identityCount:identities.filter(Boolean).length,guidanceCount:guidances.filter(Boolean).length,statusCount:statuses.filter(Boolean).length,exact:cards.every(value=>value.querySelectorAll('strong').length===1&&value.querySelectorAll('.order-guidance').length===1&&value.querySelectorAll('.order-status').length===1),distinct:cards.every((value,index)=>guidances[index]&&statuses[index]&&guidances[index]!==statuses[index])},container:{clientHeight:container.clientHeight,scrollHeight:container.scrollHeight},clipping:cards.some(value=>overflows(value)||[...value.children].some(overflows)),overlap:cards.some((value,index)=>cards.slice(index+1).some(other=>rectOverlap(value.getBoundingClientRect(),other.getBoundingClientRect()))),internalOverlap:cards.some(value=>[...value.children].some((child,index,children)=>index>0&&child.getBoundingClientRect().top<children[index-1].getBoundingClientRect().bottom)),verticalKorean:textChildren.some(value=>value.textContent.trim().length>1&&value.getBoundingClientRect().width<parseFloat(getComputedStyle(value).fontSize)*1.5&&lineCount(value)>2),maxTextLines:textChildren.reduce((maximum,value)=>Math.max(maximum,lineCount(value)),0),languages:cards.map(value=>value.dataset.language),texts:cards.map(value=>value.textContent)}};
 const all=[...document.querySelectorAll('.order-number')],hr=header.getBoundingClientRect();
 return {cooking:list('#cookingOrders'),ready:list('#readyOrders'),horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth),documentVerticalOverflow:Math.max(0,document.documentElement.scrollHeight-document.documentElement.clientHeight),headerOverlap:all.some(card=>card.getBoundingClientRect().top<hr.bottom),buttonOverlap:all.some(card=>rectOverlap(card.getBoundingClientRect(),button.getBoundingClientRect())),logoOverlap:all.some(card=>rectOverlap(card.getBoundingClientRect(),logo.getBoundingClientRect()))};
})()`;
const enrichTypographySample=(sample,cardClasses)=>{for(const column of ['cooking','ready']){const list=sample[column],classes=cardClasses[column];for(const metrics of [list.identityMetrics,list.statusMetrics,list.guidanceMetrics,list.timingMetrics])for(const metric of metrics){metric.orderCount=list.count;metric.clipping=metric.scrollWidth>metric.clientWidth||metric.scrollHeight>metric.clientHeight;if(metric.textSafety)metric.textSafety.totalVertical=metric.textSafety.top+metric.textSafety.bottom}for(const metric of list.identityMetrics){metric.identityLength=graphemes(metric.text).length;metric.lengthClass=classes[metric.cardIndex]?.split(/\s+/).find(value=>value.startsWith('name-length-'))||''}}return sample};
const cardClassMeasure=`({cooking:[...document.querySelectorAll('#cookingOrders .order-number')].map(value=>value.className),ready:[...document.querySelectorAll('#readyOrders .order-number')].map(value=>value.className)})`;

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
   const scenarios=[...Array.from({length:5},(_,index)=>[`cooking-${index+1}`,index+1,0,false,null]),...Array.from({length:5},(_,index)=>[`ready-${index+1}`,0,index+1,false,null]),['mixed-1-3',1,3,false,null],['mixed-3-1',3,1,false,null],['mixed-4-1',4,1,false,null],['mixed-1-4',1,4,false,null],['mixed-4-4',4,4,false,null],['maximum-12-12',12,12,false,null],['reservation-1-1',1,1,true,null],...fixtureNameLengths.map(length=>[`name-length-${length}`,1,0,false,length])];
   for(const language of languages){const samples={};for(const [name,cookingCount,readyCount,reservation,nameLength] of scenarios){
    const scenarioRows=rows(cookingCount,readyCount,Date.now(),language).map(item=>({...item,...(nameLength&&language!=='ko'?{customerDisplayName:fixtureName(language,nameLength)}:{}),...(reservation?{...(language==='ko'?{}:{customerDisplayName:maximumCustomerNames[language]}),reservationOrder:true,pickupAt:Date.now()+30*60*1000,preparationMinutes:15,preparationStartedAt:Date.now()-1000,readyDueAt:Date.now()+8*60*1000}:{})}));await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(scenarioRows)})`);await delay(35);const measured=await view.webContents.executeJavaScript(measure),classes=await view.webContents.executeJavaScript(cardClassMeasure);samples[name]=enrichTypographySample(measured,classes);
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
  const longNameRows=[{...row('cooking',500,now,'en'),customerDisplayName:maximumCustomerNames.en}];
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(longNameRows)})`);await delay(60);result.transitions.longNameFirst=enrichTypographySample(await view.webContents.executeJavaScript(measure),await view.webContents.executeJavaScript(cardClassMeasure)).cooking.identityMetrics[0];
  await view.webContents.executeJavaScript(`__tvFixture.emitPublic(${JSON.stringify(longNameRows)})`);await delay(60);result.transitions.longNameRepeat=enrichTypographySample(await view.webContents.executeJavaScript(measure),await view.webContents.executeJavaScript(cardClassMeasure)).cooking.identityMetrics[0];
  await lifecycle.writeReportAtomically(reportPath,result);
 }finally{fs.rmSync(site,{recursive:true,force:true})}
}
runElectronVerification({app},main);
