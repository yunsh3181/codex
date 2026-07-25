'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  INITIAL_CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  sanitizeOperationalState,
  installBlockers,
  createKioskUpdater
} = require('../desktop/updater');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function harness({ arch = 'ia32', packaged = true, portable = false, operationalState = null } = {}) {
  const updater = new EventEmitter();
  updater.checkCalls = 0;
  updater.quitCalls = 0;
  updater.checkForUpdates = async () => { updater.checkCalls += 1; };
  updater.quitAndInstall = () => { updater.quitCalls += 1; };
  const handlers = new Map();
  const ipcListeners = new Map();
  const ipcMain = {
    removeHandler(name) { handlers.delete(name); },
    handle(name, handler) { handlers.set(name, handler); },
    on(name, listener) { ipcListeners.set(name, listener); }
  };
  const sent = [];
  const timers = [];
  const intervals = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      send(channel, ...args) {
        sent.push([channel, ...args]);
        if (channel === 'kiosk-updater:request-operational-state') {
          ipcListeners.get('kiosk-updater:operational-state')?.({}, args[0], operationalState);
        }
      }
    }
  };
  const manager = createKioskUpdater({
    app: { isPackaged: packaged, getVersion: () => '1.0.3' },
    autoUpdater: updater,
    ipcMain,
    getWindow: () => window,
    platform: 'win32',
    arch,
    isPortable: portable,
    setTimeoutFn(callback, delay) {
      timers.push({ callback, delay });
      return timers.length;
    },
    setIntervalFn(callback, delay) {
      intervals.push({ callback, delay });
      return intervals.length;
    },
    clearTimeoutFn() {},
    clearIntervalFn() {}
  });
  return { updater, manager, handlers, sent, timers, intervals };
}

test('ia32 and x64 select separate immutable update channels', () => {
  const ia32 = harness({ arch: 'ia32' });
  const x64 = harness({ arch: 'x64' });
  assert.equal(ia32.manager.initialize().channel, 'latest-ia32');
  assert.equal(x64.manager.initialize().channel, 'latest-x64');
  assert.equal(ia32.updater.channel, 'latest-ia32');
  assert.equal(x64.updater.channel, 'latest-x64');
  assert.equal(ia32.updater.allowDowngrade, false);
  assert.equal(ia32.updater.autoInstallOnAppQuit, false);
});

test('initialization schedules one delayed check and one six-hour interval', () => {
  const value = harness();
  value.manager.initialize();
  value.manager.initialize();
  assert.deepEqual(value.timers.map(item => item.delay), [INITIAL_CHECK_DELAY_MS]);
  assert.deepEqual(value.intervals.map(item => item.delay), [CHECK_INTERVAL_MS]);
  assert.equal(INITIAL_CHECK_DELAY_MS, 15000);
  assert.equal(CHECK_INTERVAL_MS, 21600000);
});

test('development, unsupported architectures, and portable builds stay operational without updater', () => {
  assert.equal(harness({ packaged: false }).manager.initialize().status, 'unavailable');
  assert.equal(harness({ arch: 'arm64' }).manager.initialize().status, 'unavailable');
  assert.equal(harness({ portable: true }).manager.initialize().status, 'unavailable');
});

test('download progress and completion expose the new version without restarting', () => {
  const value = harness();
  value.manager.initialize();
  value.updater.emit('update-available', { version: '1.1.0' });
  value.updater.emit('download-progress', { percent: 42.4 });
  assert.equal(value.manager.snapshot().status, 'downloading');
  assert.equal(value.manager.snapshot().progress, 42.4);
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  assert.deepEqual(
    { status: value.manager.snapshot().status, downloaded: value.manager.snapshot().downloaded, latestVersion: value.manager.snapshot().latestVersion },
    { status: 'downloaded', downloaded: true, latestVersion: '1.1.0' }
  );
  assert.equal(value.updater.quitCalls, 0);
});

