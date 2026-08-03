const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

test('mobile timing colors and every pizza path pass real viewport checks', { timeout: 120_000 }, t => {
  const electron = require('electron');
  let command = electron;
  let args = ['scripts/verify-mobile-order-pizza-grid.js'];
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
      args = [architecture, electron, ...args];
    }
  }
  const outputDir = path.join(os.tmpdir(), `mobile-order-pizza-grid-test-${process.pid}`);
  const reportPath = path.join(outputDir, 'measurements.json');
  const run = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      MOBILE_PIZZA_GRID_OUTPUT: outputDir,
      MOBILE_PIZZA_GRID_REPORT: reportPath,
      MOBILE_PIZZA_GRID_BEFORE: 'origin/main',
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 110_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `${run.error || ''}\n${run.stdout || ''}\n${run.stderr || ''}`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.results.length, 3 * 6);
  const timing = report.results.filter(result => result.scenario === 'timing');
  for (const result of timing) {
    if (result.after.layout === 'phone') {
      assert.equal(result.after.now.background, 'rgb(8, 115, 72)');
      assert.equal(result.after.reserve.background, 'rgb(200, 16, 46)');
      assert.equal(result.after.now.color, 'rgb(255, 255, 255)');
      assert.equal(result.after.reserve.color, 'rgb(255, 255, 255)');
      for (const key of ['headingColor', 'iconColor', 'descriptionColor']) {
        assert.equal(result.after.now[key], 'rgb(255, 255, 255)', `now ${key}`);
        assert.equal(result.after.reserve[key], 'rgb(255, 255, 255)', `reserve ${key}`);
      }
    } else {
      assert.deepEqual(result.after, result.before);
    }
  }
  for (const result of report.results.filter(entry => entry.scenario !== 'timing')) {
    if (result.after.layout === 'phone') {
      assert.equal(result.before.columns, 4, `${result.viewport}/${result.scenario}: baseline columns`);
      assert.equal(result.after.columns, 3, `${result.viewport}/${result.scenario}: columns`);
      assert.equal(result.after.horizontalOverflow, 0, `${result.viewport}/${result.scenario}: horizontal overflow`);
      assert.deepEqual(result.after.clipped, [], `${result.viewport}/${result.scenario}: clipped text`);
      assert.equal(result.after.imageFit, 'contain', `${result.viewport}/${result.scenario}: image fit`);
      assert.ok(result.after.imageSize.height > result.before.imageSize.height, `${result.viewport}/${result.scenario}: image height`);
      assert.equal(result.after.nameFontSize, 12, `${result.viewport}/${result.scenario}: name font`);
      assert.equal(result.after.priceFontSize, 10, `${result.viewport}/${result.scenario}: price font`);
      assert.ok(result.after.bottomClearance >= 27, `${result.viewport}/${result.scenario}: bottom clearance`);
    } else {
      for (const key of ['columns', 'cardSize', 'imageSize', 'imageFit', 'nameFontSize', 'priceFontSize', 'horizontalOverflow', 'clipped']) {
        assert.deepEqual(result.after[key], result.before[key], `${result.viewport}/${result.scenario}: ${key}`);
      }
    }
  }
  assert.equal(report.localeResults.length, 6 * 5);
  for (const { locale, scenario, measurement } of report.localeResults) {
    assert.equal(measurement.columns, 3, `${locale}/${scenario}: columns`);
    assert.equal(measurement.horizontalOverflow, 0, `${locale}/${scenario}: horizontal overflow`);
    assert.deepEqual(measurement.clipped, [], `${locale}/${scenario}: clipped text`);
  }
});
