const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'order-review-cart-quantity.css'), 'utf8');

test('cart badge counts parent products and separate extras without included children', () => {
  assert.match(html, /function cartOrderTopLevelQuantity\(order\)\{/);
  assert.match(html, /order\.set\|\|order\.pizzaLeft\|\|order\.pizza/);
  assert.match(html, /parent\+sum\(order\.sides\|\|\{\}\)\+sum\(order\.drinks\|\|\{\}\)/);
  assert.doesNotMatch(html, /cartOrderTopLevelQuantity[\s\S]{0,300}included(?:Sides|Drinks)/);
  assert.match(html, /count\?`<span class="customerCartBadge"/);
});

test('read-only cart modal locks the background and restores focus', () => {
  assert.match(html, /function cartModalHTML\(\)/);
  assert.match(html, /role="dialog" aria-modal="true"/);
  assert.match(html, /function closeCartModal\(\)[\s\S]*customerCartButton/);
  assert.match(html, /event\.key==='Escape'&&state\.modal==='cartView'/);
  assert.doesNotMatch(html, /cartModalOrderCard[\s\S]{0,500}editReviewOrder/);
  assert.match(css, /body:has\(\.cartViewModal\) \.stage,body:has\(\.cartViewModal\) \.reviewOrderList\{overflow:hidden!important\}/);
});

test('review list is the only document scroll owner and exposes overflow controls', () => {
  assert.match(css, /body\[data-step="review"\]\{height:100dvh;overflow:hidden\}/);
  assert.match(css, /\.reviewOrderList\{[^}]*overflow-y:auto!important[^}]*touch-action:pan-y!important/);
  assert.match(html, /function updateReviewScrollControls\(\)/);
  assert.match(html, /controls\.hidden=!overflow/);
  assert.match(html, /scrollReviewOrders\('up'\)/);
  assert.match(html, /scrollReviewOrders\('down'\)/);
});

test('all customer locales provide the new cart and review copy', () => {
  for (const locale of ['ko', 'en', 'ja', 'zh', 'vi', 'es']) {
    const context = { window: { PJ_I18N_LOCALES: {} } };
    vm.runInNewContext(fs.readFileSync(path.join(root, 'i18n', `${locale}.js`), 'utf8'), context);
    const dictionary = context.window.PJ_I18N_LOCALES[locale];
    for (const key of ['open', 'close', 'itemCount']) assert.equal(typeof dictionary.cart[key], 'string', `${locale}.cart.${key}`);
    for (const key of ['orderHistory', 'orderOrdinal', 'edit', 'delete', 'addOrder', 'scrollUp', 'scrollDown', 'totalAmount', 'discountAmount', 'paymentAmount']) {
      assert.equal(typeof dictionary.review[key], 'string', `${locale}.review.${key}`);
    }
  }
});

test('customer-session resets clear cart edit state and an open cart modal', () => {
  assert.match(html, /function reset\([^)]*\)[\s\S]*cartItems:\[\],reviewEditIndex:null,editingOrderQty:1/);
  assert.match(html, /cartItems:\[\][\s\S]{0,500}modal:null/);
  assert.match(html, /startDineIn\(\)[\s\S]{0,350}reviewEditIndex=null;state\.editingOrderQty=1/);
  assert.match(html, /startTakeout\(\)[\s\S]{0,350}reviewEditIndex=null;state\.editingOrderQty=1/);
});
