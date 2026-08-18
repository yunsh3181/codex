'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BUSINESS_HOURS,
  getStatus,
  isOpen,
  BusinessHoursClosedError,
  requireOpen,
  millisecondsUntilNextBoundary
} = require('../business-hours.js');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const seatTransaction = fs.readFileSync(path.join(root, 'kiosk-seat-transaction.js'), 'utf8');

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

test('order submission and Firestore persistence do not use business-hour guards', () => {
  const complete = html.match(/async function complete\(event\)\{[\s\S]*?\n}\n\n\/\* v43/)?.[0] || '';
  const submit = html.match(/async function submitMobileOrder\(\)\{[\s\S]*?\n}\n\nasync function complete/)?.[0] || '';
  assert.doesNotMatch(complete, /assertBusinessOpen|BUSINESS_HOURS_CLOSED/);
  assert.doesNotMatch(submit, /requireBusinessOpenPure|assertBusinessOpen|BUSINESS_HOURS_CLOSED/);
  assert.match(seatTransaction, /transaction\.get[\s\S]*?selectedSnapshots\.some[\s\S]*?transaction\.set\(orderRef,payload\)/);
});

test('kiosk startup and rendering never replace the order flow with a closed screen', () => {
  assert.doesNotMatch(html, /businessHoursClosedView|closeForBusinessHours|handleBusinessHoursChange/);
  assert.doesNotMatch(html, /dataset\.step='business-hours'|businessHoursMonitor/);
  assert.match(html, /function isOrderingAllowed\(\)\{return true\}/);
  assert.match(html, /\nrender\(\);\nwindow\.__PJ_BOOT_OK=true;/);
});

test('takeout and dining writes preserve transaction atomicity without time checks', () => {
  const submit = html.match(/async function submitMobileOrder\(\)\{[\s\S]*?\n}\n\nasync function complete/)?.[0] || '';
  const orderWrite = seatTransaction.indexOf('transaction.set(orderRef,payload)');
  const seatWrite = seatTransaction.indexOf('selected.forEach');
  assert.ok(orderWrite > 0 && orderWrite < seatWrite);
  assert.match(submit, /state\.orderType==='dinein'\)await window\.PJ_KIOSK_SEAT_TRANSACTION\.commitSeatOrder/);
});

test('business-hours settings remain available for admin and test-mode use', () => {
  assert.throws(
    () => requireOpen(seoulTime('2026-07-25T21:30:00')),
    error => error instanceof BusinessHoursClosedError && error.code === 'BUSINESS_HOURS_CLOSED'
  );
  assert.match(html, /function isBusinessOpen\(\)\{return window\.PJ_BUSINESS_HOURS\?window\.PJ_BUSINESS_HOURS\.isOpen\(\):true\}/);
});
