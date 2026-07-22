const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DeviceManager, LayoutToken } = require('../device-manager.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const phoneCss = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const foundations = fs.readFileSync(path.join(root, 'styles/foundations.css'), 'utf8');
const compact = value => value.replace(/\s+/g, '');
const compactPhone = compact(phoneCss);
const layoutAt = (width, height) => new DeviceManager({
  viewportSource: { innerWidth: width, innerHeight: height },
}).current().layout;

test('full viewport matrix protects phone portrait activation', () => {
  const matrix = [
    [360, 420, LayoutToken.PHONE],
    [375, 667, LayoutToken.PHONE],
    [390, 844, LayoutToken.PHONE],
    [393, 852, LayoutToken.PHONE],
    [430, 932, LayoutToken.PHONE],
    [560, 900, LayoutToken.PHONE],
    [561, 900, LayoutToken.TABLET],
    [844, 390, LayoutToken.DEFAULT],
    [820, 1180, LayoutToken.TABLET],
    [1080, 1920, LayoutToken.KIOSK21],
    [1280, 720, LayoutToken.DEFAULT],
  ];
  matrix.forEach(([width, height, expected]) => {
    assert.equal(layoutAt(width, height), expected, `${width}x${height}`);
  });
});

test('phone device stylesheet owns every consolidated geometry family', () => {
  const selectors = [
    '.head', '.progress', '.stage', '.grid', '.card', '.optionBtn', '.qty',
    '.selectionFooter', '.cartbar', '.selectionFooterSpacer', '.backdrop',
    '.modal', '.phoneDisplay', '.paymentGrid', '.doneHomeBtn',
  ];
  selectors.forEach(selector => assert.ok(phoneCss.includes(selector), selector));
  assert.doesNotMatch(phoneCss, /^\s*@media/m);
  assert.match(phoneCss, /html\[data-layout="phone"\]/);
});

test('phone geometry contains horizontal overflow and preserves popup scrolling', () => {
  for (const rule of [
    'min-width:0',
    'max-width:100%',
    'grid-template-columns:minmax(0,1fr)!important',
    'overflow-x:hidden',
    'overflow-y:auto',
    'overscroll-behavior:contain',
  ]) assert.ok(compactPhone.includes(rule), rule);
});

test('legacy DOM selectors and order state classes remain intact', () => {
  const selectors = [
    '.head', '.progress', '.stage', '.grid', '.card', '.qty', '.cartbar',
    '.backdrop', '.modal', '.optionBtn', '.paymentCard', '.done',
  ];
  selectors.forEach(selector => {
    assert.ok(html.includes(selector) || foundations.includes(selector), selector);
  });
  for (const stateClass of ['active', 'disabled', 'selected', 'hidden', 'on', 'done']) {
    assert.match(html, new RegExp(`(?:classList|class=|\\.)[^\\n]{0,160}${stateClass}`));
  }
});

test('all required order and popup routes remain represented without script changes', () => {
  for (const step of [
    'language', 'home', 'party', 'area', 'table', 'timing', 'promo', 'setChoice',
    'size', 'mode', 'pizzaOptions', 'pizza', 'crust', 'topping', 'side', 'drink',
    'accompaniment', 'cartReview', 'review', 'phone', 'payment', 'done',
  ]) assert.ok(html.includes(`'${step}'`) || html.includes(`"${step}"`), step);

  for (const popup of [
    'upsellModal', 'finalUpsellModal', 'benefitHelperModal', 'disposablesModal',
  ]) assert.ok(html.includes(popup), popup);
});

test('order, cart, price, discount, menu IDs, and Firestore payload guards remain covered', () => {
  for (const invariant of [
    'cartItems', 'function price()', 'currentOrderTotal', '"id": "P001"', 'discount', 'payload',
    "db.collection('orders').doc", 'transaction.set(orderRef,payload)', 'phoneMasked', 'paymentMethod',
  ]) assert.ok(html.includes(invariant), invariant);
});
