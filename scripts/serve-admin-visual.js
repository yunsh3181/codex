const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml'};
function source(relative,ref){
 if(ref&&!relative.startsWith('tests/fixtures/'))return execFileSync('git',['show',`${ref}:${relative}`],{cwd:root});
 return fs.readFileSync(path.join(root,relative));
}
function transformedAdmin(ref){
 let html=source('admin/index.html',ref).toString();
 html=html.replace(/\s*<script src="https:\/\/www\.gstatic\.com\/firebasejs\/[^"]+"><\/script>/g,'').replace('firebase-config.js?v=44.0.0','firebase-config.js?v=admin-visual-47.1.0');
 html=html.replace('src="../seat/?v=44.0.0"','src="about:blank"');
 return Buffer.from(html);
}
function createAdminVisualServer({ref=null,port=0}={}){
 const server=http.createServer((request,response)=>{
  try{
   const url=new URL(request.url,'http://127.0.0.1');
   const relative=decodeURIComponent(url.pathname).replace(/^\/+/, '')||'index.html';
   const body=relative==='admin'||relative==='admin/'||relative==='admin/index.html'?transformedAdmin(ref):relative==='firebase-config.js'?source('tests/fixtures/admin-browser-runtime.js',null):source(relative,ref);
   response.writeHead(200,{'content-type':mime[path.extname(relative)]||'application/octet-stream','cache-control':'no-store'});response.end(body);
  }catch(error){response.writeHead(404,{'content-type':'text/plain; charset=utf-8'});response.end(error.message)}
 });
 return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve({server,url:`http://127.0.0.1:${server.address().port}/admin/`})));
}
function exportAdminVisualSite(target,{ref=null}={}){
 fs.mkdirSync(path.join(target,'admin'),{recursive:true});fs.mkdirSync(path.join(target,'tests','fixtures'),{recursive:true});
 fs.writeFileSync(path.join(target,'admin','index.html'),transformedAdmin(ref));
 for(const relative of ['admin.css','admin-mobile.css','common-data.js','order-catalog.js','data.js','speech.js','after-hours-test-mode.js','test-mode-remote-channel.js','admin.js','admin-dashboard.js','tests/fixtures/admin-browser-runtime.js']){
  const destination=path.join(target,relative);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.writeFileSync(destination,source(relative,relative==='tests/fixtures/admin-browser-runtime.js'?null:ref));
 }
 fs.writeFileSync(path.join(target,'firebase-config.js'),source('tests/fixtures/admin-browser-runtime.js',null));
}
module.exports={createAdminVisualServer,exportAdminVisualSite};
if(require.main===module){
 if(process.env.ADMIN_VISUAL_EXPORT){exportAdminVisualSite(process.env.ADMIN_VISUAL_EXPORT,{ref:process.env.ADMIN_VISUAL_REF||null});console.log(process.env.ADMIN_VISUAL_EXPORT)}
 else createAdminVisualServer({ref:process.env.ADMIN_VISUAL_REF||null,port:Number(process.env.PORT)||4173}).then(({url})=>console.log(url));
}
