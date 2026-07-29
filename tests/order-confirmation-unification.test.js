const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const reviewActionsSource=html.slice(
  html.indexOf('function reviewAddActionsHTML'),
  html.indexOf('function reviewTotals')
);

test('every cart checkout enters the shared order confirmation page',()=>{
  assert.match(html,/function checkoutCart\(\)\{if\(!state\.cartItems\.length\)return;state\.step='review';render\(\)\}/);
  assert.doesNotMatch(html,/function checkoutCart\(\)[\s\S]{0,120}state\.step='phone'/);
});

test('the shared confirmation renders the takeout reference actions for every benefit',()=>{
  const reviewView=html.match(/if\(state\.step==='review'\)return shell\(`[\s\S]*?`\);/)?.[0]||'';
  assert.match(reviewView,/reviewOrdersHTML\(\).*reviewAddActionsHTML\(\).*reviewTotalsHTML\(\)/);
  assert.match(reviewActionsSource,/addAnotherSet\(\)/);
  assert.match(reviewActionsSource,/addAnotherUpUp\(\)/);
  assert.match(reviewActionsSource,/addAnotherSingle\(\)/);
  assert.doesNotMatch(reviewActionsSource,/orderType|promo|hasTakeoutDiscountOrder/);
});

test('all discovered benefits keep using the same review data and total renderers',()=>{
  for(const benefit of ['set','upup','happy','takeout','normal']){
    assert.ok(html.includes(`id:'${benefit}'`)||html.includes(`'${benefit}'`),benefit);
  }
  assert.match(html,/function reviewOrderCard\(order,index\)\{const model=buildCartDisplayModel\(order\)/);
  assert.match(html,/function reviewTotals\(\)\{const orders=allReviewOrders\(\)/);
  assert.match(html,/function reviewTotalsHTML\(\)\{const totals=reviewTotals\(\)/);
});

test('confirmation routing does not mutate order type or pricing',()=>{
  const checkout=html.match(/function checkoutCart\(\)\{[^}]+\}/)?.[0]||'';
  assert.doesNotMatch(`${checkout}${reviewActionsSource}`,/orderType\s*=|promo\s*=|price\s*=|discount\s*=/);
  assert.match(html,/review:\(state\.cartItems\.length\?'cartReview':\(state\.orderType==='takeout'\?'accompaniment':'drink'\)\)/);
  assert.match(html,/phone:'review'/);
});
