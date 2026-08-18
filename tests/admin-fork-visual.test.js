const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const helpers=source.match(/function disposablesVisual[\s\S]*?\n}/)?.[0]+'\n'+source.match(/function disposablesStatusHTML[\s\S]*?\n}/)?.[0];
const context={};vm.createContext(context);vm.runInContext(helpers,context);
for(const [value,text,className,label] of [[true,'O','fork-yes','필요: O'],[false,'X','fork-no','불필요: X'],[undefined,'확인 필요','fork-review','정보 확인 필요'],[null,'확인 필요','fork-review','정보 확인 필요'],['true','확인 필요','fork-review','정보 확인 필요'],['false','확인 필요','fork-review','정보 확인 필요'],[0,'확인 필요','fork-review','정보 확인 필요'],[1,'확인 필요','fork-review','정보 확인 필요']]){
 const result=context.disposablesVisual(value);assert.strictEqual(result.text,text);assert.strictEqual(result.className,className);assert.match(result.ariaLabel,new RegExp(label));
 const html=context.disposablesStatusHTML(value);assert.match(html,new RegExp(`class="fork-status ${className}"`));assert.match(html,new RegExp(`>${text}<`));assert.match(html,/aria-label=/);
}
assert.ok(source.includes("disposablesStatusHTML(order.disposables)"),'list uses shared formatter');
assert.ok(source.includes("disposablesStatusHTML(order?.disposables,'detail-fork-status')"),'detail uses shared formatter');
console.log('admin fork strict shared visual formatter passed');
