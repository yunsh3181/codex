'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'admin/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'admin.css'), 'utf8');
const script = fs.readFileSync(path.join(root, 'admin-inquiries.js'), 'utf8');

test('loads the inquiry client only from the authenticated admin page', () => {
  assert.match(html, /<script src="\.\.\/admin-inquiries\.js\?v=1\.2\.0"><\/script>/);
  for (const customerPage of ['index.html', 'seat/index.html', 'waiting-tv/index.html']) {
    const source = fs.readFileSync(path.join(root, customerPage), 'utf8');
    assert.doesNotMatch(source, /admin-inquiries\.js/);
  }
});

test('uses the ERP notification GET and PATCH contract with a Firebase ID token', () => {
  assert.match(script, /https:\/\/erp\.papabottle\.com\/api\/public\/inquiries\/notifications/);
  assert.match(script, /getIdToken\(\)/);
  assert.match(script, /authorization: `Bearer \$\{token\}`/);
  assert.match(script, /method: 'PATCH'/);
  assert.match(script, /body: JSON\.stringify\(\{ id \}\)/);
  assert.doesNotMatch(script, /db\.collection|\.onSnapshot\(|firebase\.firestore/);
  assert.doesNotMatch(script, /(?:apiKey|accessToken|refreshToken)\s*[:=]\s*['"][^'"]+['"]/);
});

test('provides badge, modal, status, toast and optional browser notification controls', () => {
  for (const id of [
    'inquiryNotificationButton', 'inquiryNotificationBadge', 'inquiryNotificationModal',
    'inquiryNotificationList', 'inquiryNotificationStatus', 'closeInquiryNotifications',
    'inquiryToast', 'inquiryToastText', 'openInquiryNotificationsFromToast',
    'enableBrowserNotifications'
  ]) assert.match(html, new RegExp(`id="${id}"`), id);
  assert.match(script, /new Notification\('PAPA BOTTLE 신규 문의'/);
  assert.match(script, /Notification\.requestPermission\(\)/);
  assert.match(script, /Notification\.permission !== 'granted'/);
});

test('updates unread state and renders inquiry values with safe DOM APIs', () => {
  assert.match(script, /item\.isUnread === true/);
  assert.match(script, /inquiries = inquiries\.map\(item => item\.id === id \? \{ \.\.\.item, isUnread: false \}/);
  assert.match(script, /document\.createElement\('article'\)/);
  assert.match(script, /description\.textContent =/);
  assert.match(script, /list\.replaceChildren\(\)/);
  assert.doesNotMatch(script, /\.innerHTML\s*=/);
  assert.match(script, /safeErpUrl/);
  assert.match(script, /url\.origin === 'https:\/\/erp\.papabottle\.com'/);
});

test('keeps polling isolated, paced and stopped for hidden or unauthenticated sessions', () => {
  assert.match(script, /const POLL_MS = 20_000/);
  assert.match(script, /if \(!running \|\| document\.hidden/);
  assert.match(script, /clearTimeout\(timer\)/);
  assert.match(script, /onAuthStateChanged\?\.\(async user/);
  assert.match(script, /claims\?\.claims\?\.admin === true/);
  assert.match(script, /catch \(error\) \{[\s\S]*?console\.warn\('파파보틀 문의 알림을 갱신하지 못했습니다\.'\)/);
  assert.doesNotMatch(script, /throw error/);
});

test('keeps the inquiry global isolated and exposes the required UI styling contract', () => {
  assert.match(script, /window\.PapaBottleInquiryAlerts = Object\.freeze\(\{ poll, start, stop \}\)/);
  assert.doesNotMatch(script, /window\.(?!PapaBottleInquiryAlerts)[A-Za-z_$][\w$]*\s*=/);
  for (const selector of [
    '.inquiry-notification-button', '.inquiry-notification-badge', '.inquiry-notification-modal',
    '.inquiry-notification-panel', '.inquiry-alert-card', '.inquiry-alert-detail',
    '.inquiry-alert-actions', '.inquiry-toast'
  ]) assert.ok(css.includes(selector), selector);
});

test('keeps inquiry markup IDs unique within the admin document', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual(duplicates, []);
});
