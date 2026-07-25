'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BUSINESS_HOURS,
  getStatus,
  isOpen,
  millisecondsUntilNextBoundary
} = require('../business-hours.js');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/business-hours.css'), 'utf8');

function seoulTime(iso) {
  return new Date(`${iso}+09:00`);
}

test('business hours use the single Asia/Seoul configuration', () => {
  assert.deepEqual(BUSINESS_HOURS, {
    timeZone: 'Asia/Seoul',
    open: '11:00',
    close: '21:30',
    checkIntervalMs: 15000
  });
});

test('opening and closing boundary values are exact', () => {
  assert.equal(getStatus(seoulTime('2026-07-25T10:59:59')), 'before-open');
  assert.equal(isOpen(seoulTime('2026-07-25T10:59:59')), false);
  assert.equal(getStatus(seoulTime('2026-07-25T11:00:00')), 'open');
  assert.equal(isOpen(seoulTime('2026-07-25T11:00:00')), true);
  assert.equal(getStatus(seoulTime('2026-07-25T21:29:59')), 'open');
  assert.equal(isOpen(seoulTime('2026-07-25T21:29:59')), true);
  assert.equal(getStatus(seoulTime('2026-07-25T21:30:00')), 'after-close');
  assert.equal(isOpen(seoulTime('2026-07-25T21:30:00')), false);
});

test('the precise timeout targets the next boundary', () => {
  assert.equal(millisecondsUntilNextBoundary(seoulTime('2026-07-25T10:59:59')), 1000);
  assert.equal(millisecondsUntilNextBoundary(seoulTime('2026-07-25T21:29:59')), 1000);
  assert.equal(millisecondsUntilNextBoundary(seoulTime('2026-07-25T21:30:00')), 48600000);
});

test('Asia/Seoul checks do not depend on the host timezone', () => {
  assert.equal(getStatus(new Date('2026-07-25T01:59:59Z')), 'before-open');
  assert.equal(getStatus(new Date('2026-07-25T02:00:00Z')), 'open');
  assert.equal(getStatus(new Date('2026-07-25T12:30:00Z')), 'after-close');
});

test('order submission and Firestore persistence have independent closing guards', () => {
  const complete = html.match(/async function complete\(event\)\{[\s\S]*?\n}\n\n\/\* v43/)?.[0] || '';
  const submit = html.match(/async function submitMobileOrder\(\)\{[\s\S]*?\n}\n\nasync function complete/)?.[0] || '';
  assert.match(complete, /if\(!assertBusinessOpen\(\)\)return/);
  assert.match(complete, /if\(!assertBusinessOpen\(\)\)return[\s\S]*?await submitMobileOrder\(\)/);
  assert.ok((submit.match(/assertBusinessOpen\(\)/g) || []).length >= 3);
  assert.match(submit, /assertBusinessOpen\(\)[\s\S]*?db\.collection\('orders'\)\.doc\(\)/);
  assert.match(submit, /transaction\.get[\s\S]*?assertBusinessOpen\(\)[\s\S]*?transaction\.set\(orderRef,payload\)/);
});

test('closing reuses the complete order reset and the screen is portrait-safe', () => {
  assert.match(html, /function forceBusinessHoursClosure\(\)\{\s*reset\(\);/);
  assert.match(css, /\.businessHoursScreen\s*\{[\s\S]*?min-height:\s*100vh;[\s\S]*?width:\s*100%;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.businessHoursPanel\s*\{[\s\S]*?width:\s*min\(880px,\s*100%\)/);
});
