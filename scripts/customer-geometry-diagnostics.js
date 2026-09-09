'use strict';

const fs=require('node:fs');
const path=require('node:path');

// Serialized into the existing synthetic renderer. Read-only: no style, state,
// viewport, font, focus, or scroll changes are made by this collector.
function measureCustomerGeometry(selector){
 const properties=['display','align-items','align-self','box-sizing','width','min-width','max-width','height','min-height','max-height','padding','padding-top','padding-right','padding-bottom','padding-left','border','border-top-width','border-right-width','border-bottom-width','border-left-width','flex-basis','flex-grow','flex-shrink','grid-template-columns','gap','white-space','overflow','overflow-x','overflow-y','font-family','font-size','font-weight','line-height','letter-spacing','color'];
 const rect=element=>{if(!element)return null;const r=element.getBoundingClientRect();return Object.fromEntries(['x','y','top','right','bottom','left','width','height'].map(key=>[key,r[key]]))};
 const describe=element=>{const style=getComputedStyle(element);return {tag:element.tagName,id:element.id,className:element.className,text:element.textContent.trim(),renderedText:element.innerText,rect:rect(element),clientWidth:element.clientWidth,scrollWidth:element.scrollWidth,offsetWidth:element.offsetWidth,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,offsetHeight:element.offsetHeight,computed:Object.fromEntries(properties.map(key=>[key,style.getPropertyValue(key)]))}};
 const footer=document.querySelector('.cartbar');
 const elements=[...document.querySelectorAll(selector)].map(element=>{
  const parents=[];for(let parent=element.parentElement;parent;parent=parent.parentElement){const value=describe(parent);delete value.text;delete value.renderedText;parents.push(value)}
  const parentCard=element.closest('.v3DrinkCard,.darkBenefitCard,.darkBenefitPage');
  const elementRect=rect(element),parentCardRect=rect(parentCard),footerRect=rect(footer);
  return {...describe(element),children:[...element.children].map(describe),parents,parentCard:parentCard?{className:parentCard.className,rect:parentCardRect}:null,footerRect,footerGap:footerRect?footerRect.top-elementRect.bottom:null,parentCardFooterGap:footerRect&&parentCardRect?footerRect.top-parentCardRect.bottom:null};
 });
 return {selector,viewport:{innerWidth,innerHeight,clientWidth:document.documentElement.clientWidth,clientHeight:document.documentElement.clientHeight,visualViewport:window.visualViewport?{width:visualViewport.width,height:visualViewport.height,scale:visualViewport.scale}:null},dpr:devicePixelRatio,locale:document.documentElement.lang,layout:document.documentElement.dataset.layout,step:document.body.dataset.step,elements};
}

function createCustomerGeometryRecorder({name,captureDir}){
 const output=path.resolve(process.env.CUSTOMER_GEOMETRY_DIAGNOSTICS_DIR||path.join(captureDir,'diagnostics'),name);
 const runtime={platform:process.platform,arch:process.arch,node:process.versions.node,electron:process.versions.electron,chromium:process.versions.chrome,runnerOS:process.env.RUNNER_OS||null,runnerArch:process.env.RUNNER_ARCH||null,sourceSha:process.env.GITHUB_SHA||null,scope:'synthetic test renderer; not a packaged ia32 measurement'};
 fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'run.json'),JSON.stringify({runtime,startedAt:new Date().toISOString()},null,2));
 return async(win,{caseName,selector,assertionFailed,fixture})=>{
  const stem=caseName.replace(/[^a-zA-Z0-9_-]/g,'_');
  const jsonPath=path.join(output,`${stem}.json`),screenshotPath=path.join(output,`${stem}.png`);
  const diagnostic={runtime,fixture,assertionFailed,measuredAt:new Date().toISOString(),...await win.webContents.executeJavaScript(`(${measureCustomerGeometry.toString()})(${JSON.stringify(selector)})`,true),jsonPath,screenshotPath};
  // Persist the original geometry before capture, so a GPU/capture failure does
  // not erase the measurements or replace the existing assertion's evidence.
  fs.writeFileSync(jsonPath,JSON.stringify(diagnostic,null,2));
  try{fs.writeFileSync(screenshotPath,(await win.capturePage()).toPNG())}
  catch(error){diagnostic.screenshotError={name:error.name,message:error.message};fs.writeFileSync(jsonPath,JSON.stringify(diagnostic,null,2));console.error('CUSTOMER_GEOMETRY_SCREENSHOT_ERROR',JSON.stringify(diagnostic.screenshotError))}
  return diagnostic;
 };
}

module.exports={measureCustomerGeometry,createCustomerGeometryRecorder};
