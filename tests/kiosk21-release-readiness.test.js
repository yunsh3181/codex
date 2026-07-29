const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const kiosk = read('styles/device-kiosk21.css');
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

test('release changes do not alter protected application sources', () => {
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(pkg.version, '1.2.15');
  assert.equal(lock.version, '1.2.15');
  assert.equal(lock.packages[''].version, '1.2.15');
  assert.equal(sha256(html), '407298b107293bfb68c112a5da3ecc04ad08c58bcfa8608f6bdf22665840dc64');
  assert.equal(sha256(read('device-manager.js')), '83ce3316c896d34cfb29e3d8c9454a8e628ba4830d8031ece159e9abd5f10e09');
  assert.equal(sha256(read('styles/device-phone.css')), '55efc4717528239302e2d6c8b208eb1c908cdd6ee1b56c86434fcde21aec12ad');
  assert.equal(sha256(read('styles/device-tablet.css')), '67326feeb53d7201b82265c300bf1ea241206c794dede25c2487159fefb62e50');
  assert.equal(sha256(kiosk), 'b8060900df2518469f71662017e1cf3bfe3c4facbe9cbf19dc26105c90901b02');
  assert.equal(sha256(read('kiosk-scroll-indicator.js')), 'b4aa9f1a60a94bea90da79793a300cc838a872b2c451c00ec7597753a393b95d');
});

test('order state cart price discount IDs and Firestore payload stay guarded', () => {
  for (const token of [
    'const state={', 'cartItems:[]', 'currentOrderTotal', 'cartTotal', 'price()',
    'discount', 'id:', "db.collection('orders').doc()", 'buildMobileOrderPayload',
    'submitMobileOrder', 'payment_pending',
  ]) assert.ok(html.includes(token), token);
  assert.match(html, /if\(!Array\.isArray\(payload\.items\)\|\|payload\.items\.length<1\|\|payload\.items\.length>30\)/);
  assert.match(html, /if\(!Number\.isFinite\(payload\.total\)\|\|payload\.total<0\|\|payload\.total>3000000\)/);
});

test('completion remains behind successful order persistence', () => {
  const submit = html.indexOf('await submitMobileOrder();');
  const done = html.indexOf("state.step='done';render();", submit);
  assert.ok(submit > 0);
  assert.ok(done > submit);
  const handler = html.match(/async function handlePaymentSubmit[\s\S]*?\n}\ndocument\.addEventListener\('click'/)?.[0] || '';
  assert.match(handler, /finally\{[\s\S]*?mobileOrderSubmitting=false;/);
  assert.doesNotMatch(handler, /if\(state\.step==='payment'\)mobileOrderSubmitting=false;/);
});

test('safe-area tokens cover every kiosk edge and fixed surface', () => {
  for (const token of ['--safe-top', '--safe-right', '--safe-bottom', '--safe-left']) {
    assert.ok(kiosk.includes(`var(${token})`), token);
  }
  for (const surface of ['.head', '.stage', '.selectionFooter', '.cartbar', '.backdrop']) {
    assert.ok(kiosk.includes(surface), surface);
  }
});

test('takeout timing descriptions are doubled and use kiosk yellow', () => {
  assert.match(html, /body\[data-step="timing"\] \.grid\.two\.timingChoiceGrid \.card p\{[\s\S]*?color:var\(--v10-yellow\)!important;[\s\S]*?font-size:34px!important/);
  assert.match(html, /@media\(max-width:560px\)\{[\s\S]*?timingChoiceGrid \.card p\{font-size:32px!important\}/);
});

test('language and large-order rendering remain dynamic and non-destructive', () => {
  for (const locale of ['ko', 'en', 'ja', 'zh', 'vi', 'es']) assert.ok(html.includes(locale), locale);
  assert.ok(html.includes('cartItems.map'));
  assert.ok(html.includes('reviewOrderList'));
  assert.match(kiosk, /\.reviewOrderHead h3,[\s\S]*?overflow-wrap: anywhere/);
  assert.match(kiosk, /\.cartOrderPrice,[\s\S]*?white-space: nowrap/);
  assert.ok(kiosk.includes('.multiCartTotal strong'));
});

test('release validation contains no network-driving test hooks', () => {
  const thisFile = fs.readFileSync(__filename, 'utf8');
  const regressionFile = read('tests/kiosk21-full-regression.test.js');
  const forbiddenTokens = [
    ['firebase.', 'firestore()'], ['.ad', 'd('], ['.se', 't('],
    ['fet', 'ch('], ['XMLHttp', 'Request'],
  ].map(parts => parts.join(''));
  for (const forbidden of forbiddenTokens) {
    assert.equal(thisFile.includes(forbidden), false, forbidden);
    assert.equal(regressionFile.includes(forbidden), false, forbidden);
  }
});
