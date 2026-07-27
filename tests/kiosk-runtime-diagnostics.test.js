'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const diagnostics = require('../kiosk-runtime-diagnostics');
const diagnosticsUi = require('../kiosk-runtime-diagnostics-ui');
const { createDiagnosticsLog } = require('../desktop/diagnostics-log');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');
const remote = fs.readFileSync(path.join(root, 'test-mode-remote-channel.js'), 'utf8');
const controller = fs.readFileSync(path.join(root, 'after-hours-test-mode.js'), 'utf8');
const diagnosticsSource = fs.readFileSync(path.join(root, 'kiosk-runtime-diagnostics.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('diagnostic stages cover the complete startup and failure flow in execution order', () => {
  const ordered = [
    'firebase-config-check', 'firebase-ready', 'remote-module-check',
    'remote-module-loaded', 'connect-runtime-attempt', 'authentication-attempt',
    'authentication-complete', 'channel-created', 'channel-start-attempt'
  ];
  let cursor = -1;
  for (const stage of ordered) {
    const next = html.indexOf(`'${stage}'`);
    assert.ok(next > cursor, `${stage} follows the preceding stage`);
    cursor = next;
  }
  const rendererSource = fs.readFileSync(path.join(root, 'kiosk-runtime-diagnostics.js'), 'utf8');
  assert.ok(rendererSource.indexOf("'app-start'") < rendererSource.indexOf("'document-loading'"));
  for (const stage of [
    'app-start', 'document-ready', 'presence-write-start', 'presence-write-success',
    'heartbeat-started', 'connected', 'remote-module-missing', 'firebase-config-missing',
    'firebase-initialization-failed', 'authentication-failed', 'connect-runtime-failed',
    'channel-create-failed', 'channel-start-failed', 'presence-write-failed',
    'heartbeat-start-failed', 'uncaught-error', 'unhandled-rejection'
  ]) assert.ok(html.includes(stage) || main.includes(stage) ||
    fs.readFileSync(path.join(root, 'kiosk-runtime-diagnostics.js'), 'utf8').includes(stage), stage);
});

test('runtime session logs expose the requested connection sequence', () => {
  for (const event of [
    'remote-module-check',
    'remote-module-loaded',
    'runtime-ready',
    'authentication-start',
    'authentication-success',
    'channel-connected',
    'test-mode-on',
    'test-mode-off'
  ]) assert.match(html + controller + diagnosticsSource, new RegExp(event));
});

