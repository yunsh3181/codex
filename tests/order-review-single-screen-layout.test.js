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
  for (const [layout, css] of [['phone', phone], ['tablet', tablet]]) {
    assert.match(css, new RegExp(`html\\[data-layout="${layout}"\\] body\\[data-step="review"\\] \\.reviewOrderCard`));
    assert.match(css, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    assert.match(css, new RegExp(`html\\[data-layout="${layout}"\\] body\\[data-step="review"\\] \\.cartPizzaPriceBreakdown`));
  }
  assert.match(kiosk, /body\[data-step="review"\] \.reviewOrderCard\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto/);
  assert.doesNotMatch(kiosk, /body\[data-step="review"\] \.reviewOrderCard\s*\{[\s\S]{0,180}?grid-template-columns:\s*repeat\(2/);
  assert.match(kiosk, /body\[data-step="review"\][\s\S]*?word-break:\s*keep-all/);
  assert.match(kiosk, /\.cartOrderActions button\s*\{[\s\S]*?min-width:\s*56px;[\s\S]*?min-height:\s*56px/);
  assert.doesNotMatch(`${phone}\n${tablet}\n${kiosk}`, /body\[data-step="(?:pizza|side|drink|topping)"\][^{]*\.reviewOrderCard/);
});

test('mobile review keeps item names, quantities, and prices visible', () => {
  assert.match(phone, /\.cartItemSummary\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;/);
  assert.doesNotMatch(phone, /\.cartItemQuantity\s*\{[\s\S]*?display:\s*none/);
  assert.doesNotMatch(phone, /body\[data-step="review"\][\s\S]{0,120}(?:text-overflow:\s*ellipsis|-webkit-line-clamp)/);
  assert.match(phone, /\.cartItemName\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(
    phone,
    /:is\([\s\S]*?\.cartPizzaPriceLine\.discount > span,[\s\S]*?\.cartBenefitRow > span,[\s\S]*?\.cartBenefitRow > strong[\s\S]*?\)\s*\{[\s\S]*?line-height:\s*15px;[\s\S]*?padding-bottom:\s*2px;/
  );
  assert.match(
    phone,
    /:is\([\s\S]*?\.cartPizzaPriceLine\.discount,[\s\S]*?\.cartBenefitRow[\s\S]*?\)\s*\{[\s\S]*?padding-block:\s*0;/
  );
  assert.match(phone, /\.reviewDiscountBox\s*\{[\s\S]*?padding-block:\s*1px;/);
});

test('mobile review brand reuses localized data in a scoped three-line header', () => {
  const shell = html.slice(html.indexOf('function shell(c)'), html.indexOf('function toppingVisual'));
  assert.match(
    shell,
    /class="brandLogo"[\s\S]*?class="brandName">\$\{t\('home\.location'\)\}[\s\S]*?class="reviewBrandTagline">\$\{t\('home\.tagline'\)\}/
  );
  assert.match(phone, /body\[data-step="review"\] \.brand\s*\{[\s\S]*?grid-template-rows:\s*10px 22px 9px/);
  assert.match(phone, /body\[data-step="review"\] \.langTopBtn\s*\{[\s\S]*?width:\s*110px[\s\S]*?height:\s*44px/);
  assert.doesNotMatch(tablet, /reviewBrandTagline/);
  assert.doesNotMatch(kiosk, /reviewBrandTagline/);
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

test('kiosk single-page review requires a measured fit at every card count', () => {
  const source = html.slice(html.indexOf('function fitOrderReview()'), html.indexOf('function changeReviewPage'));
  assert.doesNotMatch(source, /cards\.length\s*<=\s*4\s*\|\|\s*fits\(\)/);
  assert.match(source, /if\(fits\(\)\)reviewPages=\[cards\.map/);
  assert.match(source, /reviewCompact1[\s\S]*?fits\(\)[\s\S]*?reviewCompact2[\s\S]*?fits\(\)/);
  assert.match(source, /else\{[\s\S]*?reviewPaginated[\s\S]*?reviewPages\.push/);
});
