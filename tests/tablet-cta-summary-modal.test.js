const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const tablet = fs.readFileSync('styles/device-tablet.css', 'utf8');
const phone = fs.readFileSync('styles/device-phone.css', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');

test('tablet CTA and summary are runtime scoped and share the content width', () => {
  assert.match(tablet, /html\[data-layout="tablet"\] :where\(\.selectionFooter, \.c-selection-footer\)/);
  assert.match(tablet, /html\[data-layout="tablet"\] :where\(\.cartbar, \.c-order-summary\)/);
  assert.ok(tablet.includes('width: min(100%, var(--tablet-content-max))'));
  assert.ok(tablet.includes('bottom: calc(var(--tablet-summary-height) + var(--safe-bottom))'));
  assert.ok(tablet.includes('min-height: var(--touch-target-min)'));
});

test('tablet summary contains flexible text and stable prices', () => {
  assert.match(tablet, /:where\(\.cartmain, \.cartSummary, \.orderSummary\)[\s\S]*?min-width: 0/);
  assert.match(tablet, /:where\(\.cartprice, \.cartTotal, \.cartCount\)[\s\S]*?white-space: nowrap/);
});

test('tablet spacer reserves the complete fixed bottom stack', () => {
  for (const token of ['--tablet-cta-height', '--tablet-summary-height', '--tablet-bottom-stack-height']) {
    assert.ok(tablet.includes(token), token);
  }
  assert.match(tablet, /:where\(\.selectionFooterSpacer, \.c-selection-footer-spacer, \.footerSpacer\)[\s\S]*?height: var\(--tablet-bottom-stack-height\)/);
});

test('tablet modal is bounded, scrollable, safe-area aware, and above fixed chrome', () => {
  assert.match(tablet, /html\[data-layout="tablet"\] :where\(\.backdrop, \.c-popup-backdrop\)/);
  assert.ok(tablet.includes('z-index: var(--z-backdrop)'));
  assert.ok(tablet.includes('max-width: 760px'));
  assert.ok(tablet.includes('max-height: min(88vh'));
  assert.ok(tablet.includes('overflow-y: auto'));
  assert.match(tablet, /:where\(\.modalBtns,[\s\S]*?padding-bottom: var\(--safe-bottom\)/);
});

test('tablet modal grids use two columns with a compact one-column fallback', () => {
  assert.match(tablet, /:where\(\.modalGrid,[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(tablet, /@media \(max-width: 680px\), \(max-height: 850px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
});

test('legacy state selectors and behavior markup remain unchanged', () => {
  for (const state of ['active', 'disabled', 'hidden', 'on', 'done', 'open']) {
    assert.ok(html.includes(state), state);
  }
  for (const selector of ['selectionFooter', 'cartbar', 'backdrop', 'modal']) {
    assert.ok(html.includes(selector), selector);
  }
});

test('phone remains separately scoped and default cannot activate tablet rules', () => {
  assert.ok(phone.includes('html[data-layout="phone"]'));
  assert.doesNotMatch(tablet, /(^|\n)(?!html\[data-layout="tablet"\]|\s|\/\*|\*|@media)[^\n]*\.(selectionFooter|cartbar|backdrop|modal)/);
});
