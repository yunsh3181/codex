const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const kiosk = fs.readFileSync(path.join(root, 'styles/device-kiosk21.css'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const tablet = fs.readFileSync(path.join(root, 'styles/device-tablet.css'), 'utf8');
const device = fs.readFileSync(path.join(root, 'styles/device.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const compact = kiosk.replace(/\s+/g, '');

test('checkout runtime scope preserves the 960px kiosk surface', () => {
  for (const step of ['cartReview', 'review', 'phone', 'payment', 'done']) {
    assert.ok(kiosk.includes(`[data-step="${step}"]`), step);
  }
  assert.ok(kiosk.includes('--kiosk21-content-max: 960px'));
  assert.match(kiosk, /body:is\([\s\S]*?\) :where\(\.stage, \.cartPage, \.phoneStep, \.summary, \.done\)[\s\S]*?max-width: var\(--kiosk21-content-max\)/);
});

test('checkout text wraps while quantity and right-aligned prices retain space', () => {
  assert.match(kiosk, /\.reviewOrderHead h3,[\s\S]*?overflow-wrap: anywhere/);
  assert.match(kiosk, /\.cartOrderPrice,[\s\S]*?text-align: right;[\s\S]*?white-space: nowrap/);
  assert.ok(kiosk.includes('.multiCartTotal strong'));
  assert.ok(kiosk.includes('.reviewSection li span:last-child'));
  assert.match(kiosk, /\.cartOrderTop, \.reviewOrderHead,[\s\S]*?justify-content: space-between/);
});

test('phone input uses enlarged safe geometry without browser text zoom pressure', () => {
  assert.match(kiosk, /body\[data-step="phone"\] \.phoneDisplay[\s\S]*?min-height: 96px/);
  assert.match(kiosk, /body\[data-step="phone"\] \.phoneDisplay[\s\S]*?font-size: clamp\(36px, 5vw, 52px\)/);
  assert.match(kiosk, /body\[data-step="phone"\] \.phoneDisplay[\s\S]*?text-overflow: ellipsis;[\s\S]*?white-space: nowrap/);
  assert.ok(compact.includes('padding-bottom:calc(32px+var(--safe-bottom))'));
});

test('numeric keypad is an even three-column grid with 72px touch targets', () => {
  assert.match(kiosk, /body\[data-step="phone"\] \.keypad[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)[\s\S]*?gap: 16px/);
  assert.match(kiosk, /body\[data-step="phone"\] \.keypad button[\s\S]*?min-height: 72px/);
  assert.match(kiosk, /body\[data-step="phone"\] \.keypad button[\s\S]*?touch-action: manipulation/);
});

test('payment keeps the existing selector and uses wide two-column geometry', () => {
  assert.match(kiosk, /body\[data-step="payment"\] \.paymentGrid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(kiosk, /@media \(max-width: 760px\)[\s\S]*?body\[data-step="payment"\] \.paymentGrid[\s\S]*?minmax\(0, 1fr\)/);
  assert.match(html, /class="paymentCard \$\{state\.paymentMethod===method\?'active':''\}"/);
  assert.match(html, /class="next paymentSubmitBtn"[^>]*\$\{validPayment\(\)\?'':'disabled'\}/);
});

test('completion has a large order number, home target, safe bottom, and internal scroll', () => {
  assert.match(kiosk, /body\[data-step="done"\] :where\(\.done\) \.num[\s\S]*?font-size: clamp\(72px, 10vw, 112px\)/);
  assert.match(kiosk, /body\[data-step="done"\] \.doneHomeBtn[\s\S]*?min-height: 80px/);
  assert.match(kiosk, /body\[data-step="done"\] \.stage[\s\S]*?overflow-y: auto/);
  assert.ok(compact.includes('padding:56px32pxcalc(48px+var(--safe-bottom))'));
  assert.ok(compact.includes('margin-bottom:var(--safe-bottom)'));
});

test('kiosk activation cannot affect phone, tablet, or default device layers', () => {
  assert.doesNotMatch(kiosk, /html\[data-layout="(?:phone|tablet|default)"\]/);
  assert.ok(phone.includes('html[data-layout="phone"]'));
  assert.ok(tablet.includes('html[data-layout="tablet"]'));
  assert.doesNotMatch(device, /data-layout="kiosk21"/);
});

test('behavior-bearing order, cart, price, and Firestore selectors remain present', () => {
  for (const token of [
    'pressPhone', 'selectPayment', 'validPayment', 'checkoutCart', 'cartTotal',
    'currentOrderTotal', 'submitMobileOrder', "db.collection('orders').doc", 'state.orderNo',
  ]) assert.ok(html.includes(token), token);
});
