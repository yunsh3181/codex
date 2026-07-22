const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const customerHelper=html.match(/function orderNumberLabel\(value\)\{[^\n]+/)?.[0];
assert.ok(customerHelper,'customer display helper exists');
const customerContext={String};
vm.createContext(customerContext);
vm.runInContext(customerHelper,customerContext);
const adminHelpers=admin.match(/function orderNumberLabel[\s\S]*?\n}\nfunction spokenOrderNumber[\s\S]*?\n}/)?.[0];
assert.ok(adminHelpers,'admin display and speech helpers exist');
const adminContext={String};
vm.createContext(adminContext);
vm.runInContext(adminHelpers,adminContext);

for(const [stored,label,spoken] of [['P1234','포장 1234','1234'],['D1234','다이닝 1234','1234'],['P0001','포장 0001','0001'],['legacy-42','legacy-42','legacy-42'],['','','']]){
 assert.strictEqual(customerContext.orderNumberLabel(stored),label);
 assert.strictEqual(adminContext.orderNumberLabel(stored),label);
 assert.strictEqual(adminContext.spokenOrderNumber(stored),spoken);
}
assert.ok(html.includes('orderNo:displayOrderNo(),customerNumber:displayOrderNo()'),'stored order-number fields remain unchanged');
assert.ok(html.includes('orderNumberLabel(state.orderNo)'),'completion screen uses the display label');
assert.ok(admin.includes('spokenOrderNumber(order.customerNumber||order.orderNo)'),'completion speech reads only the last four digits');
console.log('order-number display labels and speech normalization passed');
