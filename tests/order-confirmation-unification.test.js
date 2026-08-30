const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const runtimeStyles=[
  'styles/device-phone.css',
  'styles/device-tablet.css',
  'styles/device-kiosk21.css',
  'styles/network-status.css',
  'styles/order-review-cart-quantity.css'
].map(file=>fs.readFileSync(path.join(__dirname,'..',file),'utf8')).join('\n');
const reviewActionsSource=html.slice(
  html.indexOf('function reviewAddActionsHTML'),
  html.indexOf('function reviewTotals')
);

test('every completed order enters the shared confirmation without a cart review step',()=>{
  assert.match(html,/function addCurrentOrderToReview\(\)\{storeCurrentOrderSnapshot\(\);clearCurrentProduct\(\);state\.step='review';render\(\)\}/);
  assert.match(html,/function storeCurrentOrderSnapshot\(\)[\s\S]*?state\.cartItems\.splice\(index,0,snapshot\)/);
  assert.doesNotMatch(html,/if\(state\.step==='cartReview'\)return shell/);
  assert.doesNotMatch(html,/function checkoutCart\(/);
  assert.doesNotMatch(html,/addCurrentOrderToCart/);
  assert.doesNotMatch(runtimeStyles,/cartReview/);
});

test('the shared confirmation renders the takeout reference actions for every benefit',()=>{
  const reviewView=html.match(/if\(state\.step==='review'\)return shell\(`[\s\S]*?`\);/)?.[0]||'';
  assert.match(reviewView,/reviewOrdersHTML\(\).*reviewAddActionsHTML\(\).*reviewTotalsHTML\(\)/);
  assert.match(reviewView,/state\.cartItems\.length\?'':'disabled'/);
  assert.match(reviewActionsSource,/addAnotherOrder\(\)/);
  assert.match(reviewActionsSource,/reviewAddOrderButton/);
  assert.doesNotMatch(reviewActionsSource,/addAnotherSet\(\)|addAnotherUpUp\(\)|addAnotherSingle\(\)/);
  assert.doesNotMatch(reviewActionsSource,/orderType|promo|hasTakeoutDiscountOrder/);
});

test('all discovered benefits keep using the same review data and total renderers',()=>{
  for(const benefit of ['set','upup','happy','takeout','normal']){
    assert.ok(html.includes(`id:'${benefit}'`)||html.includes(`'${benefit}'`),benefit);
  }
  assert.match(html,/function reviewOrderCard\(order,index\)\{const model=buildCartDisplayModel\(order\)/);
  assert.match(html,/function reviewOrderCard[\s\S]*?editReviewOrder\(\$\{index\}\)[\s\S]*?removeCartItem\(\$\{index\}\)/);
  assert.match(html,/function allReviewOrders\(\)\{return \(state\.cartItems\|\|\[\]\)\.map/);
  assert.match(html,/function reviewTotals\(\)\{return orderCollectionTotals\(allReviewOrders\(\)\)\}/);
  assert.match(html,/function reviewTotalsHTML\(totals=reviewTotals\(\)\)\{/);
});

test('confirmation routing does not mutate order type or pricing',()=>{
  const enterReview=html.match(/function addCurrentOrderToReview\(\)\{[^}]+\}/)?.[0]||'';
  assert.doesNotMatch(`${enterReview}${reviewActionsSource}`,/orderType\s*=|promo\s*=|price\s*=|discount\s*=/);
  assert.match(html,/const navigationHistory=\[\]/);
  assert.match(html,/reset=function\(\.\.\.args\)\{navigationHistory\.length=0;const result=resetOrderState/);
  assert.match(html,/while\(navigationHistory\.length&&!previous\)/);
  assert.doesNotMatch(html,/review:'promo'/);
  assert.match(html,/else if\(state\.step==='review'\)state\.step='phone'/);
});
