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
const {
  TEXT_LIMITS,
  normalizeUpdaterState,
  renderPanelContent
} = require('../kiosk-updater-ui');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function harness({
  arch = 'ia32',
  packaged = true,
  portable = false,
  operationalState = null,
  autoRespondOperational = true
} = {}) {
  const updater = new EventEmitter();
  updater.checkCalls = 0;
  updater.quitCalls = 0;
  updater.checkForUpdates = async () => { updater.checkCalls += 1; };
  updater.quitAndInstall = () => { updater.quitCalls += 1; };
  const handlers = new Map();
  const ipcMain = new EventEmitter();
  ipcMain.removeHandler = name => handlers.delete(name);
  ipcMain.handle = (name, handler) => handlers.set(name, handler);
  const sent = [];
  const timers = [];
  const intervals = [];
  const window = {
    isDestroyed: () => false,
    webContents: {
      send(channel, ...args) {
        sent.push([channel, ...args]);
        if (channel === 'kiosk-updater:request-operational-state' && autoRespondOperational) {
          ipcMain.emit('kiosk-updater:operational-state', { sender: window.webContents }, args[0], operationalState);
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
  return { updater, manager, handlers, ipcMain, sent, timers, intervals, window };
}

class FakeNode {
  constructor(tagName = '#text', text = '') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.style = {};
    this._text = text;
  }
  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }
  removeChild(child) {
    this.children.splice(this.children.indexOf(child), 1);
    child.parentNode = null;
    return child;
  }
  get firstChild() { return this.children[0] || null; }
  set textContent(value) {
    this._text = String(value);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map(child => child.textContent).join('');
  }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  findAll(tagName) {
    const expected = tagName.toUpperCase();
    return [
      ...(this.tagName === expected ? [this] : []),
      ...this.children.flatMap(child => child.findAll(expected))
    ];
  }
}

const fakeDocument = {
  createElement: tagName => new FakeNode(tagName),
  createTextNode: text => new FakeNode('#text', text)
};

function idleOperationalState() {
  return {
    businessOpen: false,
    orderInProgress: false,
    paymentInProgress: false,
    firestoreSaving: false,
    printerBusy: false,
    testModeEnabled: false
  };
}

function requestIdFrom(value) {
  return value.sent.find(([channel]) => channel === 'kiosk-updater:request-operational-state')?.[1];
}

function expireOperationalTimeout(value) {
  value.timers.find(item => item.delay === 5000)?.callback();
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
  assert.equal(value.ipcMain.listenerCount('kiosk-updater:operational-state'), 1);
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

test('no available update keeps the existing up-to-date handling', () => {
  const value = harness();
  value.manager.initialize();
  value.updater.emit('update-not-available', { version: '1.0.3' });
  assert.equal(value.manager.snapshot().status, 'up-to-date');
  assert.equal(value.manager.snapshot().latestVersion, '1.0.3');
  assert.equal(value.updater.quitCalls, 0);
});

test('download failures keep the existing updater error handling', () => {
  const value = harness();
  value.manager.initialize();
  value.updater.emit('update-available', { version: '1.1.0' });
  value.updater.emit('error', new Error('download failed'));
  assert.equal(value.manager.snapshot().status, 'error');
  assert.match(value.manager.snapshot().error, /download failed/);
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

test('install is blocked by active operations but not by business hours', async () => {
  const operationalState = {
    businessOpen: true,
    orderInProgress: true,
    paymentInProgress: true,
    firestoreSaving: true,
    printerBusy: true,
    testModeEnabled: false
  };
  assert.equal(installBlockers(operationalState).length, 4);
  const value = harness({ operationalState });
  value.manager.initialize();
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  const result = await value.manager.installDownloadedUpdate();
  assert.equal(result.status, 'blocked');
  assert.equal(value.updater.quitCalls, 0);
});

test('business hours never add an installation blocker', () => {
  const businessOpen = { ...idleOperationalState(), businessOpen: true };
  assert.deepEqual(installBlockers(businessOpen), []);
  assert.deepEqual(installBlockers({ ...businessOpen, testModeEnabled: true }), []);

  const protectedActivities = [
    ['orderInProgress', '진행 중인 주문이 있습니다.'],
    ['paymentInProgress', '결제가 진행 중입니다.'],
    ['firestoreSaving', '주문 저장이 진행 중입니다.'],
    ['printerBusy', '프린터 작업이 진행 중입니다.']
  ];
  for (const [key, message] of protectedActivities) {
    const state = { ...businessOpen, testModeEnabled: true, [key]: true };
    assert.deepEqual(installBlockers(state), [message]);
  }
  assert.deepEqual(installBlockers(idleOperationalState()), []);
});

test('update guidance matches the business-open installation behavior', () => {
  const fakeDocument = { createElement: tag => new FakeNode(tag), createTextNode: text => new FakeNode('#text', text) };
  const rootNode = new FakeNode('div');
  renderPanelContent(fakeDocument, rootNode, normalizeUpdaterState({ status: 'downloaded', version: '1.2.22' }));
  assert.match(rootNode.textContent, /영업 중에도 업데이트할 수 있습니다\. 진행 중인 주문·결제·저장·프린터 작업이 없을 때 재시작 후 설치됩니다\./);
  const docs = read('docs/windows-auto-update.md');
  assert.match(docs, /administrator may update while the store is open/);
  assert.doesNotMatch(docs, /blocked while the store is open|Outside business hours/);
});

test('business-hours update check, download, install, and restart remain available', async () => {
  const operationalState = {
    ...idleOperationalState(),
    businessOpen: true,
    testModeEnabled: false
  };
  const value = harness({ operationalState });
  value.manager.initialize();
  await value.manager.checkForUpdates();
  assert.equal(value.updater.checkCalls, 1);
  value.updater.emit('update-available', { version: '1.1.0' });
  assert.equal(value.manager.snapshot().status, 'downloading');
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  const result = await value.manager.installDownloadedUpdate();
  assert.equal(result.status, 'installing');
  const immediate = value.timers.find(item => item.delay === 0);
  assert.ok(immediate);
  immediate.callback();
  assert.equal(value.updater.quitCalls, 1);
});

test('updater error handling remains active after an install starts', async () => {
  const value = harness({ operationalState: idleOperationalState() });
  value.manager.initialize();
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  assert.equal((await value.manager.installDownloadedUpdate()).status, 'installing');
  value.updater.emit('error', new Error('install failed'));
  assert.equal(value.manager.snapshot().status, 'error');
  assert.match(value.manager.snapshot().error, /install failed/);
});

test('install does nothing before an update has downloaded', async () => {
  const value = harness({
    operationalState: { ...idleOperationalState(), businessOpen: true, testModeEnabled: true }
  });
  value.manager.initialize();
  const result = await value.manager.installDownloadedUpdate();
  assert.equal(result.status, 'idle');
  assert.equal(value.updater.quitCalls, 0);
  assert.equal(requestIdFrom(value), undefined);
});

test('downloaded ia32 update restarts only after a validated idle closed state', async () => {
  const value = harness({ operationalState: idleOperationalState() });
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

test('operational state accepts only the active kiosk window sender', async () => {
  const value = harness({ autoRespondOperational: false });
  value.manager.initialize();
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  const installation = value.manager.installDownloadedUpdate();
  const requestId = requestIdFrom(value);
  value.ipcMain.emit('kiosk-updater:operational-state', { sender: {} }, requestId, idleOperationalState());
  assert.equal(value.manager.snapshot().status, 'downloaded');
  value.ipcMain.emit('kiosk-updater:operational-state', { sender: value.window.webContents }, requestId, idleOperationalState());
  assert.equal((await installation).status, 'installing');
});

test('wrong request IDs and invalid boolean contracts cannot authorize installation', async () => {
  for (const response of [
    { requestId: 'wrong-request', state: idleOperationalState() },
    { requestId: null, state: { ...idleOperationalState(), printerBusy: 'false' } }
  ]) {
    const value = harness({ autoRespondOperational: false });
    value.manager.initialize();
    value.updater.emit('update-downloaded', { version: '1.1.0' });
    const installation = value.manager.installDownloadedUpdate();
    const actualRequestId = requestIdFrom(value);
    value.ipcMain.emit(
      'kiosk-updater:operational-state',
      { sender: value.window.webContents },
      response.requestId || actualRequestId,
      response.state
    );
    if (response.requestId) expireOperationalTimeout(value);
    const result = await installation;
    assert.equal(result.status, 'blocked');
    assert.equal(result.blockers[0], '운영 상태를 확인할 수 없습니다.');
    assert.equal(value.updater.quitCalls, 0);
  }
});

test('dispose removes updater IPC listeners and invoke handlers', async () => {
  const value = harness({ autoRespondOperational: false });
  value.manager.initialize();
  value.manager.initialize();
  assert.equal(value.ipcMain.listenerCount('kiosk-updater:operational-state'), 1);
  assert.equal(value.handlers.size, 3);
  value.updater.emit('update-downloaded', { version: '1.1.0' });
  const installation = value.manager.installDownloadedUpdate();
  value.manager.dispose();
  assert.equal(value.ipcMain.listenerCount('kiosk-updater:operational-state'), 0);
  assert.equal(value.handlers.size, 0);
  assert.equal((await installation).status, 'blocked');
});

test('operational IPC payload accepts only the exact boolean contract', () => {
  const valid = {
    businessOpen: false,
    orderInProgress: false,
    paymentInProgress: false,
    firestoreSaving: false,
    printerBusy: false,
    testModeEnabled: false,
    ignored: 'value'
  };
  assert.deepEqual(sanitizeOperationalState(valid), {
    businessOpen: false,
    orderInProgress: false,
    paymentInProgress: false,
    firestoreSaving: false,
    printerBusy: false,
    testModeEnabled: false
  });
  assert.deepEqual(sanitizeOperationalState({ ...valid, testModeEnabled: true }), {
    businessOpen: false,
    orderInProgress: false,
    paymentInProgress: false,
    firestoreSaving: false,
    printerBusy: false,
    testModeEnabled: true
  });
  const { testModeEnabled, ...missingTestMode } = valid;
  assert.equal(sanitizeOperationalState(missingTestMode), null);
  assert.equal(sanitizeOperationalState({ ...valid, testModeEnabled: 'true' }), null);
  assert.equal(sanitizeOperationalState({ ...valid, printerBusy: 'no' }), null);
  assert.equal(sanitizeOperationalState(null), null);
  assert.deepEqual(installBlockers({ ...valid, testModeEnabled: 1 }), ['운영 상태를 확인할 수 없습니다.']);
});

test('renderer exposure is narrow and update controls are admin-shortcut only', () => {
  const preload = read('desktop/preload.js');
  const main = read('desktop/main.js');
  const customer = read('kiosk-updater-ui.js');
  assert.match(preload, /contextBridge\.exposeInMainWorld\('kioskUpdater'/);
  assert.doesNotMatch(preload, /nodeIntegration|require:\s*require|process:/);
  assert.match(main, /input\.control && input\.alt && input\.shift && key === 'u'/);
  assert.match(customer, /onOpenAdmin[\s\S]*?panelOpen = true/);
  assert.match(customer, /testModeEnabled: isTestModeEnabled\(\)/);
  assert.doesNotMatch(read('index.html'), /data-updater-action="check"|재시작 후 설치/);
});

test('updater UI normalizes untrusted state values', () => {
  assert.equal(normalizeUpdaterState({ progress: -1 }).progress, 0);
  assert.equal(normalizeUpdaterState({ progress: 101 }).progress, 100);
  assert.equal(normalizeUpdaterState({ progress: Number.NaN }).progress, 0);
  assert.deepEqual(normalizeUpdaterState({ blockers: 'not-an-array' }).blockers, []);
  assert.deepEqual(normalizeUpdaterState({ blockers: ['valid', {}, 3, null] }).blockers, ['valid']);
  assert.equal(normalizeUpdaterState({ error: 'x'.repeat(1000) }).error.length, TEXT_LIMITS.error);
  assert.equal(normalizeUpdaterState({ currentVersion: {} }).currentVersion, '');
});

test('updater admin UI renders hostile HTML as inert plain text', () => {
  const rootNode = new FakeNode('div');
  const hostile = {
    status: 'downloaded',
    currentVersion: '<script>alert(1)</script>',
    latestVersion: '<script>alert(1)</script>',
    architecture: '"><button autofocus onfocus=alert(1)>',
    channel: '<channel & unsafe>',
    downloaded: true,
    blockers: ['<strong>blocked</strong>'],
    error: '<img src=x onerror=alert(1)>'
  };
  renderPanelContent(fakeDocument, rootNode, hostile);
  assert.match(rootNode.textContent, /<script>alert\(1\)<\/script>/);
  assert.match(rootNode.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.match(rootNode.textContent, /<strong>blocked<\/strong>/);
  assert.match(rootNode.textContent, /"><button autofocus onfocus=aler/);
  assert.equal(rootNode.findAll('script').length, 0);
  assert.equal(rootNode.findAll('img').length, 0);
  assert.equal(rootNode.findAll('button').length, 3);
});

test('GitHub Release workflow publishes architecture-specific installers, blockmaps, and metadata', () => {
  const workflow = read('.github/workflows/windows-release.yml');
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.version, '1.2.22');
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

test('GitHub Release validation runs the complete suite inside an Xvfb display', () => {
  const workflow = read('.github/workflows/windows-release.yml');
  const validate = workflow.match(/  validate:\n([\s\S]*?)\n  build:/)?.[1] || '';
  const build = workflow.match(/  build:\n([\s\S]*?)\n  release:/)?.[1] || '';
  const release = workflow.match(/  release:\n([\s\S]*)$/)?.[1] || '';

  assert.match(validate, /runs-on: ubuntu-latest/);
  assert.match(validate, /ELECTRON_DISABLE_SANDBOX: "1"/);
  assert.match(validate, /name: Verify virtual display support[\s\S]*?shell: bash[\s\S]*?run: command -v xvfb-run/);
  assert.match(
    validate,
    /name: Run full test suite with virtual display[\s\S]*?shell: bash[\s\S]*?run: xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" node --test --test-concurrency=1 tests\/\*\.test\.js/
  );
  assert.doesNotMatch(validate, /continue-on-error|\|\| true|--test-name-pattern|--test-skip-pattern/);
  assert.match(
    validate,
    /ref: \$\{\{ github\.event_name == 'workflow_dispatch' && inputs\.tag \|\| github\.ref \}\}/
  );
  assert.match(validate, /test "\$RELEASE_TAG" = "v\$PACKAGE_VERSION"/);
  assert.match(build, /needs: validate/);
  assert.match(release, /needs: \[validate, build\]/);
  for (const arch of ['ia32', 'x64']) {
    assert.match(build, new RegExp(`arch: ${arch}`));
    assert.ok(workflow.includes(`release/PapaJohns-Kiosk-Setup-*-${arch}.exe`));
    assert.ok(workflow.includes(`release/PapaJohns-Kiosk-Setup-*-${arch}.exe.blockmap`));
    assert.ok(workflow.includes(`release/latest-${arch}.yml`));
  }
  assert.match(release, /softprops\/action-gh-release@v2/);
  assert.match(release, /fail_on_unmatched_files: true/);
});

console.log('Windows GitHub Release updater channels, safety gates, recovery, admin IPC, and release assets passed');
