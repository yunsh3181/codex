const fs=require('node:fs');
const path=require('node:path');
const test=require('node:test');
const assert=require('node:assert/strict');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/device-kiosk21.css'),'utf8');

test('cart rows render name, quantity, flexible space, and price separately',()=>{
  const source=html.slice(html.indexOf('function cartCategoryHtml'),html.indexOf('function cartOrderDetailHtml'));
  assert.match(source,/class="cartItemName"/);
  assert.match(source,/class="cartItemQuantity">×\$\{row\.qty\}/);
  assert.match(source,/class="cartItemFlexibleSpace"/);
  assert.match(source,/class="cartItemPrice/);
  assert.doesNotMatch(source,/\$\{row\.name\}\s+\$\{showUnitQty/);
});

test('kiosk cart keeps quantities beside names and prices on one right edge',()=>{
  assert.match(css,/\.cartItemSummary\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*auto\)\s+auto\s+minmax\(12px,\s*1fr\)\s+auto;[\s\S]*?column-gap:\s*10px;[\s\S]*?width:\s*100%;/);
  assert.match(css,/\.cartItemName\s*\{[\s\S]*?min-width:\s*0;[\s\S]*?overflow-wrap:\s*anywhere;/);
  assert.match(css,/:where\(\s*\.cartItemQuantity,\s*\.cartItemPrice\s*\)\s*\{[\s\S]*?white-space:\s*nowrap;/);
  assert.match(css,/\.cartItemPrice\s*\{[\s\S]*?text-align:\s*right;[\s\S]*?font-variant-numeric:\s*tabular-nums;/);
});

test('cart totals still use the stored order price and shared money formatter',()=>{
  assert.match(html,/total:storedUnit\*qty/);
  assert.match(html,/class="cartOrderTotal"[\s\S]*?\$\{money\(model\.total\)\}/);
  assert.match(html,/function changeCartQty\(i,d\)\{const item=state\.cartItems\[i\]/);
});
