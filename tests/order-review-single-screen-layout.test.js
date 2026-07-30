const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const tablet = fs.readFileSync(path.join(root, 'styles/device-tablet.css'), 'utf8');
const kiosk = fs.readFileSync(path.join(root, 'styles/device-kiosk21.css'), 'utf8');

test('order review uses device-scoped compact grids without changing other product cards', () => {
  for (const [layout, css] of [['phone', phone], ['tablet', tablet], ['kiosk21', kiosk]]) {
    assert.match(css, new RegExp(`html\\[data-layout="${layout}"\\] body\\[data-step="review"\\] \\.reviewOrderCard`));
    assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, new RegExp(`html\\[data-layout="${layout}"\\] body\\[data-step="review"\\] \\.cartPizzaPriceBreakdown`));
  }
  assert.doesNotMatch(`${phone}\n${tablet}\n${kiosk}`, /body\[data-step="(?:pizza|side|drink|topping)"\][^{]*\.reviewOrderCard/);
});

test('mobile review keeps item names, quantities, and prices visible', () => {
  assert.match(phone, /\.cartItemSummary\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;/);
  assert.doesNotMatch(phone, /\.cartItemQuantity\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(phone, /body\[data-step="review"\][\s\S]{0,120}(?:text-overflow:\s*ellipsis|-webkit-line-clamp)/);
  assert.match(phone, /\.cartItemName\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
});

test('pizza option pricing detail remains complete on the shared review renderer', () => {
  const source = html.slice(
    html.indexOf('function cartPizzaPriceBreakdownHtml'),
    html.indexOf('function cartOrderDetailHtml')
  );
  for (const field of ['base', 'crustFee', 'halfFee', 'toppingFee', 'normal', 'discount', 'final']) {
    assert.match(source, new RegExp(`pricing\\.${field}`), field);
  }
  assert.match(source, /pricing\.final,'final'/);
  assert.match(source, /money\(amount\)/);
});

test('review totals still derive discount and final payment from stored order amounts', () => {
  const source = html.slice(
    html.indexOf('function reviewTotals()'),
    html.indexOf('function price()')
  );
  assert.match(source, /orderDetailData\(o\)/);
  assert.match(source, /normal\+=d\.amount\.normal\*q/);
  assert.match(source, /final\+=d\.amount\.final\*q/);
  assert.match(source, /Math\.max\(0,normal-final\)/);
  assert.match(source, /class="line final"/);
  assert.match(source, /money\(totals\.final\)/);
});
