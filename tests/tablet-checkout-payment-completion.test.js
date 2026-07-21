const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const tablet = fs.readFileSync(path.join(root, 'styles/device-tablet.css'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const compact = tablet.replace(/\s+/g, '');

test('tablet checkout stages are runtime scoped and preserve the 880px content width', () => {
  for (const step of ['cartReview', 'review', 'phone', 'payment', 'done']) {
    assert.ok(tablet.includes(`[data-step="${step}"]`), step);
  }
  assert.ok(compact.includes('max-width:var(--tablet-content-max)'));
  assert.ok(compact.includes('--tablet-content-max:880px'));
  assert.doesNotMatch(tablet, /html\[data-layout="phone"\]/);
});

test('tablet checkout wraps descriptions and keeps prices right aligned', () => {
  for (const selector of [
    '.summary', '.review', '.cartReview', '.reviewOrderCard', '.reviewSection', '.cartOrderCard',
  ]) assert.ok(tablet.includes(selector), selector);
  assert.match(tablet, /\.reviewOrderHead h3,[\s\S]*?overflow-wrap: anywhere/);
  assert.match(tablet, /\.cartOrderPrice,[\s\S]*?text-align: right;[\s\S]*?white-space: nowrap/);
  assert.ok(compact.includes('padding-bottom:calc(32px+var(--safe-bottom))!important'));
});

test('tablet phone input and keypad use safe three-column touch geometry', () => {
  assert.match(tablet, /body\[data-step="phone"\] \.phoneDisplay[\s\S]*?min-height: 76px/);
  assert.match(tablet, /body\[data-step="phone"\] \.keypad[\s\S]*?repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(tablet, /body\[data-step="phone"\] \.keypad button[\s\S]*?min-height: 64px/);
  assert.ok(compact.includes('touch-action:manipulation'));
  assert.ok(compact.includes('padding-bottom:calc(20px+var(--safe-bottom))'));
});

test('tablet payment uses two wide columns and one compact column without changing state logic', () => {
  assert.match(tablet, /body\[data-step="payment"\] \.paymentGrid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(tablet, /@media \(max-width: 680px\)[\s\S]*?body\[data-step="payment"\] \.paymentGrid[\s\S]*?minmax\(0, 1fr\)/);
  assert.match(tablet, /\.paymentSubmitBtn[\s\S]*?min-height: 56px/);
  assert.match(html, /class="paymentCard \$\{state\.paymentMethod===method\?'active':''\}"/);
  assert.match(html, /class="next paymentSubmitBtn"[^>]*\$\{validPayment\(\)\?'':'disabled'\}/);
});

test('tablet completion keeps payment, reserve, and home content scroll-safe', () => {
  for (const selector of ['.num', '.paymentRequiredBox', '.doneGuide', '.doneReserve', '.doneHomeBtn']) {
    assert.ok(tablet.includes(selector) || html.includes(selector.replace('.', 'class="')), selector);
  }
  assert.match(tablet, /body\[data-step="done"\] :where\(\.done\) \.num[\s\S]*?font-size: clamp\(60px, 10vw, 88px\)/);
  assert.match(tablet, /body\[data-step="done"\] \.doneHomeBtn[\s\S]*?min-height: 56px/);
  assert.ok(compact.includes('padding-bottom:calc(32px+var(--safe-bottom))'));
  assert.ok(compact.includes('overflow-y:auto'));
});

test('phone CSS and behavior-bearing source files remain unchanged by tablet activation', () => {
  assert.ok(phone.includes('html[data-layout="phone"]'));
  for (const token of ['pressPhone', 'selectPayment', 'validPayment', 'submitMobileOrder', 'reset();render()']) {
    assert.ok(html.includes(token), token);
  }
});
