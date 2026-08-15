const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const {runElectronVerification}=require('./electron-verification-lifecycle');

const root=path.resolve(__dirname,'..');
const reportPath=process.env.IPAD_AIR3_REVIEW_REPORT||path.join(root,'artifacts','ipad-air3-review-list-measurements.json');
const userDataPath=process.env.ELECTRON_VERIFICATION_USER_DATA||path.join(app.getPath('temp'),`ipad-air3-review-${process.pid}`);
fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.mkdirSync(userDataPath,{recursive:true});app.setPath('userData',userDataPath);
app.commandLine.appendSwitch('headless');app.commandLine.appendSwitch('hide-scrollbars');app.commandLine.appendSwitch('force-device-scale-factor','1');

const baseOrder=(overrides={})=>({kind:'single',set:null,name:'수퍼 파파스',size:'L',promo:'normal',price:28500,normalPrice:28500,discount:0,discountLabel:'',qty:1,mode:'single',pizza:'P001',pizzaLeft:'P001',pizzaRight:null,pizzaName:'수퍼 파파스',crust:'오리지널',dough:'오리지널',toppings:{},sides:{},drinks:{},includedSides:{},includedDrinks:{},...overrides});
const longOrder=()=>baseOrder({name:'아주 긴 상품명과 다양한 옵션을 포함한 수퍼 파파스 하프앤하프',mode:'half',pizzaRight:'P002',crust:'치즈롤',toppings:{T001:2,T002:2,T003:1},sides:{S001:2,S002:2},drinks:{D001:2,D002:2}});
const setOrder=()=>baseOrder({kind:'set',set:4,name:'4인 세트',size:'F',promo:'set',price:42000,normalPrice:49900,discount:7900,discountLabel:'세트 할인',includedSides:{S007:2},includedDrinks:{D004:1}});
const d8222Orders=[
 baseOrder({kind:'set',set:3,name:'3인 세트',promo:'set',price:37000,normalPrice:44900,discount:7900,discountLabel:'3인 세트',crust:'치즈롤',includedSides:{S007:1},includedDrinks:{D004:1}}),
 baseOrder({name:'존스 페이버릿',size:'F',promo:'upup',price:29500,normalPrice:39900,discount:10400,discountLabel:'UP & UP',pizza:'P002',pizzaLeft:'P002',pizzaName:'존스 페이버릿',crust:'치즈롤'})
];
const scenarios=[
 ['orders-1',[baseOrder()]],['orders-2',Array.from({length:2},()=>baseOrder())],['orders-3',Array.from({length:3},()=>baseOrder())],['orders-4',Array.from({length:4},()=>baseOrder())],
 ['orders-6',Array.from({length:6},()=>baseOrder())],['orders-10',Array.from({length:10},()=>baseOrder())],['long-options-4',Array.from({length:4},longOrder)],
 ['sets-4',Array.from({length:4},setOrder)],['mixed-upup-set',d8222Orders]
];
const heights=[1112,1000,980,940];
const locales=['ko','en','ja','zh','vi','es'];
const dockScenarios=[
 ['no-discount',[baseOrder()]],
 ['d8222',d8222Orders],
 ['multi-benefit',[
  baseOrder({promo:'set',price:37000,normalPrice:44900,discount:7900,discountLabel:'3인 세트'}),
  baseOrder({promo:'upup',price:29500,normalPrice:39900,discount:10400,discountLabel:'UP & UP'}),
  baseOrder({promo:'happy',price:24500,normalPrice:31500,discount:7000,discountLabel:'Happy Hour'}),
  baseOrder({promo:'takeout',price:26500,normalPrice:30500,discount:4000,discountLabel:'Takeout Special'})
 ]]
];
const wait=win=>win.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.getAnimations().forEach(a=>a.finish())})()`,true);
const resize=async(win,width,height)=>{for(let attempt=0;attempt<20;attempt++){win.setContentSize(width,height);await wait(win);const actual=await win.webContents.executeJavaScript(`({width:innerWidth,height:innerHeight})`,true);if(actual.width===width&&actual.height===height)return;await new Promise(resolve=>setTimeout(resolve,50))}throw new Error(`viewport resize did not settle at ${width}x${height}`)};
const fixture=(orders,locale='ko')=>`(()=>{PJ_I18N.setLanguage(${JSON.stringify(locale)});reset('idle',{skipRelease:true});Object.assign(state,{step:'review',orderType:'takeout',orderTiming:'now',cartItems:${JSON.stringify(orders)}});render()})()`;
const metrics=`(()=>{
 const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0};
 const rect=e=>{const r=e.getBoundingClientRect();return {left:+r.left.toFixed(2),top:+r.top.toFixed(2),right:+r.right.toFixed(2),bottom:+r.bottom.toFixed(2),width:+r.width.toFixed(2),height:+r.height.toFixed(2)}};
 const stage=document.querySelector('.stage'),list=document.querySelector('.reviewOrderList'),dock=document.querySelector('.reviewSummaryDock'),actions=document.querySelector('.reviewBottomActions'),confirm=document.querySelector('.reviewDockConfirm'),pager=document.querySelector('.reviewPager');
 const all=[...document.querySelectorAll('.reviewOrderCard')],shown=all.filter(visible),cards=shown.map(card=>{const financial=card.querySelector('.reviewOrderFinancials'),content=card.querySelector('.cartPizzaCategory,.cartCategory');return {index:Number(card.dataset.orderIndex),rect:rect(card),financial:financial?rect(financial):null,content:content?rect(content):null,text:card.textContent.trim()}});
 const text=[...document.querySelectorAll('.reviewOrderCard h2,.reviewOrderCard span,.reviewOrderCard strong')].filter(visible),verticalText=text.filter(e=>e.textContent.trim().length>3&&e.getBoundingClientRect().width<parseFloat(getComputedStyle(e).fontSize)*1.35).map(e=>e.textContent.trim().slice(0,50));
 const clipped=text.filter(e=>e.scrollWidth>e.clientWidth+1||e.scrollHeight>e.clientHeight+1).map(e=>({text:e.textContent.trim().slice(0,50),client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight]}));
 const cardOverlap=cards.some((card,index)=>index&&card.rect.top<cards[index-1].rect.bottom-1);
 const dockRect=dock?rect(dock):null,actionsRect=actions?rect(actions):null,confirmRect=confirm?rect(confirm):null,stageRect=rect(stage);
 return {viewport:{width:innerWidth,height:innerHeight},document:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight},stage:{clientHeight:stage.clientHeight,scrollHeight:stage.scrollHeight,scrollTop:stage.scrollTop,...stageRect},list:rect(list),dock:dockRect,actions:actionsRect,confirm:confirmRect,confirmCenterError:actionsRect?+Math.abs((actionsRect.left+actionsRect.right)/2-innerWidth/2).toFixed(2):null,allCount:all.length,visibleCount:shown.length,indexes:cards.map(x=>x.index),cards,pagerHidden:!pager||!visible(pager),reviewDensity:document.body.dataset.reviewDensity,cardOverlap,dockActionOverlap:dockRect&&actionsRect?Math.max(0,Math.min(dockRect.bottom,actionsRect.bottom)-Math.max(dockRect.top,actionsRect.top)):0,horizontalOverflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,clipped,verticalText}
})()`;
async function exercise(win,{wheel=true,touch=true}={}){
 const before=await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector('.stage'),r=e.getBoundingClientRect(),dock=document.querySelector('.reviewSummaryDock').getBoundingClientRect();e.scrollTop=0;return {clientHeight:e.clientHeight,scrollHeight:e.scrollHeight,maxScrollTop:Math.max(0,e.scrollHeight-e.clientHeight),rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom},usableBottom:dock.top}})()`,true);
 const x=Math.round((before.rect.left+before.rect.right)/2),y=Math.round(Math.min(before.rect.top+180,before.usableBottom-30));let wheelTop=0;
 await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:false});
 if(wheel){for(const point of [{x,y},{x:Math.round(before.rect.left+12),y:Math.round(before.rect.top+40)},{x:Math.round(before.rect.right-12),y:Math.round(before.rect.top+40)}]){win.webContents.sendInputEvent({type:'mouseMove',...point});win.webContents.sendInputEvent({type:'mouseWheel',...point,deltaX:0,deltaY:-420,wheelTicksX:0,wheelTicksY:-4,hasPreciseScrollingDeltas:true,canScroll:true});await new Promise(resolve=>setTimeout(resolve,140));await wait(win);wheelTop=await win.webContents.executeJavaScript(`document.querySelector('.stage').scrollTop`,true);if(wheelTop>0)break}}
 await win.webContents.executeJavaScript(`document.querySelector('.stage').scrollTop=0`,true);let touchTop=0;
 if(touch){await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:y+120,id:1,radiusX:2,radiusY:2,force:1}]});await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-140,id:1,radiusX:2,radiusY:2,force:1}]});await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(win);await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:false});touchTop=await win.webContents.executeJavaScript(`document.querySelector('.stage').scrollTop`,true)}
 const end=await win.webContents.executeJavaScript(`(()=>{const e=document.querySelector('.stage');e.scrollTop=e.scrollHeight;const last=[...document.querySelectorAll('.reviewOrderCard')].at(-1)?.getBoundingClientRect(),dock=document.querySelector('.reviewSummaryDock').getBoundingClientRect();return {scrollTop:e.scrollTop,maxScrollTop:Math.max(0,e.scrollHeight-e.clientHeight),lastBottom:last?+last.bottom.toFixed(2):null,visibleBottom:+dock.top.toFixed(2)}})()`,true);
 return {...before,wheelTop,touchTop,...end}
}

