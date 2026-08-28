const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertElectronSucceeded, spawnElectronVerificationSync } = require('./helpers/electron-verification-process');

const root = path.resolve(__dirname, '..');

test('set choice split cards pass the complete viewport and locale geometry matrix', { timeout: 240_000 }, t => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'set-choice-responsive-'));
  const reportPath = path.join(outputDir, 'geometry.json');
  const userDataPath = path.join(outputDir, 'user-data');
  t.after(() => fs.rmSync(outputDir, { recursive: true, force: true }));
  const run = spawnElectronVerificationSync(['scripts/verify-set-choice-responsive.js'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SET_CHOICE_REPORT: reportPath, SET_CHOICE_USER_DATA: userDataPath },
    timeout: 220_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  assertElectronSucceeded(assert, run, reportPath);
  fs.rmSync(userDataPath, { recursive: true, force: true });
  assert.equal(fs.existsSync(userDataPath), false, `Electron userData profile remained: ${userDataPath}`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(new Set(report.rows.map(row => `${row.viewport}/${row.locale}`)).size, 8 * 6);
  assert.deepEqual(report.rows.flatMap(row => row.fail), []);
});
