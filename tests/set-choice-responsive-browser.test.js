const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertElectronSucceeded, spawnElectronVerificationSync } = require('./helpers/electron-verification-process');

const root = path.resolve(__dirname, '..');
const waitBuffer = new Int32Array(new SharedArrayBuffer(4));

function removeOwnedProfile(outputDir, userDataPath) {
  assert.equal(path.dirname(userDataPath), outputDir);
  assert.equal(path.basename(userDataPath), 'user-data');
  let lastError;
  for (let attempts = 1; attempts <= 10; attempts += 1) {
    try {
      fs.rmSync(userDataPath, { recursive: true, force: true });
      if (!fs.existsSync(userDataPath)) return { attempts, exists: false };
    } catch (error) {
      lastError = error;
    }
    Atomics.wait(waitBuffer, 0, 0, 100);
  }
  return { attempts: 10, exists: fs.existsSync(userDataPath), error: lastError?.message || null };
}

test('set choice split cards pass the complete viewport and locale geometry matrix', { timeout: 240_000 }, t => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'set-choice-responsive-'));
  const reportPath = path.join(outputDir, 'geometry.json');
  const userDataPath = path.join(outputDir, 'user-data');
  t.after(() => {
    removeOwnedProfile(outputDir, userDataPath);
    fs.rmSync(outputDir, { recursive: true, force: true });
  });
  const run = spawnElectronVerificationSync(['scripts/verify-set-choice-responsive.js'], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, SET_CHOICE_REPORT: reportPath, SET_CHOICE_USER_DATA: userDataPath },
    timeout: 220_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  const profileCleanup = removeOwnedProfile(outputDir, userDataPath);
  run.profileCleanup = profileCleanup;
  assertElectronSucceeded(assert, run, reportPath);
  assert.equal(profileCleanup.exists, false, `Electron userData profile remained: ${JSON.stringify(profileCleanup)}`);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(new Set(report.rows.map(row => `${row.viewport}/${row.locale}`)).size, 8 * 6);
  assert.deepEqual(report.rows.flatMap(row => row.fail), []);
});