runElectronVerification({app},async lifecycle=>{
 lifecycle.expectReport(reportPath);
 const touchWin=lifecycle.trackWindow(new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}),'touch-review');lifecycle.attachDebugger('1.3',touchWin);
 const wheelWin=lifecycle.trackWindow(new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}}),'wheel-review');lifecycle.attachDebugger('1.3',wheelWin);
 touchWin.setContentSize(834,1112);wheelWin.setContentSize(834,1112);await touchWin.loadFile(path.join(root,'index.html'));await wheelWin.loadFile(path.join(root,'index.html'));
 const results=[];
 for(const height of heights){await resize(touchWin,834,height);await resize(wheelWin,834,height);for(const [scenario,orders] of scenarios){await touchWin.webContents.executeJavaScript(fixture(orders),true);await wheelWin.webContents.executeJavaScript(fixture(orders),true);await wait(touchWin);await wait(wheelWin);const touchScroll=await exercise(touchWin,{wheel:false}),wheelScroll=await exercise(wheelWin,{touch:false});results.push({viewport:`834x${height}`,scenario,scroll:{...touchScroll,wheelTop:wheelScroll.wheelTop},metrics:await touchWin.webContents.executeJavaScript(metrics,true)})}}
 await resize(touchWin,834,1112);const dockMatrix=[];for(const locale of locales){for(const [scenario,orders] of dockScenarios){await touchWin.webContents.executeJavaScript(fixture(orders,locale),true);await wait(touchWin);dockMatrix.push({locale,scenario,metrics:await touchWin.webContents.executeJavaScript(metrics,true),reservedHeight:await touchWin.webContents.executeJavaScript(`getComputedStyle(document.body).getPropertyValue('--ipad-review-summary-dock-height')`,true)})}}
 await resize(touchWin,834,1112);await touchWin.webContents.executeJavaScript(fixture(scenarios.find(x=>x[0]==='orders-10')[1]),true);await wait(touchWin);await touchWin.webContents.executeJavaScript(`document.querySelector('.stage').scrollTop=240`,true);const dynamic=[];for(const height of [1112,980,940,1000]){await resize(touchWin,834,height);dynamic.push({height,scrollTop:await touchWin.webContents.executeJavaScript(`document.querySelector('.stage').scrollTop`,true),metrics:await touchWin.webContents.executeJavaScript(metrics,true)})}
 await touchWin.webContents.executeJavaScript(fixture(scenarios.find(x=>x[0]==='orders-6')[1]),true);await wait(touchWin);const confirmNavigation=await touchWin.webContents.executeJavaScript(`(()=>{const stage=document.querySelector('.stage');stage.scrollTop=stage.scrollHeight;let clicks=0;const button=document.querySelector('.reviewDockConfirm');button.addEventListener('click',()=>clicks++,{once:true});button.click();return {clicks,step:state.step}})()`,true);
 await touchWin.webContents.executeJavaScript(fixture(d8222Orders),true);await wait(touchWin);const d8222=await touchWin.webContents.executeJavaScript(`(()=>{const before=JSON.stringify({cartItems:state.cartItems,totals:reviewTotals(),set:state.cartItems[0].set,crust:state.cartItems[0].crust});prevStep();const previous=state.step;state.step='review';render();const restored=before===JSON.stringify({cartItems:state.cartItems,totals:reviewTotals(),set:state.cartItems[0].set,crust:state.cartItems[0].crust});return {totals:reviewTotals(),previous,restored,count:document.querySelectorAll('.reviewOrderCard').length,density:document.body.dataset.reviewDensity,setPayment:state.cartItems[0].price,paidCrustDelta:state.cartItems[0].price-33000,labels:document.querySelector('.reviewOrderList').textContent}})()`,true);
 await touchWin.webContents.executeJavaScript(fixture(dockScenarios.find(x=>x[0]==='multi-benefit')[1]),true);await wait(touchWin);const beforeMutation=await touchWin.webContents.executeJavaScript(metrics,true),before=await touchWin.webContents.executeJavaScript(`reviewTotals().final`,true);await touchWin.webContents.executeJavaScript(`changeCartQty(0,1)`,true);await wait(touchWin);const afterQtyMetrics=await touchWin.webContents.executeJavaScript(metrics,true),afterQty=await touchWin.webContents.executeJavaScript(`reviewTotals().final`,true),qty=await touchWin.webContents.executeJavaScript(`state.cartItems[0].qty`,true),countAfterQty=afterQtyMetrics.allCount;await touchWin.webContents.executeJavaScript(`removeCartItem(1)`,true);await wait(touchWin);const afterDeleteMetrics=await touchWin.webContents.executeJavaScript(metrics,true);const mutation={before,afterQty,qty,countAfterQty,countAfterDelete:afterDeleteMetrics.allCount,stateCount:await touchWin.webContents.executeJavaScript(`state.cartItems.length`,true),indexes:afterDeleteMetrics.indexes,finalAfterDelete:await touchWin.webContents.executeJavaScript(`reviewTotals().final`,true),gaps:[beforeMutation.dock.top-beforeMutation.stage.bottom,afterQtyMetrics.dock.top-afterQtyMetrics.stage.bottom,afterDeleteMetrics.dock.top-afterDeleteMetrics.stage.bottom],dockHeights:[beforeMutation.dock.height,afterQtyMetrics.dock.height,afterDeleteMetrics.dock.height]};
 await lifecycle.writeReportAtomically(reportPath,{heights,scenarios:scenarios.map(([name,orders])=>({name,count:orders.length})),dockScenarios:dockScenarios.map(([name,orders])=>({name,count:orders.length})),locales,results,dockMatrix,dynamic,confirmNavigation,d8222,mutation});
});
