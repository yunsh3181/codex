'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'scripts', 'verify-kiosk-idle-return-paths.js'), 'utf8');

test('Chromium evidence runner covers every required idle return path at 1080x1920', () => {
  assert.match(source, /window\.setContentSize\(1080, 1920\)/);
  for (const name of [
    '01-initial-idle',
    '02-order-start-home',
    '03-inactivity-warning',
    '04-automatic-expiry-idle',
    '05-manual-home-idle',
    '06-completed-order-idle',
    '07-happy-hour-idle',
    '08-set-menu-idle'
  ]) assert.match(source, new RegExp(name));
  assert.match(source, /expireOrderIdle\(orderIdleGeneration,true\)/);
  assert.match(source, /state\.step='done';state\.firebaseOrderId='completed-order'/);
  assert.match(source, /new Date\('2026-08-05T07:00:00Z'\)/);
  assert.match(source, /new Date\('2026-08-05T06:59:59Z'\)/);
});

test('Chromium evidence runner measures overflow and idle-only chrome', () => {
  for (const marker of ['horizontalOverflow', 'verticalOverflow', 'mainVerticalOverflow', 'imageFit', 'startVisible', 'cartVisible', 'scrollIndicatorVisible', 'consoleMessages']) {
    assert.match(source, new RegExp(marker));
  }
  assert.match(source, /size\.width !== 1080 \|\| size\.height !== 1920/);
  assert.match(source, /getComputedStyle\(image\)\.objectFit/);
});
