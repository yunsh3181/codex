const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceManager, LayoutToken } = require('../device-manager.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kiosk = fs.readFileSync(path.join(root, 'styles/device-kiosk21.css'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const tablet = fs.readFileSync(path.join(root, 'styles/device-tablet.css'), 'utf8');
const compact = value => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
const css = compact(kiosk);
const layoutAt = (width, height) => new DeviceManager({
  viewportSource: { innerWidth: width, innerHeight: height },
}).current().layout;

test('full viewport matrix preserves every device boundary', () => {
  const matrix = [
    [360, 420, LayoutToken.PHONE], [375, 667, LayoutToken.PHONE],
    [390, 844, LayoutToken.PHONE], [393, 852, LayoutToken.PHONE],
    [430, 932, LayoutToken.PHONE], [560, 900, LayoutToken.PHONE],
    [561, 900, LayoutToken.TABLET], [640, 960, LayoutToken.TABLET],
    [680, 1024, LayoutToken.TABLET], [768, 1024, LayoutToken.TABLET],
    [810, 1080, LayoutToken.TABLET], [820, 1180, LayoutToken.TABLET],
    [834, 1194, LayoutToken.TABLET], [1024, 1366, LayoutToken.TABLET],
    [1025, 1600, LayoutToken.KIOSK21], [1080, 1920, LayoutToken.KIOSK21],
    [1200, 1920, LayoutToken.KIOSK21], [1280, 1920, LayoutToken.KIOSK21],
    [1280, 2160, LayoutToken.KIOSK21], [844, 390, LayoutToken.DEFAULT],
    [1024, 768, LayoutToken.DEFAULT], [1280, 720, LayoutToken.DEFAULT],
    [1366, 768, LayoutToken.DEFAULT], [1920, 1080, LayoutToken.DEFAULT],
  ];
  matrix.forEach(([width, height, expected]) => {
    assert.equal(layoutAt(width, height), expected, `${width}x${height}`);
  });
  assert.equal(layoutAt(1024, 1600), LayoutToken.TABLET, '1024 portrait boundary');
  assert.equal(layoutAt(1025, 1600), LayoutToken.KIOSK21, '1025 portrait boundary');
});

test('kiosk layout tokens freeze the release geometry', () => {
  for (const declaration of [
    '--kiosk21-content-max:960px', '--kiosk21-page-padding:32px',
    '--kiosk21-header-height:108px', '--kiosk21-progress-height:76px',
    '--kiosk21-navigation-target:64px', '--kiosk21-cta-height:128px',
    '--kiosk21-cta-button-height:96px', '--kiosk21-summary-height:112px',
    '--kiosk21-modal-width:840px', 'width:64px!important', 'height:64px!important',
    'grid-template-columns:repeat(3,minmax(0,1fr))!important',
    'grid-template-columns:repeat(2,minmax(0,1fr))', 'min-height:72px',
  ]) assert.ok(css.includes(declaration), declaration);
  assert.ok(css.includes('--kiosk21-stage-top-offset:calc(var(--kiosk21-header-height)+var(--kiosk21-progress-height)+var(--safe-top))'));
  assert.ok(css.includes('--kiosk21-bottom-stack-height:calc(var(--kiosk21-cta-height)+var(--kiosk21-active-summary-height)+var(--kiosk21-bottom-gap)+var(--safe-bottom))'));
});

test('header progress stage and product surfaces stay contained', () => {
  for (const selector of [
    '.head', '.progress', '.stage', '.grid', '.card', '.optionBtn', '.qty',
    '.selectionFooter', '.summary', '.selectionFooterSpacer', '.backdrop', '.modal',
  ]) assert.ok(kiosk.includes(selector), selector);
  assert.ok(css.includes('overflow-x:hidden'));
  assert.ok(css.includes('overflow-y:auto'));
  assert.match(kiosk, /\.progress[\s\S]*?overflow-x: auto/);
  assert.match(kiosk, /\.stage,[\s\S]*?overflow-y: auto/);
  for (const state of ['active', 'selected', 'disabled', 'on', 'done']) {
    assert.ok(html.includes(state), state);
  }
});

test('summary-visible and summary-hidden stacks remain explicit', () => {
  assert.match(kiosk, /body:not\(\[data-step="home"\]\):not\(\[data-step="done"\]\):not\([\s\S]*?--kiosk21-active-summary-height: var\(--kiosk21-summary-height\)/);
  assert.ok(kiosk.includes('--kiosk21-active-summary-height: 0px'));
  assert.match(kiosk, /:where\(\.selectionFooterSpacer,[\s\S]*?height: var\(--kiosk21-bottom-stack-height\)/);
});

test('modal checkout keypad payment and completion geometry remain release-safe', () => {
  for (const declaration of [
    'width:min(var(--kiosk21-modal-width),100%)', 'max-height:min(86vh',
    'max-width:var(--kiosk21-content-max)', 'grid-template-columns:repeat(3,minmax(0,1fr))',
  ]) assert.ok(css.includes(declaration), declaration);
  assert.match(kiosk, /body\[data-step="phone"\] \.phoneDisplay[\s\S]*?min-height: 96px/);
  assert.match(kiosk, /body\[data-step="phone"\] \.keypad button[\s\S]*?min-height: 72px/);
  assert.match(kiosk, /body\[data-step="payment"\] \.paymentGrid[\s\S]*?repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(kiosk, /@media \(max-width: 760px\)[\s\S]*?body\[data-step="payment"\] \.paymentGrid[\s\S]*?grid-template-columns: minmax\(0, 1fr\)/);
  assert.match(kiosk, /body\[data-step="done"\] \.doneHomeBtn[\s\S]*?min-height: 80px/);
});

test('all ordering paths and popup families retain behavior markup', () => {
  for (const route of [
    'language', 'home', 'party', 'area', 'table', 'timing', 'reserve', 'promo',
    'setChoice', 'size', 'mode', 'pizzaOptions', 'pizza', 'crust', 'half',
    'topping', 'side', 'drink', 'accompaniment', 'cartReview', 'review',
    'phone', 'payment', 'done',
  ]) assert.ok(html.includes(`'${route}'`) || html.includes(`"${route}"`), route);
  for (const popup of [
    'upsellModal', 'finalUpsellModal', 'benefitHelperModal',
    'setSideUpsell', 'setDrinkUpsell', 'disposablesModal', 'halfConfirmModal',
  ]) assert.ok(html.includes(popup), popup);
});

test('phone and tablet ownership remain independent', () => {
  assert.match(phone, /html\[data-layout="phone"\]/);
  assert.match(tablet, /html\[data-layout="tablet"\]/);
  assert.doesNotMatch(kiosk, /html\[data-layout="(?:phone|tablet|default)"\]/);
  assert.doesNotMatch(phone, /html\[data-layout="kiosk21"\]/);
  assert.doesNotMatch(tablet, /html\[data-layout="kiosk21"\]/);
});
