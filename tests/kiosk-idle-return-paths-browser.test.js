'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnElectronSync, electronResultDetails } = require('./helpers/electron-verification-process');

test('actual Chromium starts and returns every terminal kiosk path to idle', () => {
  const root = path.resolve(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'kiosk-idle-return-test-'));
  const reportPath = path.join(temp, 'report.json');
  const result = spawnElectronSync(require('electron'), [path.join(root, 'scripts', 'verify-kiosk-idle-return-paths.js')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, KIOSK_IDLE_RETURN_REPORT: reportPath, KIOSK_IDLE_RETURN_SCREENSHOT_DIR: path.join(temp, 'shots'), ELECTRON_VERIFICATION_USER_DATA: path.join(temp, 'profile') }
  });
  assert.equal(result.status, 0, electronResultDetails(result));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.initial.step, 'idle');
  assert.equal(report.orderStart.step, 'home');
  assert.equal(report.warning.step, 'pizzaOptions');
  for (const key of ['expired', 'manualHome', 'completed']) assert.equal(report[key].step, 'idle', key);
  assert.equal(report.happyHour.activePromotion, 'happy-hour');
  assert.equal(report.setMenu.activePromotion, 'set-menu');
  for (const [key, value] of Object.entries(report)) {
    if (key === 'consoleMessages') continue;
    assert.deepEqual(value.viewport, [1080, 1920], key);
    assert.ok(value.horizontalOverflow <= 0, `${key} horizontal overflow`);
    assert.ok(value.verticalOverflow <= 0, `${key} vertical overflow`);
    if (value.step === 'idle') {
      assert.equal(value.mainVerticalOverflow, 0, `${key} main vertical overflow`);
      assert.equal(value.imageFit, 'contain', key);
      assert.equal(value.startVisible, true, key);
      assert.equal(value.cartVisible, false, key);
      assert.equal(value.scrollIndicatorVisible, false, key);
    }
  }
  assert.deepEqual(report.consoleMessages, []);
});
