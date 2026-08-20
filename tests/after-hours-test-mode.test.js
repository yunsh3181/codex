'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DURATION_MS, OFF_STATE, normalizeState, createController } = require('../after-hours-test-mode.js');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const adminHtml = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const adminSource = fs.readFileSync(path.join(root, 'admin.js'), 'utf8');
const mainSource = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');

function channelPair() {
  const channels = [];
  return () => {
    const channel = {
      onmessage: null,
      postMessage(message) {
        for (const peer of channels) {
          if (peer !== channel) peer.onmessage?.({ data: structuredClone(message) });
        }
      },
      close() {
        const index = channels.indexOf(channel);
        if (index >= 0) channels.splice(index, 1);
      }
    };
    channels.push(channel);
    return channel;
  };
}

test('test mode is memory-only, defaults off, and expires at exactly 30 minutes', () => {
  assert.deepEqual(OFF_STATE, { enabled: false, enabledAt: null, expiresAt: null });
  assert.equal(DURATION_MS, 30 * 60 * 1000);
  assert.deepEqual(normalizeState({ enabled: true, enabledAt: 1000, expiresAt: 1000 + DURATION_MS }, 1001), {
    enabled: true,
    enabledAt: 1000,
    expiresAt: 1000 + DURATION_MS
  });
  assert.deepEqual(normalizeState({ enabled: true, enabledAt: 1000, expiresAt: 1000 + DURATION_MS }, 1000 + DURATION_MS), OFF_STATE);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'after-hours-test-mode.js'), 'utf8'), /localStorage|sessionStorage|firestore|URLSearchParams/i);
});

test('admin and kiosk exchange transient state and explicit disable without persistence', async () => {
  const channelFactory = channelPair();
  let now = 10_000;
  const admin = createController({ role: 'admin', now: () => now, channelFactory });
  const kiosk = createController({ role: 'kiosk', now: () => now, channelFactory });
  await admin.start();
  await kiosk.start();
  admin.enable();
  assert.equal(kiosk.isEnabled(), true);
  assert.equal(kiosk.getState().expiresAt, now + DURATION_MS);
  admin.disable('admin-disabled');
  assert.equal(kiosk.isEnabled(), false);
  admin.dispose();
  kiosk.dispose();
  const restarted = createController({ role: 'kiosk', now: () => now, channelFactory });
  assert.equal(restarted.isEnabled(), false);
  restarted.dispose();
});

test('closing an enabled admin session broadcasts OFF to every kiosk window', async () => {
  const channelFactory = channelPair();
  const admin = createController({ role: 'admin', channelFactory });
  const kioskA = createController({ role: 'kiosk', channelFactory });
  const kioskB = createController({ role: 'kiosk', channelFactory });
  await Promise.all([admin.start(), kioskA.start(), kioskB.start()]);
  admin.enable({ requestId: 'enable-all' });
  assert.equal(kioskA.isEnabled(), true);
  assert.equal(kioskB.isEnabled(), true);
  admin.dispose();
  assert.equal(kioskA.isEnabled(), false);
  assert.equal(kioskB.isEnabled(), false);
  kioskA.dispose();
  kioskB.dispose();
});

test('runtime lifecycle logs are ordered and dispose unsubscribes IPC state', async () => {
  const events = [];
  let unsubscribed = 0;
  const controller = createController({
    role: 'kiosk',
    channelFactory: () => ({ postMessage() {}, close() {} }),
    runtime: {
      async getState() { return OFF_STATE; },
      async setState() {},
      onState() { return () => { unsubscribed += 1; }; }
    },
    onLifecycle: entry => events.push(entry.event)
  });
  await controller.start();
  controller.enable({ requestId: 'runtime-on' });
  controller.disable('runtime-off');
  controller.dispose();
  assert.deepEqual(events, ['runtime-ready', 'test-mode-on', 'test-mode-off']);
  assert.equal(unsubscribed, 1);
});

