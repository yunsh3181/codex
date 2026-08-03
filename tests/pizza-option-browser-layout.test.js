const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { electronResultDetails, spawnElectronSync } = require('./helpers/electron-verification-process');

const root = path.resolve(__dirname, '..');
test('pizza options pass real viewport, locale, badge, and typography checks', { timeout: 120_000 }, t => {
  const electron = require('electron');
  assert.ok(fs.existsSync(electron), `Electron executable not found: ${electron}`);
  let command = electron;
  let args = ['scripts/verify-pizza-option-layout.js'];
  if (process.platform === 'darwin') {
    const binary = spawnSync('file', [electron], { encoding: 'utf8' }).stdout;
    const architecture = binary.includes('arm64') ? '-arm64' :
      binary.includes('x86_64') ? '-x86_64' : null;
    if (architecture) {
      const supported = spawnSync('/usr/bin/arch', [architecture, '/usr/bin/true']);
      if (supported.status !== 0) {
        t.skip(`Electron ${architecture.slice(1)} is not supported by this host`);
        return;
      }
      command = '/usr/bin/arch';
      args = [architecture, electron, ...args];
    }
  }
  const reportPath = path.join(os.tmpdir(), `pizza-option-layout-${process.pid}.json`);
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'pizza-option-profile-'));
  t.after(() => fs.rmSync(reportPath, { force: true }));
  t.after(() => fs.rmSync(userDataPath, { recursive: true, force: true }));
  const run = spawnElectronSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      PIZZA_OPTION_REPORT: reportPath,
      ELECTRON_VERIFICATION_USER_DATA: userDataPath,
    },
    timeout: 110_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(run.status, 0, electronResultDetails(run));
  assert.equal(run.signal, null, electronResultDetails(run));
  assert.equal(run.error, undefined, electronResultDetails(run));
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  fs.unlinkSync(reportPath);
  assert.equal(report.results.length, 4 * 6);
  for (const result of report.results) {
    for (const phase of ['before', 'after']) {
      const measurement = result[phase];
      const context = `${result.viewportName}/${measurement.locale}/${phase}`;
      if (measurement.layout === 'phone') {
        assert.equal(measurement.scroll.width, measurement.viewport.width, `${context}: horizontal scroll`);
        if (result.viewportName === '360x640') {
          assert.ok(measurement.scroll.height > measurement.viewport.height, `${context}: vertical scroll expected`);
        } else if (measurement.locale === 'ko') {
          assert.equal(measurement.fits, true, `${context}: ${JSON.stringify(measurement.scroll)}`);
          assert.ok(measurement.contentOverlapPx <= 1, `${context}: ${measurement.contentOverlapPx}px cart overlap`);
        } else {
          assert.ok(
            measurement.scroll.height <= measurement.viewport.height + 80,
            `${context}: excessive vertical scroll ${measurement.scroll.height}px`
          );
        }
      } else {
        assert.equal(measurement.fits, true, `${context}: ${JSON.stringify(measurement.scroll)}`);
        assert.ok(measurement.contentOverlapPx <= 1, `${context}: ${measurement.contentOverlapPx}px cart overlap`);
      }
      assert.deepEqual(measurement.clipped, [], `${context}: clipped`);
      assert.deepEqual(
        measurement.headingColors,
        ['rgb(17, 17, 17)', 'rgb(17, 17, 17)', 'rgb(17, 17, 17)'],
        `${context}: headings`
      );
      assert.equal(measurement.badgeCount, 3, `${context}: badges`);
      assert.equal(measurement.activeCount, 3, `${context}: active cards`);
      assert.equal(measurement.disabledBadgeCount, 0, `${context}: disabled badges`);
      const expected = measurement.layout === 'phone' ? 12 : 12.1;
      for (const size of measurement.guidanceFontSizes) {
        assert.ok(Math.abs(size - expected) < 0.05, `${context}: ${size}px guidance`);
      }
    }
    assert.notDeepEqual(result.before.activeLabels, result.after.activeLabels);
  }
});
