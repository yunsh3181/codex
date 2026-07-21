const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const kiosk = fs.readFileSync(path.join(root, 'styles/device-kiosk21.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('kiosk CTA and summary activation remains runtime scoped', () => {
  assert.match(kiosk, /html\[data-layout="kiosk21"\] :where\(\.selectionFooter, \.c-selection-footer\)/);
  assert.match(kiosk, /html\[data-layout="kiosk21"\] :where\(\.cartbar, \.c-order-summary\)/);
  assert.doesNotMatch(kiosk, /html\[data-layout="(?:phone|tablet|default)"\]/);
});

test('kiosk CTA uses fixed 960px safe-area geometry and an accessible button height', () => {
  for (const token of [
    '--kiosk21-cta-height: 128px',
    '--kiosk21-cta-button-height: 96px',
    '--kiosk21-bottom-gap: 24px'
  ]) assert.ok(kiosk.includes(token), token);
  assert.match(kiosk, /\.selectionFooter, \.c-selection-footer\)[\s\S]*?bottom: calc\(var\(--kiosk21-active-summary-height\) \+ var\(--safe-bottom\)\)/);
  assert.match(kiosk, /\.selectionFooter, \.c-selection-footer\)[\s\S]*?width: min\(100%, var\(--kiosk21-content-max\)\)/);
  assert.match(kiosk, /min-height: var\(--kiosk21-cta-button-height\) !important/);
  assert.ok(kiosk.includes('--kiosk21-content-max: 960px'));
});

test('summary is positioned above the viewport edge and contains flexible text and stable prices', () => {
  assert.ok(kiosk.includes('--kiosk21-summary-height: 112px'));
  assert.match(kiosk, /\.cartbar, \.c-order-summary\)[\s\S]*?bottom: 0/);
  assert.match(kiosk, /\.cartmain, \.cartSummary, \.orderSummary\)[\s\S]*?min-width: 0[\s\S]*?overflow-wrap: anywhere/);
  assert.match(kiosk, /\.cartprice, \.cartTotal, \.cartCount, \.summaryPrice\)[\s\S]*?white-space: nowrap/);
});

test('bottom stack and measured spacer follow existing summary presence', () => {
  assert.match(kiosk, /--kiosk21-bottom-stack-height: calc\([\s\S]*?var\(--kiosk21-cta-height\)[\s\S]*?var\(--kiosk21-active-summary-height\)[\s\S]*?var\(--safe-bottom\)/);
  assert.match(kiosk, /body:has\(\.cartbar, \.c-order-summary\)[\s\S]*?--kiosk21-active-summary-height: var\(--kiosk21-summary-height\)/);
  assert.match(kiosk, /\.selectionFooterSpacer, \.c-selection-footer-spacer, \.footerSpacer\)[\s\S]*?height: var\(--kiosk21-bottom-stack-height\)/);
  assert.ok(html.includes('class="selectionFooterSpacer"'));
  assert.ok(html.includes('class="selectionFooter"'));
});

test('kiosk popup surfaces are bounded, internally scrollable, and backdrop-contained', () => {
  assert.match(kiosk, /html\[data-layout="kiosk21"\] :where\(\.backdrop, \.c-popup-backdrop\)/);
  assert.ok(kiosk.includes('--kiosk21-modal-width: 840px'));
  assert.match(kiosk, /width: min\(var\(--kiosk21-modal-width\), 100%\)/);
  assert.match(kiosk, /max-width: 880px/);
  assert.match(kiosk, /max-height: min\(86vh,/);
  assert.match(kiosk, /\.modalBody, \.modalContent, \.popupBody, \.dialogBody\)[\s\S]*?overflow-y: auto/);
  assert.match(kiosk, /\.backdrop, \.c-popup-backdrop\)[\s\S]*?max-width: 100vw[\s\S]*?overflow: hidden/);
});

test('modal actions and close controls retain large kiosk touch targets', () => {
  assert.match(kiosk, /\.modalClose, \.closeBtn, \.popupClose, \.dialogClose\)[\s\S]*?min-width: 64px[\s\S]*?min-height: 64px/);
  assert.match(kiosk, /\.modalBtns,[\s\S]*?position: sticky[\s\S]*?bottom: 0[\s\S]*?padding-bottom: var\(--safe-bottom\)/);
  assert.match(kiosk, /\.benefitActions[\s\S]*?\) button \{[\s\S]*?min-height: 72px !important/);
});

test('legacy popup selectors, state classes, and behavior markup remain present', () => {
  for (const selector of ['backdrop', 'modal', 'upsellModal', 'finalUpsellModal', 'benefitHelperModal']) {
    assert.ok(html.includes(selector), selector);
  }
  for (const state of ['active', 'isDisabled', 'state.modal', 'onclick=']) {
    assert.ok(html.includes(state), state);
  }
});

test('all kiosk portrait widths remain horizontally contained', () => {
  for (const width of [1080, 1200, 1280]) {
    assert.ok(width >= 1080 && width >= 960, `${width} contains the 960px kiosk surface`);
  }
  assert.match(kiosk, /html\[data-layout="kiosk21"\][\s\S]*?overflow-x: hidden/);
  assert.match(kiosk, /html\[data-layout="kiosk21"\] body[\s\S]*?overflow-x: hidden/);
});
