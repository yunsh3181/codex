const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {measureCustomerGeometry,createCustomerGeometryRecorder}=require('../scripts/customer-geometry-diagnostics');

test('serialized diagnostic collector preserves exact overflowing box metrics and ancestors',()=>{
 const box=(className,width,height,scrollWidth,scrollHeight,parentElement=null)=>({
  tagName:'SPAN',id:'',className,textContent:'500mL',innerText:'500mL',
  clientWidth:width,scrollWidth,offsetWidth:width+2,clientHeight:height,scrollHeight,offsetHeight:height+2,
  parentElement,children:[],getBoundingClientRect:()=>({x:10,y:20,left:10,top:20,right:10+width,bottom:20+height,width,height}),
  closest:()=>parentElement
 });
 const card=box('v3DrinkCard',302,250,302,250),row=box('v3DrinkRow',190,106,190,106,card);
 const volume=box('v3DrinkVolume',70,106,73,106,row),title=box('darkBenefitTitle',714,40,714,45,card);
 volume.children=[box('volumeText',73,28,73,28,volume)];
 const style={'width':'70px','min-width':'0px','max-width':'none','flex-basis':'auto','flex-grow':'0','flex-shrink':'1','grid-template-columns':'48px 81.4375px 48px','font-family':'Fixture Font','font-size':'24px','font-weight':'1000','letter-spacing':'normal','line-height':'40px','white-space':'nowrap','overflow':'visible','padding':'0px','border':'0px none','display':'flex','align-items':'center'};
 const result=vm.runInNewContext(`(${measureCustomerGeometry.toString()})('.fixture')`,{
  document:{querySelector:()=>({getBoundingClientRect:()=>({x:0,y:1032,left:0,right:834,top:1032,bottom:1112,width:834,height:80})}),querySelectorAll:()=>[volume,title],documentElement:{clientWidth:834,clientHeight:1112,lang:'ko',dataset:{layout:'tablet'}},body:{dataset:{step:'drink'}}},
  innerWidth:834,innerHeight:1112,devicePixelRatio:2,window:{visualViewport:null},getComputedStyle:()=>({getPropertyValue:key=>style[key]||''})
 });
 assert.equal(result.dpr,2);assert.equal(result.locale,'ko');assert.equal(result.viewport.innerHeight,1112);
 const [v,t]=result.elements;
 assert.equal(v.clientWidth,70);assert.equal(v.scrollWidth,73);assert.equal(v.offsetWidth,72);
 assert.equal(v.parents.length,2);assert.equal(v.parents[1].rect.width,302);assert.equal(v.children[0].text,'500mL');
 for(const [key,value] of Object.entries(style))assert.equal(v.computed[key],value,key);
 assert.equal(t.clientHeight,40);assert.equal(t.scrollHeight,45);assert.equal(t.offsetHeight,42);
 assert.equal(t.footerGap,972);assert.equal(t.footerRect.height,80);
 assert.equal(volume.clientWidth,70);assert.equal(title.scrollHeight,45);
});

test('recorder retains JSON and screenshot outside temporary capture cleanup, including capture errors',async t=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'customer-geometry-unit-'));
 t.after(()=>fs.rmSync(temp,{recursive:true,force:true}));
 const previous=process.env.CUSTOMER_GEOMETRY_DIAGNOSTICS_DIR;
 process.env.CUSTOMER_GEOMETRY_DIAGNOSTICS_DIR=path.join(temp,'artifact');
 t.after(()=>{if(previous===undefined)delete process.env.CUSTOMER_GEOMETRY_DIAGNOSTICS_DIR;else process.env.CUSTOMER_GEOMETRY_DIAGNOSTICS_DIR=previous});
 const captures=path.join(temp,'temporary-captures');fs.mkdirSync(captures);
 const record=createCustomerGeometryRecorder({name:'drink-volume',captureDir:captures});
 const png=Buffer.from('89504e470d0a1a0a','hex');
 const win={webContents:{executeJavaScript:async()=>({dpr:2,locale:'ko',elements:[{clientWidth:70,scrollWidth:73}]})},capturePage:async()=>{
  assert.equal(fs.existsSync(path.join(temp,'artifact/drink-volume/failure.json')),true);
  return {toPNG:()=>png};
 }};
 const result=await record(win,{caseName:'failure',selector:'.v3DrinkVolume',assertionFailed:true,fixture:{width:834,height:1112,locale:'ko'}});
 fs.rmSync(captures,{recursive:true});
 assert.deepEqual(fs.readFileSync(result.screenshotPath),png);
 const saved=JSON.parse(fs.readFileSync(result.jsonPath,'utf8'));
 assert.equal(saved.elements[0].scrollWidth,73);assert.equal(saved.assertionFailed,true);
 assert.equal(saved.runtime.arch,process.arch);assert.match(saved.runtime.scope,/not a packaged ia32 measurement/);
 assert.equal(fs.existsSync(path.join(temp,'artifact/drink-volume/run.json')),true);
 win.capturePage=async()=>{throw new Error('synthetic capture failure')};
 const failedCapture=await record(win,{caseName:'capture-error',selector:'.darkBenefitTitle',assertionFailed:true,fixture:{width:834,height:1112,locale:'ko'}});
 assert.equal(JSON.parse(fs.readFileSync(failedCapture.jsonPath,'utf8')).screenshotError.message,'synthetic capture failure');
 assert.equal(failedCapture.assertionFailed,true);
});
