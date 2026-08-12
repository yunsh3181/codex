const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const kiosk=fs.readFileSync(path.join(root,'index.html'),'utf8');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const adminCss=fs.readFileSync(path.join(root,'admin.css'),'utf8');

test('every half-and-half entry path opens the shared guide',()=>{
 assert.match(kiosk,/function selectPizzaMode\(mode\)[\s\S]*?if\(mode==='half'\)\{state\.modal='halfGuide'/);
 assert.match(kiosk,/function setSetOption\(key,value\)[\s\S]*?value==='half'[\s\S]*?state\.modal='halfGuide'/);
 assert.match(kiosk,/function setBannerOption\(key,value\)[\s\S]*?key==='mode'&&value==='half'[\s\S]*?state\.modal='halfGuide'/);
 assert.match(kiosk,/function confirmHalfGuide\(\)[\s\S]*?state\.step==='pizzaOptions'[\s\S]*?if\(state\.set\)[\s\S]*?state\.step='pizza'/);
});

test('topping decision uses the shared fixed footer for skip',()=>{
 const decision=kiosk.match(/if\(state\.step==='topping'\)\{if\(!state\.toppingChoice\)return shell\(`([\s\S]*?)`\);/);
 assert.ok(decision,'topping decision screen found');
 assert.doesNotMatch(decision[1],/skipCard toppingDecisionCard/);
 assert.match(decision[1],/toppingAddCard/);
 assert.match(decision[1],/selectionFooter\('skipTopping\(\)'/);
});

test('set pizzas show inclusion instead of an individual price',()=>{
 assert.match(kiosk,/const priceHtml=state\.set\?`<div class="price">\$\{t\('review\.includedInSet'\)\}<\/div>`/);
});

test('discount totals always equal normal sales total minus payment',()=>{
 assert.match(kiosk,/discount:Math\.max\(0,normal-final\)/);
 assert.match(kiosk,/return \{normal,discount:Math\.max\(0,normal-final\),final,discounts\}/);
 const safeMatch=admin.match(/function safeAmounts[\s\S]*?\n}\nfunction splitPaymentSummary/);
 assert.ok(safeMatch);
 const context={Number,Math};
 vm.createContext(context);
 vm.runInContext(safeMatch[0].replace(/\nfunction splitPaymentSummary[\s\S]*/,''),context);
 assert.deepStrictEqual(
  JSON.parse(JSON.stringify(context.safeAmounts({normalAmount:56200,totalAmount:42000,discountAmount:1}))),
  {original:56200,discount:14200,paid:42000}
 );
});

test('admin detail keeps the unified menu, payment, and call layout behind the central table',()=>{
 for(const token of ['mainOrderCard','main-order-summary','main-order-type','order.phone||order.phoneMasked','orderDetailMenuHTML(order)','orderDetailForkHTML(order)','main-payment-grid','main-customer-call'])assert.ok(admin.includes(token),token);
 assert.match(admin,/visible\.map\(centralOrderRow\)\.join/);
 assert.match(adminCss,/\.main-order-body\{display:grid;grid-template-columns:minmax\(0,45fr\) minmax\(0,55fr\)/);
 assert.match(adminCss,/\.main-payment-grid\{display:grid;grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(adminCss,/\.main-customer-call\{[^}]*linear-gradient\(100deg,#5f45c9,#834ce1,#6550c9\)/);
});

test('admin seat overview toggles empty and occupied seats',()=>{
 assert.match(admin,/const action=status==='held'\?'open-seat-order':\['empty','occupied'\]\.includes\(status\)\?'toggle-seat':''/);
 assert.match(admin,/if\(!seat\|\|!\['empty','occupied'\]\.includes\(status\)\|\|statusUpdateLocks\.has\(lockId\)\)return false/);
 assert.match(admin,/async function toggleOverviewSeat/);
 assert.match(admin,/status:'occupied'/);
 assert.match(admin,/if\(status==='occupied'\)return clearSeat\(id,button\)/);
 assert.match(admin,/action==='toggle-seat'/);
});