test('runtime presence trace distinguishes registration, Firestore write, heartbeat, and listener stages', () => {
  for (const event of [
    '[RUNTIME] authentication-start',
    '[RUNTIME] authentication-success'
  ]) assert.ok(html.includes(event), event);
  for (const event of [
    'registerPresence-called',
    'presence-write-start',
    'heartbeat-start',
    'heartbeat-tick',
    'command-listener-start'
  ]) assert.ok(remote.includes(event), event);
  assert.match(remote, /runtimeLog\(`\$\{eventPrefix\}-success`/);
  assert.match(remote, /runtimeLog\(`\$\{eventPrefix\}-failed`/);
  assert.match(remote, /operation: 'setDoc'/);
  assert.match(remote, /currentUser: \{\s*uid: safeAuthContext\.uid/);
  assert.match(remote, /claims: safeAuthContext\.claims/);
  assert.match(remote, /documentPath: presencePath/);
  assert.doesNotMatch(html + remote, /idToken|accessToken|refreshToken/);
});

test('diagnostic sanitizer removes secret-bearing fields and URL API keys', () => {
  const value = diagnostics.sanitize({
    apiKey: 'secret',
    accessToken: 'token',
    refresh_token: 'refresh',
    phone: '01012345678',
    safe: 'https://example.test/?apiKey=secret&mode=ok'
  });
  assert.equal(value.apiKey, '[REDACTED]');
  assert.equal(value.accessToken, '[REDACTED]');
  assert.equal(value.refresh_token, '[REDACTED]');
  assert.equal(value.phone, '[REDACTED]');
  assert.equal(value.safe, 'https://example.test/?apiKey=[REDACTED]&mode=ok');
  assert.doesNotMatch(JSON.stringify(Object.values(value)), /secret|01012345678|"token"|"refresh"/);
});

test('file diagnostics append UTF-8 and rotate without making failures fatal', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-diagnostics-'));
  const log = createDiagnosticsLog({ userDataPath: temporary, maxBytes: 120 });
  assert.equal(log.append({ stage: '한글-start' }), true);
  assert.equal(log.append({ stage: 'x'.repeat(150) }), true);
  assert.equal(log.append({ stage: 'connected' }), true);
  assert.ok(fs.existsSync(log.logPath));
  assert.ok(fs.existsSync(log.rotatedPath));
  assert.match(fs.readFileSync(log.logPath, 'utf8'), /connected/);

  const failing = createDiagnosticsLog({
    userDataPath: temporary,
    fsModule: { mkdirSync() { throw new Error('disk unavailable'); } }
  });
  assert.equal(failing.append({ stage: 'app-start' }), false);
});

test('diagnostic modal renders environment, flags, latest 30 logs and safe actions', () => {
  const entries = Array.from({ length: 35 }, (_, index) => ({ stage: `stage-${index}` }));
  const output = diagnosticsUi.render({
    entries,
    environment: {
      appVersion: '1.2.7',
      electronVersion: '43.2.0',
      packaged: true,
      bootstrapCredentialPresentAtStartup: true,
      bootstrapCredentialConsumeRequested: true,
      bootstrapCredentialPresentAtConsume: true,
      bootstrapCredentialConsumed: true
    },
    context: { projectId: 'papajohns-kiosk', storeId: 'store', kioskId: 'kiosk' },
    flags: { remoteModuleLoaded: true },
    currentStage: 'connected',
    online: true
  });
  assert.match(output, /키오스크 시작 진단/);
  assert.match(output, /stage-34/);
  assert.doesNotMatch(output, /stage-4"/);
  assert.match(output, /Bootstrap credential detected at main startup/);
  assert.match(output, /Bootstrap credential requested through IPC/);
  for (const action of ['refresh', 'reconnect', 'copy', 'open-log', 'close']) {
    assert.match(output, new RegExp(`data-diagnostics-action="${action}"`));
  }
});

test('renderer bridge and main process collect diagnostics without weakening Electron security', () => {
  assert.match(preload, /exposeInMainWorld\('kioskDiagnosticsBridge'/);
  assert.match(main, /render-process-gone/);
  assert.match(main, /did-fail-load/);
  assert.match(main, /preload-error/);
  assert.match(main, /uncaughtExceptionMonitor/);
  assert.match(main, /unhandledRejection/);
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
});

test('reconnect is guarded and reuses one channel and one heartbeat', () => {
  assert.match(html, /if\(kioskRuntimeConnected\|\|kioskRuntimeConnecting\)return/);
  assert.match(html, /if\(kioskRuntimeConnecting\)return false/);
  assert.match(html, /kioskRemoteTestMode\?\.stop\(\)/);
  assert.match(remote, /if \(started\) return/);
  assert.match(remote, /clearInterval\(heartbeat\)/);
});

test('packaged files include remote, Firebase, preload, IPC, and diagnostic UI assets', () => {
  const exclusions = packageJson.build.files.filter(pattern => pattern.startsWith('!'));
  for (const file of [
    'test-mode-remote-channel.js',
    'kiosk-runtime-auth.js',
    'assets/vendor/firebase/firebase-app-compat.js',
    'desktop/preload.js',
    'desktop/diagnostics-log.js',
    'kiosk-runtime-diagnostics.js',
    'kiosk-runtime-diagnostics-ui.js',
    'styles/kiosk-runtime-diagnostics.css'
  ]) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
    assert.equal(exclusions.some(pattern => pattern.includes(file)), false, `${file} is not excluded`);
  }
  assert.match(html, /src="test-mode-remote-channel\.js\?v=1"/);
  assert.match(html, /src="kiosk-runtime-diagnostics\.js\?v=1"/);
  assert.match(html, /src="kiosk-runtime-diagnostics-ui\.js\?v=1"/);
});
