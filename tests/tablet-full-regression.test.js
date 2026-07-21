const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceManager, LayoutToken } = require('../device-manager.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tablet = fs.readFileSync(path.join(root, 'styles/device-tablet.css'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const compact = value => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
const css = compact(tablet);
const layoutAt = (width, height) => new DeviceManager({
  viewportSource: { innerWidth: width, innerHeight: height },
}).current().layout;

test('complete viewport matrix preserves phone, tablet portrait, and default layouts', () => {
  const matrix = [
    [360, 420, LayoutToken.PHONE], [375, 667, LayoutToken.PHONE],
    [390, 844, LayoutToken.PHONE], [393, 852, LayoutToken.PHONE],
    [430, 932, LayoutToken.PHONE], [560, 900, LayoutToken.PHONE],
    [561, 900, LayoutToken.TABLET], [640, 960, LayoutToken.TABLET],
    [680, 1024, LayoutToken.TABLET], [768, 1024, LayoutToken.TABLET],
    [810, 850, LayoutToken.TABLET], [810, 1080, LayoutToken.TABLET],
    [820, 1180, LayoutToken.TABLET], [834, 1194, LayoutToken.TABLET],
    [1024, 1366, LayoutToken.TABLET], [844, 390, LayoutToken.DEFAULT],
    [1024, 768, LayoutToken.DEFAULT], [1080, 1920, LayoutToken.KIOSK21],
    [1280, 720, LayoutToken.DEFAULT],
  ];
  matrix.forEach(([width, height, expected]) => {
    assert.equal(layoutAt(width, height), expected, `${width}x${height}`);
  });
});

test('tablet layout tokens and primary geometry remain stable', () => {
  for (const declaration of [
    '--tablet-content-max:880px', '--tablet-header-height:80px',
    '--tablet-progress-height:56px', '--tablet-cta-height:104px',
    '--tablet-summary-height:92px', '--tablet-modal-width:720px',
    'max-width:760px', 'max-height:min(88vh',
    'grid-template-columns:48pxminmax(42px,1fr)48px!important',
    'width:48px!important', 'height:48px!important',
    'grid-template-columns:repeat(3,minmax(0,1fr))!important',
    'min-height:64px',
  ]) assert.ok(css.includes(declaration), declaration);
  assert.ok(css.includes('--tablet-stage-top-offset:calc(var(--tablet-header-height)+var(--tablet-progress-height)+var(--safe-top))'));
  assert.ok(css.includes('--tablet-bottom-stack-height:calc(var(--tablet-cta-height)+var(--tablet-summary-height)+var(--tablet-bottom-gap)+var(--safe-bottom))'));
});

test('tablet surfaces are runtime scoped and horizontally contained', () => {
  assert.match(tablet, /html\[data-layout="tablet"\]/);
  assert.doesNotMatch(tablet, /html\[data-layout="phone"\]/);
  assert.ok(css.includes('overflow-x:hidden'));
  for (const selector of [
    '.head', '.progress', '.stage', '.grid', '.card', '.optionBtn', '.qty',
    '.selectionFooter', '.cartbar', '.selectionFooterSpacer', '.backdrop',
    '.modal', '.phoneDisplay', '.keypad', '.paymentGrid', '.doneHomeBtn',
  ]) assert.ok(tablet.includes(selector), selector);
});

test('legacy selectors, state ownership, and complete order routes remain intact', () => {
  for (const state of ['active', 'disabled', 'selected', 'hidden', 'on', 'done', 'open']) {
    assert.ok(html.includes(state), state);
  }
  for (const route of [
    'language', 'home', 'party', 'area', 'table', 'timing', 'promo', 'setChoice',
    'size', 'mode', 'pizzaOptions', 'pizza', 'crust', 'half', 'topping', 'side',
    'drink', 'accompaniment', 'cartReview', 'review', 'phone', 'payment', 'done',
  ]) assert.ok(html.includes(`'${route}'`) || html.includes(`"${route}"`), route);
  for (const popup of [
    'upsellModal', 'finalUpsellModal', 'benefitHelperModal', 'discountModal',
    'setUpsellModal', 'disposablesModal',
  ]) assert.ok(html.includes(popup) || tablet.includes(popup), popup);
});

test('phone ownership remains independent from tablet regression coverage', () => {
  assert.match(phone, /html\[data-layout="phone"\]/);
  assert.ok(compact(phone).includes('width:42px!important'));
  assert.doesNotMatch(phone, /html\[data-layout="tablet"\]/);
});
