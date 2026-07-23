'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const network = fs.readFileSync(path.join(root, 'network-status.js'), 'utf8');
const desktop = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('customer kiosk runtime uses local static resources and shared relative paths', () => {
  assert.doesNotMatch(html, /<(?:script|link|img)\b[^>]+(?:src|href)=["']https?:\/\//i);
  assert.match(html, /src="assets\/vendor\/firebase\/firebase-app-compat\.js"/);
  assert.match(html, /src="assets\/vendor\/firebase\/firebase-firestore-compat\.js"/);
  assert.match(html, /src="i18n\/ko\.js\?v=/);
  assert.match(html, /const \{PIZZAS,CRUSTS,TOPPINGS,SIDES,DRINKS,SAUCES,SETTINGS\}=window\.KIOSK_DATA/);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'vendor', 'firebase', 'firebase-app-compat.js')));
  assert.ok(fs.existsSync(path.join(root, 'assets', 'vendor', 'firebase', 'firebase-firestore-compat.js')));
});

test('network state changes are observable without reload, cart reset, or offline queue', () => {
  assert.match(network, /navigator\.onLine/);
  assert.match(network, /addEventListener\('online'/);
  assert.match(network, /addEventListener\('offline'/);
  assert.match(network, /pj:network-status/);
  assert.doesNotMatch(network, /reload|localStorage|indexedDB/i);
  assert.match(html, /if\(!window\.PJ_NETWORK\.isOnline\(\)\)throw new Error/);
  assert.doesNotMatch(html, /offlineQueue|retryFailedOrder|indexedDB/i);
});

test('development request logging is private and production devtools remain disabled', () => {
  assert.match(desktop, /session\.webRequest\.onBeforeRequest/);
  assert.match(desktop, /resourceType: details\.resourceType/);
  assert.match(desktop, /firebase: isFirebase/);
  assert.match(desktop, /devTools: isDevelopment/);
  assert.doesNotMatch(desktop, /details\.uploadData/);
  assert.equal(packageJson.build.nsis.runAfterFinish, false);
  assert.match(packageJson.scripts['desktop:build:win'], /process\.platform !== 'win32'/);
});

test('Firebase config and protected order payload markers remain unchanged', () => {
  for (const marker of [
    'papajohns-kiosk.firebaseapp.com',
    "db.collection('orders').doc()",
    'transaction.set(orderRef,payload)',
    "source:'mobile-kiosk-v43.9.6'"
  ]) assert.ok(html.includes(marker), marker);
});
