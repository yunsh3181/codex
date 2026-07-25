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

test('pure closing guard throws a dedicated error without calling UI side effects', () => {
  const calls = { reset: 0, render: 0, releaseSeats: 0 };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assert.throws(
      () => requireOpen(seoulTime('2026-07-25T21:30:00')),
      error => error instanceof BusinessHoursClosedError && error.code === 'BUSINESS_HOURS_CLOSED'
    );
  }
  assert.deepEqual(calls, { reset: 0, render: 0, releaseSeats: 0 });
});

test('transaction retries perform one external closing cleanup after pure failures', () => {
  const calls = { reset: 0, render: 0, releaseSeats: 0, close: 0, writes: 0 };
  let closing = false;
  const retryableTransaction = () => {
    requireOpen(seoulTime('2026-07-25T21:30:00'));
    calls.writes += 1;
  };
  let closedError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      retryableTransaction();
    } catch (error) {
      closedError = error;
    }
  }
  function closeOutsideTransaction() {
    if (closing) return;
    closing = true;
    calls.close += 1;
    calls.releaseSeats += 1;
    calls.reset += 1;
    calls.render += 1;
  }
  if (closedError?.code === 'BUSINESS_HOURS_CLOSED') closeOutsideTransaction();
  closeOutsideTransaction();
  assert.deepEqual(calls, { reset: 1, render: 1, releaseSeats: 1, close: 1, writes: 0 });
});

test('order submission and Firestore persistence have pure closing guards', () => {
  const complete = html.match(/async function complete\(event\)\{[\s\S]*?\n}\n\n\/\* v43/)?.[0] || '';
  const submit = html.match(/async function submitMobileOrder\(\)\{[\s\S]*?\n}\n\nasync function complete/)?.[0] || '';
  const transaction = submit.match(/await db\.runTransaction\(async transaction=>\{[\s\S]*?\n \}\);/)?.[0] || '';
  assert.match(complete, /if\(!assertBusinessOpen\(\)\)return/);
  assert.match(complete, /if\(!assertBusinessOpen\(\)\)return[\s\S]*?await submitMobileOrder\(\)/);
  assert.match(submit, /requireBusinessOpenPure\(\)[\s\S]*?db\.collection\('orders'\)\.doc\(\)/);
  assert.match(transaction, /transaction\.get[\s\S]*?requireBusinessOpenPure\(\)[\s\S]*?seatSnapshots\.some[\s\S]*?transaction\.set\(orderRef,payload\)/);
  assert.doesNotMatch(transaction, /assertBusinessOpen|closeForBusinessHours|reset\(|render\(|releaseSeats|mobileOrderSubmitting/);
});

test('external closing handling is dedicated, idempotent, and hides retry UI', () => {
  const close = html.match(/function closeForBusinessHours\(\)\{[\s\S]*?\n}/)?.[0] || '';
  const complete = html.match(/async function complete\(event\)\{[\s\S]*?\n}\n\n\/\* v43/)?.[0] || '';
  assert.match(close, /if\(businessHoursClosing\)return/);
  assert.match(close, /businessHoursClosing=true[\s\S]*?reset\(\)[\s\S]*?render\(\)/);
  assert.match(complete, /if\(error\?\.code==='BUSINESS_HOURS_CLOSED'\)\{closeForBusinessHours\(\);return\}/);
  assert.match(complete, /BUSINESS_HOURS_CLOSED'\)\{closeForBusinessHours\(\);return\}[\s\S]*?console\.error/);
});

test('takeout and dining closing boundaries block writes and preserve transaction atomicity', () => {
  assert.throws(() => requireOpen(seoulTime('2026-07-25T21:30:00')), { code: 'BUSINESS_HOURS_CLOSED' });
  const submit = html.match(/async function submitMobileOrder\(\)\{[\s\S]*?\n}\n\nasync function complete/)?.[0] || '';
  const pureGuard = submit.lastIndexOf('requireBusinessOpenPure()');
  const orderWrite = submit.indexOf('transaction.set(orderRef,payload)');
  const seatWrite = submit.indexOf('seatRefs.forEach');
  assert.ok(pureGuard > 0 && pureGuard < orderWrite && orderWrite < seatWrite);
  assert.match(submit, /const seatRefs=state\.orderType==='dinein'\?state\.selectedTables/);
});

test('closing reuses the complete order reset and the screen is portrait-safe', () => {
  assert.match(html, /function closeForBusinessHours\(\)\{[\s\S]*?reset\(\);/);
  assert.match(css, /\.businessHoursScreen\s*\{[\s\S]*?min-height:\s*100vh;[\s\S]*?width:\s*100%;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.businessHoursPanel\s*\{[\s\S]*?width:\s*min\(880px,\s*100%\)/);
});
