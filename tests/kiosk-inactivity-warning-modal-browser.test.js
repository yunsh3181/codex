'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { electronResultDetails, spawnElectronSync } = require('./helpers/electron-verification-process');

const root = path.resolve(__dirname, '..');
const verifierPath = path.join(root, 'scripts', 'verify-kiosk-inactivity-warning-modal.js');
const lifecyclePath = path.join(root, 'scripts', 'electron-verification-lifecycle.js');
const desktopMainPath = path.join(root, 'desktop', 'main.js');

function pngSize(file) {
  const bytes = fs.readFileSync(file);
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function resultDetails(result, context) {
  return [
    electronResultDetails(result),
    `executable: ${context.executable}`,
    `platform/architecture: ${process.platform}/${process.arch}`,
    `userData: ${context.profile}`,
    `screenshots: ${context.screenshotDir}`,
  ].join('\n');
}

function assertReport(report, screenshotDir) {
  assert.equal(report.overPizzaOptions.warningHosts, 1);
  assert.equal(report.overPizzaOptions.warningVisible, true);
  assert.equal(report.overPizzaOptions.modalVisible, true);
  assert.equal(report.overPizzaOptions.modalMarker, 'preserved');
  assert.equal(report.overPizzaOptions.sameModal, true);
  assert.equal(report.overPizzaOptions.stateModal, 'halfGuide');
  assert.equal(report.overPizzaOptions.step, 'pizzaOptions');
  assert.equal(report.overPizzaOptions.size, 'L');
  assert.equal(report.overPizzaOptions.topping, 1);
  assert.ok(report.overPizzaOptions.deadline > 0);
  for (const result of [report.continuedPizzaOptions, report.escapedModal, ...report.otherModals]) {
    assert.equal(result.warningVisible, false);
    assert.equal(result.modalVisible, true);
    assert.equal(result.modalMarker, 'preserved');
    assert.equal(result.sameModal, true);
    assert.equal(result.focusRestored, true);
    assert.equal(result.size, 'L');
    assert.equal(result.topping, 1);
  }
  assert.deepEqual(report.backdropIsolation, {
    backgroundClicks: 0,
    modalClicks: 0,
    generationUnchanged: true,
    deadlineUnchanged: true,
    warningVisible: true,
  });
  assert.deepEqual(report.homeReset, { releases: 1, step: 'idle', stateModal: null, warningVisible: false });
  assert.deepEqual(report.automaticAndStale, { releases: 1, resets: 1, step: 'idle', warningVisible: false });
  assert.deepEqual(report.consoleIssues, []);
  for (const name of ['existing-modal-with-warning', 'existing-modal-restored-after-continue']) {
    assert.deepEqual(pngSize(path.join(screenshotDir, `${name}-1080x1920.png`)), { width: 1080, height: 1920 });
  }
}

test('inactivity verifier disables hardware acceleration before readiness without weakening isolation', () => {
  const verifier = fs.readFileSync(verifierPath, 'utf8');
  const lifecycle = fs.readFileSync(lifecyclePath, 'utf8');
  const desktopMain = fs.readFileSync(desktopMainPath, 'utf8');
  assert.equal((verifier.match(/app\.disableHardwareAcceleration\(\)/g) || []).length, 1);
  assert.ok(verifier.indexOf('app.disableHardwareAcceleration()') < verifier.indexOf('runElectronVerification({ app }'));
  assert.ok(lifecycle.indexOf('await app.whenReady()') < lifecycle.indexOf('await verify(lifecycle)'));
  assert.doesNotMatch(desktopMain, /disableHardwareAcceleration/);
  assert.doesNotMatch(verifier, /--no-sandbox|appendSwitch\(['"]no-sandbox/);
  assert.doesNotMatch(verifier, /app\.exit\(0\)|process\.exit\(0\)/);
  assert.doesNotMatch(verifier, /retry|skip/i);
});

test('actual Chromium preserves existing order modals beneath the inactivity warning', { timeout: 600_000 }, t => {
  const electron = require('electron');
  let command = electron;
  let baseArgs = ['scripts/verify-kiosk-inactivity-warning-modal.js'];
  if (process.platform === 'darwin') {
    const binary = spawnSync('file', [electron], { encoding: 'utf8' }).stdout;
    const architecture = binary.includes('arm64') ? '-arm64' : binary.includes('x86_64') ? '-x86_64' : null;
    if (architecture) {
      const supported = spawnSync('/usr/bin/arch', [architecture, '/usr/bin/true']);
      if (supported.status !== 0) {
        t.skip(`Electron ${architecture.slice(1)} is not supported by this host`);
        return;
      }
      command = '/usr/bin/arch';
      baseArgs = [architecture, electron, ...baseArgs];
    }
  }

  const runCount = process.platform === 'win32' ? 5 : 1;
  for (let iteration = 1; iteration <= runCount; iteration += 1) {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), `inactivity-modal-run-${iteration}-`));
    const reportPath = path.join(tempRoot, 'report.json');
    const profile = path.join(tempRoot, 'profile');
    const screenshotDir = path.join(tempRoot, 'screenshots');
    t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
    const run = spawnElectronSync(command, [...baseArgs], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
        KIOSK_INACTIVITY_MODAL_REPORT: reportPath,
        KIOSK_INACTIVITY_MODAL_SCREENSHOT_DIR: screenshotDir,
        ELECTRON_VERIFICATION_USER_DATA: profile,
      },
      timeout: 110_000,
      maxBuffer: 10 * 1024 * 1024,
    });
    const details = resultDetails(run, { executable: command, profile, screenshotDir });
    assert.equal(run.status, 0, `iteration ${iteration}/${runCount}\n${details}`);
    assert.equal(run.signal, null, `iteration ${iteration}/${runCount}\n${details}`);
    assert.equal(run.error, undefined, `iteration ${iteration}/${runCount}\n${details}`);
    assertReport(JSON.parse(fs.readFileSync(reportPath, 'utf8')), screenshotDir);
  }
});
