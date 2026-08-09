const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  acquireElectronLock,
  diagnosticPathFor,
  lockPathFor,
  releaseElectronLock,
} = require('./helpers/electron-verification-process');

test('diagnostics never treat GitHub output command files as directories', () => {
  assert.equal(diagnosticPathFor({
    GITHUB_OUTPUT: '/runner/_temp/_runner_file_commands/set_output-id',
    WAITING_TV_REPORT: '/tmp/waiting/report.json',
    WAITING_TV_USER_DATA: '/tmp/waiting/profile',
  }), path.join('/tmp/waiting/profile', 'electron-lifecycle.jsonl'));
  assert.equal(diagnosticPathFor({
    GITHUB_OUTPUT: '/runner/_temp/_runner_file_commands/set_output-id',
    ADMIN_CENTRAL_REPORT: '/tmp/admin-report.json',
    ADMIN_CENTRAL_SCREENSHOT_DIR: '/tmp/admin-screens',
  }), path.join('/tmp/admin-screens', 'electron-lifecycle.jsonl'));
});

test('Electron verification lock is atomic, owner-bound, and released', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-lock-test-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const lock = acquireElectronLock(cwd);
  assert.ok(fs.existsSync(path.join(lock.lockPath, 'owner.json')));
  assert.equal(releaseElectronLock({ ...lock, token: 'not-the-owner' }), false);
  assert.ok(fs.existsSync(lock.lockPath));
  assert.equal(releaseElectronLock(lock), true);
  assert.equal(fs.existsSync(lock.lockPath), false);
});

test('Electron verification lock recovers a dead owner without a retrying spawn', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'electron-stale-lock-test-'));
  const lockPath = lockPathFor(cwd);
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  t.after(() => fs.rmSync(lockPath, { recursive: true, force: true }));
  fs.mkdirSync(lockPath);
  fs.writeFileSync(path.join(lockPath, 'owner.json'), JSON.stringify({ pid: 2147483647, token: 'dead' }));
  const old = new Date(Date.now() - 10_000);
  fs.utimesSync(lockPath, old, old);
  const lock = acquireElectronLock(cwd, 1_000);
  assert.equal(lock.staleLocksRecovered, 1);
  assert.equal(releaseElectronLock(lock), true);
});
