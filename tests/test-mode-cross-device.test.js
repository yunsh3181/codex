'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createController } = require('../after-hours-test-mode.js');
const { createKioskChannel, createAdminChannel } = require('../test-mode-remote-channel.js');

const root = path.resolve(__dirname, '..');
const rules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function fakeFirestore(now = () => Date.now()) {
  const documents = new Map();
  const listeners = new Map();
  const serverTimestamp = Symbol('serverTimestamp');
  const materialize = value => {
    if (value === serverTimestamp) return { toMillis: () => now(), toDate: () => new Date(now()) };
    if (Array.isArray(value)) return value.map(materialize);
    if (value && typeof value === 'object' && typeof value.toMillis !== 'function') {
      return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, materialize(nested)]));
    }
    return value;
  };
  const snapshot = pathName => ({
    exists: documents.has(pathName),
    data: () => documents.get(pathName)
  });
  const notify = pathName => {
    for (const listener of listeners.get(pathName) || []) queueMicrotask(() => listener(snapshot(pathName)));
  };
  const ref = pathName => ({
    collection(name) { return collection(`${pathName}/${name}`); },
    async set(value) { documents.set(pathName, materialize(value)); notify(pathName); },
    async update(value) { documents.set(pathName, { ...(documents.get(pathName) || {}), ...materialize(value) }); notify(pathName); },
    onSnapshot(next) {
      const rows = listeners.get(pathName) || [];
      rows.push(next);
      listeners.set(pathName, rows);
      queueMicrotask(() => next(snapshot(pathName)));
      return () => listeners.set(pathName, (listeners.get(pathName) || []).filter(item => item !== next));
    }
  });
  const collection = pathName => ({ doc(id) { return ref(`${pathName}/${id}`); } });
  return {
    db: { collection },
    firebase: {
      firestore: {
        FieldValue: { serverTimestamp: () => serverTimestamp },
        Timestamp: { fromMillis: milliseconds => ({ toMillis: () => milliseconds, toDate: () => new Date(milliseconds) }) }
      }
    },
    documents
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test('remote Firestore delivery works without BroadcastChannel or Electron IPC and ACK gates applied state', async () => {
  let now = 100000;
  const transport = fakeFirestore(() => now);
  const kioskController = createController({ role: 'kiosk', now: () => now, channelFactory: () => null, runtime: null });
  const adminController = createController({ role: 'admin', now: () => now, channelFactory: () => null, runtime: null });
  const kioskStatuses = [];
  const adminStatuses = [];
  const kiosk = createKioskChannel({ ...transport, controller: kioskController, kioskId: 'mobile-01', sessionId: 'session-a', now: () => now, onStatus: value => kioskStatuses.push(value.phase) });
  const admin = createAdminChannel({ ...transport, controller: adminController, user: { uid: 'admin-1' }, kioskId: 'mobile-01', now: () => now, ackTimeoutMs: 50, onStatus: value => adminStatuses.push(value.phase) });
  await kiosk.start();
  await admin.start();
  await flush();
  const enableRequestId = await admin.requestEnable();
  assert.ok(adminStatuses.indexOf('requesting') >= 0, 'ACK 전 요청 중 상태를 거친다');
  await flush();
  await flush();
  assert.equal(kioskController.isEnabled(), true);
  assert.equal(kioskController.getActiveRequestId(), enableRequestId);
  assert.ok(kioskStatuses.includes('applied'));
  assert.ok(adminStatuses.indexOf('requesting') < adminStatuses.indexOf('applied'));
  assert.equal(adminStatuses.at(-1), 'applied', '동일 requestId와 sessionId ACK 후에만 적용 완료');
  const disableRequestId = await admin.requestDisable();
  await flush();
  await flush();
  assert.notEqual(disableRequestId, enableRequestId);
  assert.equal(kioskController.isEnabled(), false);
  assert.equal(adminStatuses.at(-1), 'off');
  kiosk.stop();
  admin.stop();
  kioskController.dispose();
  adminController.dispose();
});

test('duplicate requestId across simultaneous transports applies exactly once', () => {
  let changes = 0;
  const controller = createController({ role: 'kiosk', now: () => 1000, channelFactory: () => null, runtime: null, onChange: state => { if (state.enabled) changes += 1; } });
  const command = { action: 'enable', requestId: 'same-request', enabledAt: 1000, expiresAt: 2000 };
  assert.equal(controller.applyCommand(command, 'broadcast'), true);
  assert.equal(controller.applyCommand(command, 'remote'), false);
  assert.equal(changes, 1);
  controller.dispose();
});

test('expired requests and commands for an old kiosk session are rejected after restart', async () => {
  let now = 200000;
  const transport = fakeFirestore(() => now);
  const oldController = createController({ role: 'kiosk', now: () => now, channelFactory: () => null, runtime: null });
  const oldKiosk = createKioskChannel({ ...transport, controller: oldController, kioskId: 'mobile-01', sessionId: 'old-session', now: () => now });
  await oldKiosk.start();
  const commandRef = transport.db.collection('runtimeControls').doc('pangyo2-techno-valley').collection('commands').doc('mobile-01');
  await commandRef.set({
    storeId: 'pangyo2-techno-valley', kioskId: 'mobile-01', targetSessionId: 'old-session',
    action: 'enable', requestId: 'old-request', requestedAt: { toMillis: () => now - 1000 },
    expiresAt: { toMillis: () => now + 10000 }, ack: null
  });
  await flush();
  assert.equal(oldController.isEnabled(), true);
  oldKiosk.stop();
  oldController.dispose();
  const restartedController = createController({ role: 'kiosk', now: () => now, channelFactory: () => null, runtime: null });
  const restarted = createKioskChannel({ ...transport, controller: restartedController, kioskId: 'mobile-01', sessionId: 'new-session', now: () => now });
  await restarted.start();
  await flush();
  assert.equal(restartedController.isEnabled(), false, '이전 sessionId 명령은 재실행 후 자동 적용되지 않는다');
  await commandRef.set({
    storeId: 'pangyo2-techno-valley', kioskId: 'mobile-01', targetSessionId: 'new-session',
    action: 'enable', requestId: 'expired-request', requestedAt: { toMillis: () => now - 2000 },
    expiresAt: { toMillis: () => now - 1 }, ack: null
  });
  await flush();
  await flush();
  assert.equal(restartedController.isEnabled(), false);
  restarted.stop();
  restartedController.dispose();
});

test('ACK timeout reports no response and never reports applied', async () => {
  let now = 300000;
  const transport = fakeFirestore(() => now);
  await transport.db.collection('runtimeControls').doc('pangyo2-techno-valley').collection('kiosks').doc('mobile-01').set({
    storeId: 'pangyo2-techno-valley', kioskId: 'mobile-01', sessionId: 'silent-session', role: 'kiosk',
    heartbeatAt: { toMillis: () => now }
  });
  const statuses = [];
  const controller = createController({ role: 'admin', now: () => now, channelFactory: () => null, runtime: null });
  const admin = createAdminChannel({ ...transport, controller, user: { uid: 'admin-1' }, now: () => now, ackTimeoutMs: 10, onStatus: value => statuses.push(value.phase) });
  await admin.start();
  await flush();
  await admin.requestEnable();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(statuses.at(-1), 'no-response');
  assert.equal(statuses.includes('applied'), false);
  admin.stop();
  controller.dispose();
});

test('security rules separate runtime control from orders and restrict request and ACK writes', () => {
  assert.match(rules, /match \/runtimeControls\/\{storeId\}\/commands\/\{kioskId\}/);
  assert.match(rules, /allow create, update: if isAdmin\(\)/);
  assert.match(rules, /request\.resource\.data\.requestedBy == request\.auth\.uid/);
  assert.match(rules, /expiresAt <= request\.time \+ duration\.value\(30, 'm'\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\[\s*'ack','acknowledgedAt'/);
  assert.match(rules, /ack\.sessionId == resource\.data\.targetSessionId/);
  assert.doesNotMatch(html.match(/function buildMobileOrderPayload\(\)\{[\s\S]*?\n}\nasync function submitMobileOrder/)?.[0] || '', /runtimeControls|requestId|testMode/);
});
