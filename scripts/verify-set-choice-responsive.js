const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = process.env.SET_CHOICE_REPORT || path.join(root, 'artifacts', 'set-choice-responsive-card-layout', 'geometry.json');
const shots = path.dirname(output);
const locales = ['ko','en','ja','zh','vi','es'];
const viewports = [[834,1112],[834,1000],[834,980],[834,940],[1080,1920],[1920,1080],[1440,900],[1100,800]];
fs.mkdirSync(shots,{recursive:true});
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor','1');
app.setPath('userData',path.join(app.getPath('temp'),`set-choice-${process.pid}`));
const wait=win=>win.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));document.getAnimations().forEach(a=>a.finish())})()`);
const rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {client:[e.clientWidth,e.clientHeight],scroll:[e.scrollWidth,e.scrollHeight],rect:[r.left,r.top,r.right,r.bottom].map(n=>+n.toFixed(2)),display:s.display,grid:s.gridTemplateColumns,fontSize:s.fontSize,lineHeight:s.lineHeight,whiteSpace:s.whiteSpace,wordBreak:s.wordBreak,overflow:[s.overflowX,s.overflowY]}};

app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,frame:false,useContentSize:true,webPreferences:{contextIsolation:true,offscreen:true,sandbox:true}});
 win.webContents.debugger.attach('1.3');
 const rows=[];
 for(const [width,height] of viewports){
  win.setContentSize(width,height); await win.loadFile(path.join(root,'index.html')); await wait(win);
  for(const locale of locales){
   await win.webContents.executeJavaScript(`PJ_I18N.setLanguage(${JSON.stringify(locale)});reset('idle',{skipRelease:true});Object.assign(state,{step:'setChoice',orderType:'takeout',orderTiming:'now',promo:'set'});render()`); await wait(win);
   const metrics=await win.webContents.executeJavaScript(`(()=>{try{const r=${rect.toString()},q=s=>document.querySelector(s),qa=s=>[...document.querySelectorAll(s)],cards=qa('.darkSetCard'),footer=q('.cartbar'),note=q('.darkSetNote'),stage=q('.stage');return {layout:document.documentElement.dataset.layout,document:{clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,clientHeight:document.documentElement.clientHeight,scrollHeight:document.documentElement.scrollHeight},stage:r(stage),title:r(q('.darkSetTitle')),subtitle:r(q('.darkSetSub')),grid:r(q('.darkSetGrid')),cards:cards.map(c=>({card:r(c),identity:r(c.querySelector('.darkSetIdentity')),badges:r(c.querySelector('.darkSetBadges')),heading:r(c.querySelector('h2')),details:r(c.querySelector('.darkSetDetails')),size:r(c.querySelector('.darkSetSize')),desc:r(c.querySelector('.darkSetDesc')),price:r(c.querySelector('.darkSetPrice')),select:r(c.querySelector('.darkSetSelect')),action:r(c.querySelector('.darkSetActionRow'))})),note:r(note),footer:r(footer),footerGap:+(footer.getBoundingClientRect().top-note.getBoundingClientRect().bottom).toFixed(2),clickHandlers:cards.map(c=>c.getAttribute('onclick')),nestedButtons:qa('.darkSetCard button').length}}catch(error){return {error:error.stack}}})()`);
   if(metrics.error)throw new Error(`${width}x${height}/${locale}: ${metrics.error}`);
   const fail=[];
   if(metrics.document.scrollWidth>metrics.document.clientWidth)fail.push('document horizontal overflow');
   if(metrics.nestedButtons)fail.push('nested button');
   if(metrics.clickHandlers.join('|')!=='chooseSet(2)|chooseSet(3)|chooseSet(4)')fail.push('click handlers');
   for(const [i,c] of metrics.cards.entries()){
    for(const [name,g] of Object.entries(c))if(g.client[0]+1<g.scroll[0]||g.client[1]+1<g.scroll[1])fail.push(`card ${i+2} ${name} clipping`);
    if(c.card.display!=='grid'||c.card.grid==='none')fail.push(`card ${i+2} layout`);
    if(c.card.rect[3]>metrics.footer.rect[1]&&metrics.stage.scroll[1]<=metrics.stage.client[1]+1)fail.push(`card ${i+2} footer overlap without stage scroll`);
    if(c.heading.rect[2]-c.heading.rect[0]<parseFloat(c.heading.fontSize)*2)fail.push(`card ${i+2} vertical title`);
    if(c.select.rect[2]-c.select.rect[0]<44||c.select.rect[3]-c.select.rect[1]<44)fail.push(`card ${i+2} action target`);
   }
   if(metrics.note.rect[3]>metrics.footer.rect[1]&&metrics.stage.scroll[1]<=metrics.stage.client[1]+1)fail.push('note footer overlap without stage scroll');
   rows.push({viewport:`${width}x${height}`,locale,metrics,fail});
   if(fail.length){console.error(JSON.stringify(metrics.cards,null,2));throw new Error(`${width}x${height}/${locale}: ${fail.join(', ')}`)}
   const capture=(width===834&&((height===1112&&['ko','en','vi'].includes(locale))||(height===940&&locale==='ko')))||(width===1080&&height===1920&&['ko','en','vi'].includes(locale));
   if(capture){const png=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(shots,`set-choice-${width}x${height}-${locale}.png`),Buffer.from(png.data,'base64'))}
   if(width===834&&height===1112&&locale==='ko'){await win.webContents.executeJavaScript(`document.querySelector('.set-4').focus()`);const focused=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});fs.writeFileSync(path.join(shots,'set-choice-834x1112-ko-focus.png'),Buffer.from(focused.data,'base64'))}
  }
 }
 fs.writeFileSync(output,JSON.stringify({viewports:viewports.map(v=>v.join('x')),locales,rows},null,2));
 console.log(`set choice responsive geometry passed: ${rows.length} cases`);
 await win.close(); app.quit();
}).catch(error=>{console.error(error);app.exit(1)});
