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

function fakeFirestore(now = () => Date.now(), { autoSnapshot = true } = {}) {
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
    for (const listener of listeners.get(pathName) || []) queueMicrotask(() => listener.next(snapshot(pathName)));
  };
  const ref = pathName => ({
    collection(name) { return collection(`${pathName}/${name}`); },
    async set(value) { documents.set(pathName, materialize(value)); notify(pathName); },
    async update(value) { documents.set(pathName, { ...(documents.get(pathName) || {}), ...materialize(value) }); notify(pathName); },
    onSnapshot(next, error) {
      const rows = listeners.get(pathName) || [];
      const listener = { next, error };
      rows.push(listener);
      listeners.set(pathName, rows);
      if (autoSnapshot) queueMicrotask(() => next(snapshot(pathName)));
      return () => listeners.set(pathName, (listeners.get(pathName) || []).filter(item => item !== listener));
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
    documents,
    emitSnapshot(pathName) {
      notify(pathName);
    },
    emitError(pathName, error) {
      for (const listener of listeners.get(pathName) || []) queueMicrotask(() => listener.error?.(error));
    }
  };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

async function captureInfo(run) {
  const original = console.info;
  const entries = [];
  console.info = (...args) => entries.push(args);
  try {
    await run(entries);
  } finally {
    console.info = original;
  }
}

test('kiosk listener registration does not report connected before the first snapshot', async () => {
  await captureInfo(async entries => {
    const transport = fakeFirestore(() => 1000, { autoSnapshot: false });
    const controller = createController({ role: 'kiosk', now: () => 1000, channelFactory: () => null, runtime: null });
    const kiosk = createKioskChannel({ ...transport, controller, kioskId: 'mobile-01', sessionId: 'listener-session' });
    try {
      await kiosk.start();
      assert.equal(entries.some(([message]) => message === '[remote-test-mode][kiosk] command-listener-first-snapshot'), false);
      assert.equal(entries.some(([message]) => message === '[remote-test-mode][kiosk] command-listener-connected'), false);
    } finally {
      kiosk.stop();
      controller.dispose();
    }
  });
});

test('kiosk reports listener success when the first command snapshot is received', async () => {
  await captureInfo(async entries => {
    const transport = fakeFirestore(() => 1000, { autoSnapshot: false });
    const controller = createController({ role: 'kiosk', now: () => 1000, channelFactory: () => null, runtime: null });
    const kiosk = createKioskChannel({ ...transport, controller, kioskId: 'mobile-01', sessionId: 'listener-session' });
    try {
      await kiosk.start();
      transport.emitSnapshot('runtimeControls/pangyo2-techno-valley/commands/mobile-01');
      await flush();
      const success = entries.find(([message]) => message === '[remote-test-mode][kiosk] command-listener-first-snapshot');
      assert.ok(success);
      assert.deepEqual(success[1], {
        exists: false,
        path: 'runtimeControls/pangyo2-techno-valley/commands/mobile-01',
        storeId: 'pangyo2-techno-valley',
        kioskId: 'mobile-01',
        sessionId: 'listener-session'
      });
    } finally {
      kiosk.stop();
      controller.dispose();
    }
  });
});

test('kiosk and admin listener errors log diagnostics and preserve status delivery', async () => {
  await captureInfo(async entries => {
    const transport = fakeFirestore(() => 1000, { autoSnapshot: false });
    const kioskStatuses = [];
    const adminStatuses = [];
    const kioskController = createController({ role: 'kiosk', now: () => 1000, channelFactory: () => null, runtime: null });
    const adminController = createController({ role: 'admin', now: () => 1000, channelFactory: () => null, runtime: null });
    const kiosk = createKioskChannel({
      ...transport,
      controller: kioskController,
      kioskId: 'mobile-01',
      sessionId: 'listener-session',
      onStatus: status => kioskStatuses.push(status)
    });
    const admin = createAdminChannel({
      ...transport,
      controller: adminController,
      user: { uid: 'admin-1' },
      kioskId: 'mobile-01',
      onStatus: status => adminStatuses.push(status)
    });
    try {
      await kiosk.start();
      await admin.start();
      const kioskError = Object.assign(new Error('command denied'), { code: 'permission-denied' });
      const adminError = Object.assign(new Error('presence unavailable'), { code: 'unavailable' });
      transport.emitError('runtimeControls/pangyo2-techno-valley/commands/mobile-01', kioskError);
      transport.emitError('runtimeControls/pangyo2-techno-valley/kiosks/mobile-01', adminError);
      await flush();

      const kioskLog = entries.find(([message]) => message === '[remote-test-mode][kiosk] command-listener-error');
      assert.deepEqual(kioskLog?.[1], {
        path: 'runtimeControls/pangyo2-techno-valley/commands/mobile-01',
        storeId: 'pangyo2-techno-valley',
        kioskId: 'mobile-01',
        sessionId: 'listener-session',
        code: 'permission-denied',
        message: 'command denied'
      });
      assert.equal(kioskStatuses.at(-1)?.phase, 'error');
      assert.equal(kioskStatuses.at(-1)?.error, kioskError);

      const adminLog = entries.find(([message]) => message === '[remote-test-mode][admin] presence-listener-error');
      assert.deepEqual(adminLog?.[1], {
        path: 'runtimeControls/pangyo2-techno-valley/kiosks/mobile-01',
        storeId: 'pangyo2-techno-valley',
        kioskId: 'mobile-01',
        code: 'unavailable',
        message: 'presence unavailable'
      });
      assert.equal(adminStatuses.at(-1)?.phase, 'error');
      assert.equal(adminStatuses.at(-1)?.error, adminError);
    } finally {
      kiosk.stop();
      admin.stop();
      kioskController.dispose();
      adminController.dispose();
    }
  });
});

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
  kiosk.stop();
  const enableRequestId = await admin.requestEnable();
  assert.equal(adminController.isEnabled(), false, 'enable ACK 전 관리자 상태를 켜짐으로 확정하지 않는다');
  assert.equal(adminStatuses.at(-1), 'requesting-enable');
  await kiosk.start();
  await flush();
  await flush();
  assert.equal(kioskController.isEnabled(), true);
  assert.equal(kioskController.getActiveRequestId(), enableRequestId);
  assert.ok(kioskStatuses.includes('applied'));
  assert.equal(adminController.isEnabled(), true);
  assert.ok(adminStatuses.indexOf('requesting-enable') < adminStatuses.indexOf('enabled-confirmed'));
  assert.equal(adminStatuses.at(-1), 'enabled-confirmed', '동일 requestId와 sessionId ACK 후에만 적용 완료');
  kiosk.stop();
  const disableRequestId = await admin.requestDisable();
  assert.equal(adminController.isEnabled(), true, 'disable ACK 전 기존 적용 상태를 유지한다');
  assert.equal(adminStatuses.at(-1), 'requesting-disable');
  await kiosk.start();
  await flush();
  await flush();
  assert.notEqual(disableRequestId, enableRequestId);
  assert.equal(kioskController.isEnabled(), false);
  assert.equal(adminController.isEnabled(), false);
  assert.equal(adminStatuses.at(-1), 'disabled-confirmed');
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

test('a failed initial presence write does not prevent heartbeat recovery or create duplicate timers', async () => {
  const transport = fakeFirestore();
  const controller = createController({ role: 'kiosk', channelFactory: () => null, runtime: null });
  const originalCollection = transport.db.collection;
  let presenceAttempts = 0;
  let commandSubscriptions = 0;
  transport.db.collection = name => {
    const collection = originalCollection(name);
    return {
      doc(id) {
        const document = collection.doc(id);
        const originalSubcollection = document.collection;
        document.collection = child => {
          const nested = originalSubcollection(child);
          return {
            doc(nestedId) {
              const ref = nested.doc(nestedId);
              if (child === 'kiosks') {
                const originalSet = ref.set;
                ref.set = async value => {
                  presenceAttempts += 1;
                  if (presenceAttempts === 1) throw new Error('offline');
                  return originalSet(value);
                };
              }
              if (child === 'commands') {
                const originalOnSnapshot = ref.onSnapshot;
                ref.onSnapshot = next => {
                  commandSubscriptions += 1;
                  return originalOnSnapshot(next);
                };
              }
              return ref;
            }
          };
        };
        return document;
      }
    };
  };
  const statuses = [];
  const kiosk = createKioskChannel({ ...transport, controller, onStatus: value => statuses.push(value.phase) });
  await kiosk.start();
  await kiosk.start();
  assert.equal(statuses.includes('error'), true);
  assert.equal(commandSubscriptions, 1, 'start is idempotent');
  await kiosk.publishPresence();
  assert.equal(statuses.at(-1), 'connected');
  kiosk.stop();
  controller.dispose();
});

test('admin expires a stale presence without requiring another Firestore snapshot', async () => {
  let now = 500000;
  const heartbeatTime = now;
  const transport = fakeFirestore(() => now);
  await transport.db.collection('runtimeControls').doc('pangyo2-techno-valley').collection('kiosks').doc('mobile-01').set({
    storeId: 'pangyo2-techno-valley', kioskId: 'mobile-01', sessionId: 'stale-session', role: 'kiosk',
    heartbeatAt: { toMillis: () => heartbeatTime }
  });
  const controller = createController({ role: 'admin', now: () => now, channelFactory: () => null, runtime: null });
  const admin = createAdminChannel({ ...transport, controller, now: () => now, presenceStaleMs: 10 });
  try {
    await admin.start();
    await flush();
    assert.equal(admin.getStatus().targetSessionId, 'stale-session');
    now += 11;
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(admin.getStatus().targetSessionId, null);
  } finally {
    admin.stop();
    controller.dispose();
  }
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
  assert.equal(statuses.includes('enabled-confirmed'), false);
  assert.equal(controller.isEnabled(), false, 'timeout은 관리자 실제 상태를 변경하지 않는다');
  admin.stop();
  controller.dispose();
});

test('a forged ACK cannot move the admin controller to confirmed state', async () => {
  let now = 400000;
  const transport = fakeFirestore(() => now);
  const presenceRef = transport.db.collection('runtimeControls').doc('pangyo2-techno-valley').collection('kiosks').doc('mobile-01');
  await presenceRef.set({
    storeId: 'pangyo2-techno-valley', kioskId: 'mobile-01', sessionId: 'target-session', role: 'kiosk',
    heartbeatAt: { toMillis: () => now }
  });
  const statuses = [];
  const controller = createController({ role: 'admin', now: () => now, channelFactory: () => null, runtime: null });
  const admin = createAdminChannel({ ...transport, controller, user: { uid: 'admin-1' }, now: () => now, ackTimeoutMs: 100, onStatus: value => statuses.push(value.phase) });
  await admin.start();
  await flush();
  const requestId = await admin.requestEnable();
  const commandRef = transport.db.collection('runtimeControls').doc('pangyo2-techno-valley').collection('commands').doc('mobile-01');
  await commandRef.update({
    ack: {
      requestId, kioskId: 'mobile-01', sessionId: 'target-session',
      action: 'disable', applied: true, enabled: true
    },
    acknowledgedAt: { toMillis: () => now }
  });
  await flush();
  assert.equal(controller.isEnabled(), false);
  assert.equal(statuses.includes('enabled-confirmed'), false);
  assert.equal(admin.getStatus().phase, 'requesting-enable');
  admin.stop();
  controller.dispose();
});

test('security rules separate runtime control from orders and restrict request and ACK writes', () => {
  assert.match(rules, /match \/runtimeControls\/\{storeId\}\/commands\/\{kioskId\}/);
  assert.match(rules, /function isKiosk\(storeId, kioskId\)/);
  assert.match(rules, /allow read: if isAdmin\(\) \|\| isKiosk\(storeId, kioskId\)/);
  assert.match(rules, /allow create, update: if isKiosk\(storeId, kioskId\)/);
  assert.match(rules, /allow update: if isKiosk\(storeId, kioskId\)/);
  assert.match(rules, /request\.resource\.data\.requestedBy == request\.auth\.uid/);
  assert.match(rules, /expiresAt <= request\.time \+ duration\.value\(30, 'm'\)/);
  assert.match(rules, /affectedKeys\(\)\.hasOnly\(\[\s*'ack','acknowledgedAt'/);
  assert.match(rules, /ack\.sessionId == resource\.data\.targetSessionId/);
  assert.doesNotMatch(html.match(/function buildMobileOrderPayload\(\)\{[\s\S]*?\n}\nasync function submitMobileOrder/)?.[0] || '', /runtimeControls|requestId|testMode/);
});