test('authenticated admin UI requires confirmation and reports remaining time and peer state', () => {
  assert.match(adminHtml, /id="testModeButton"[^>]*hidden/);
  assert.match(adminHtml, /id="testModeModal"[\s\S]*?id="confirmTestMode"/);
  assert.match(adminSource, /영업시간 외 테스트 모드를 켜시겠습니까/);
  assert.match(adminSource, /setAuthenticatedTestModeUI\(true\)/);
  assert.match(adminSource, /Math\.ceil\(\(state\.expiresAt-Date\.now\(\)\)\/60000\)/);
  assert.match(adminSource, /키오스크 연결 대기/);
  assert.match(adminSource, /adminTestModeRemote\.requestEnable\(\)/);
  assert.match(adminSource, /adminTestModeRemote\.requestDisable\(\)/);
  assert.match(adminSource, /'enabled-confirmed':'테스트 모드 적용됨/);
  assert.match(adminSource, /'requesting-enable':'테스트 모드 활성화 요청 중/);
  assert.match(adminSource, /'requesting-disable':'테스트 모드 종료 요청 중/);
  assert.match(adminSource, /acceptRemoteMessages:false/);
  assert.match(adminSource, /pagehide',disposeAdminTestModeSession,\{once:true\}/);
});

test('kiosk ordering stays available and test mode displays a non-dismissible banner', () => {
  assert.doesNotMatch(html, /businessHoursStatus!=='open'&&!isTestModeEnabled\(\)/);
  assert.match(html, /function isOrderingAllowed\(\)\{return true\}/);
  assert.match(html, /function areaSchedulePolicy\(area\)\{\n if\(isTestModeEnabled\(\)\)return/);
  assert.match(html, /class="testModeBanner" role="status"/);
  assert.doesNotMatch(html, /testModeBanner[\s\S]{0,100}(?:close|dismiss|닫기)/i);
  assert.match(html, /data-order-type="dinein"/);
  assert.match(html, /data-order-type="takeout"/);
});

test('test completion precedes order number, Firestore, seat, payment, and printer boundaries', () => {
  const complete = html.match(/async function complete\(event\)\{[\s\S]*?\n}\n\n\/\* v43/)?.[0] || '';
  const submit = html.match(/async function submitMobileOrder\(\)\{[\s\S]*?\n}\n\nasync function complete/)?.[0] || '';
  assert.ok(complete.indexOf('if(isTestModeEnabled())') < complete.indexOf('state.orderNo=displayOrderNo()'));
  assert.ok(complete.indexOf("state.step='testDone'") < complete.indexOf('await submitMobileOrder()'));
  assert.match(submit, /^async function submitMobileOrder\(\)\{\n if\(isTestModeEnabled\(\)\)/);
  assert.ok(submit.lastIndexOf('if(isTestModeEnabled())') < submit.indexOf('transaction.set(orderRef,committed)'));
  assert.match(html, /async function claimSeat\(id\)\{\n if\(isTestModeEnabled\(\)\)return/);
  assert.match(html, /async function releaseSeats[\s\S]*?\{\n if\(isTestModeEnabled\(\)\)return/);
  assert.doesNotMatch(complete.slice(0, complete.indexOf("state.step='testDone'")), /paymentAdapter|print|printer|transaction\.set|collection\('orders'\)\.doc/);
});

test('Electron keeps runtime state in main-process memory and clears it on quit', () => {
  assert.match(mainSource, /const testModeState = \{ enabled: false, enabledAt: null, expiresAt: null \}/);
  assert.match(mainSource, /setTimeout\(\(\) => setTestModeState\(\)/);
  assert.match(mainSource, /app\.on\('before-quit'[\s\S]*?enabled: false, enabledAt: null, expiresAt: null/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('kioskTestMode'/);
  assert.doesNotMatch(mainSource + preloadSource, /localStorage|Firestore|URLSearchParams/);
});