test('downloaded updates are not checked or downloaded repeatedly', async () => {
  const value = harness();
  value.manager.initialize();
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  await value.manager.checkForUpdates();
  assert.equal(value.updater.checkCalls, 0);
  assert.equal(value.manager.snapshot().status, 'downloaded');
});

test('network and release errors keep the current version running', async () => {
  const value = harness();
  value.updater.checkForUpdates = async () => { throw new Error('offline'); };
  value.manager.initialize();
  const result = await value.manager.checkForUpdates();
  assert.equal(result.status, 'error');
  assert.match(result.error, /offline/);
  assert.equal(result.currentVersion, '1.0.3');
  assert.equal(value.updater.quitCalls, 0);
});

test('install is blocked during business, order, payment, save, or printer activity', async () => {
  const operationalState = {
    businessOpen: true,
    orderInProgress: true,
    paymentInProgress: true,
    firestoreSaving: true,
    printerBusy: true
  };
  assert.equal(installBlockers(operationalState).length, 5);
  const value = harness({ operationalState });
  value.manager.initialize();
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  const result = await value.manager.installDownloadedUpdate();
  assert.equal(result.status, 'blocked');
  assert.equal(value.updater.quitCalls, 0);
});

test('downloaded ia32 update restarts only after a validated idle closed state', async () => {
  const value = harness({
    operationalState: {
      businessOpen: false,
      orderInProgress: false,
      paymentInProgress: false,
      firestoreSaving: false,
      printerBusy: false
    }
  });
  value.manager.initialize();
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  const result = await value.manager.installDownloadedUpdate();
  assert.equal(result.status, 'installing');
  assert.equal(value.updater.quitCalls, 0);
  const immediate = value.timers.find(item => item.delay === 0);
  assert.ok(immediate);
  immediate.callback();
  assert.equal(value.updater.quitCalls, 1);
});

test('operational IPC payload accepts only the exact boolean contract', () => {
  const valid = {
    businessOpen: false,
    orderInProgress: false,
    paymentInProgress: false,
    firestoreSaving: false,
    printerBusy: false,
    ignored: 'value'
  };
  assert.deepEqual(sanitizeOperationalState(valid), {
    businessOpen: false,
    orderInProgress: false,
    paymentInProgress: false,
    firestoreSaving: false,
    printerBusy: false
  });
  assert.equal(sanitizeOperationalState({ ...valid, printerBusy: 'no' }), null);
  assert.equal(sanitizeOperationalState(null), null);
});

test('renderer exposure is narrow and update controls are admin-shortcut only', () => {
  const preload = read('desktop/preload.js');
  const main = read('desktop/main.js');
  const customer = read('kiosk-updater-ui.js');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('kioskUpdater'/);
  assert.doesNotMatch(preload, /nodeIntegration|require:\s*require|process:/);
  assert.match(main, /input\.control && input\.alt && input\.shift && key === 'u'/);
  assert.match(customer, /onOpenAdmin[\s\S]*?panelOpen = true/);
  assert.doesNotMatch(read('index.html'), /data-updater-action="check"|재시작 후 설치/);
});

test('GitHub Release workflow publishes architecture-specific installers, blockmaps, and metadata', () => {
  const workflow = read('.github/workflows/windows-release.yml');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.1.0');
  assert.deepEqual(pkg.build.publish, {
    provider: 'github',
    owner: 'yunsh3181',
    repo: 'codex',
    channel: 'latest'
  });
  for (const arch of ['ia32', 'x64']) {
    assert.ok(workflow.includes(`latest-${arch}.yml`));
    assert.ok(workflow.includes(`*-${arch}.exe.blockmap`));
  }
  assert.match(workflow, /push:[\s\S]*tags:[\s\S]*"v\*"/);
  assert.match(workflow, /test "\$RELEASE_TAG" = "v\$PACKAGE_VERSION"/);
  assert.match(workflow, /softprops\/action-gh-release@v2/);
});

console.log('Windows GitHub Release updater channels, safety gates, recovery, admin IPC, and release assets passed');
