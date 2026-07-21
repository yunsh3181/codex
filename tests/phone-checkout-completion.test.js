const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const phoneCss = fs
  .readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8')
  .replace(/\s+/g, '');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('checkout and completion activation is scoped to the phone device selector', () => {
  for (const step of ['cartReview', 'review', 'phone', 'payment', 'done']) {
    assert.ok(phoneCss.includes(`html[data-layout="phone"]body[data-step="${step}"]`));
  }
  assert.doesNotMatch(phoneCss, /@media[^}]*data-step=(?:"|\\")?(?:cartReview|review|phone|payment|done)/);
});

test('phone number and keypad retain visible input and a three-column touch layout', () => {
  assert.ok(phoneCss.includes('.phoneDisplay{width:100%;min-width:0;overflow:hidden;'));
  assert.ok(phoneCss.includes('white-space:nowrap'));
  assert.ok(phoneCss.includes('.keypad{grid-template-columns:repeat(3,minmax(0,1fr));'));
  assert.ok(phoneCss.includes('.keypadbutton{width:100%;min-width:0;min-height:var(--touch-target-min);'));
});

test('checkout totals wrap descriptions while keeping prices right aligned', () => {
  assert.ok(phoneCss.includes('.reviewOrderHeadh3'));
  assert.ok(phoneCss.includes('overflow-wrap:anywhere'));
  assert.ok(phoneCss.includes('.multiCartTotalstrong'));
  assert.ok(phoneCss.includes('text-align:right;white-space:nowrap'));
});

test('payment preserves existing card state and submit control markup', () => {
  assert.match(html, /class="paymentCard \$\{state\.paymentMethod===method\?'active':''\}"/);
  assert.match(html, /class="next paymentSubmitBtn"[^>]*\$\{validPayment\(\)\?'':'disabled'\}/);
  assert.ok(phoneCss.includes('[data-step="payment"]>.paymentGrid') === false);
  assert.ok(phoneCss.includes('.paymentGrid{grid-template-columns:minmax(0,1fr);'));
});

test('completion content and action reserve safe-area space without changing copy', () => {
  for (const selector of [
    '.done.num',
    '.doneOrderLabel',
    '.paymentRequiredBox',
    '.doneGuide',
    '.doneReserve',
    '.doneHomeBtn',
  ]) {
    assert.ok(html.includes(selector.replace('.', 'class="')) || phoneCss.includes(selector));
  }
  assert.ok(phoneCss.includes('.doneHomeBtn{width:100%;margin-bottom:var(--safe-bottom);'));
  assert.ok(phoneCss.includes('[data-step="done"]>.stage') === false);
  assert.ok(phoneCss.includes('[data-step="done"]') && phoneCss.includes('padding-bottom:calc(18px+var(--safe-bottom))!important'));
});
