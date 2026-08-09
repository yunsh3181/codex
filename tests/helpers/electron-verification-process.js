const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const waitBuffer = new Int32Array(new SharedArrayBuffer(4));
const LOCK_POLL_MS = 100;
const LOCK_GRACE_MS = 2_000;
const LOCK_TIMEOUT_MS = 10 * 60_000;

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function lockPathFor(cwd) {
  const identity = crypto.createHash('sha256').update(path.resolve(cwd)).digest('hex').slice(0, 16);
  return path.join(os.tmpdir(), `electron-verification-${identity}.lock`);
}

function recoverStaleLock(lockPath) {
  let stat;
  let owner;
  try {
    stat = fs.statSync(lockPath);
    owner = JSON.parse(fs.readFileSync(path.join(lockPath, 'owner.json'), 'utf8'));
  } catch {
    if (!stat) {
      try { stat = fs.statSync(lockPath); } catch { return false; }
    }
  }
  if (owner && processIsAlive(owner.pid)) return false;
  if (Date.now() - stat.mtimeMs < LOCK_GRACE_MS) return false;
  const stalePath = `${lockPath}.stale-${process.pid}-${crypto.randomUUID()}`;
  try {
    fs.renameSync(lockPath, stalePath);
    fs.rmSync(stalePath, { recursive: true, force: true });
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return true;
    return false;
  }
}

function acquireElectronLock(cwd, timeoutMs = LOCK_TIMEOUT_MS) {
  const lockPath = lockPathFor(cwd);
  const token = crypto.randomUUID();
  const startedAt = Date.now();
  let staleLocksRecovered = 0;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      fs.mkdirSync(lockPath);
      const owner = { pid: process.pid, token, acquiredAt: new Date().toISOString(), cwd: path.resolve(cwd) };
      fs.writeFileSync(path.join(lockPath, 'owner.json'), `${JSON.stringify(owner)}\n`, { flag: 'wx' });
      return { lockPath, token, waitMs: Date.now() - startedAt, staleLocksRecovered };
    } catch (error) {
      if (error.code !== 'EEXIST') {
        try { fs.rmSync(lockPath, { recursive: true, force: true }); } catch {}
        throw error;
      }
      if (recoverStaleLock(lockPath)) staleLocksRecovered += 1;
      else Atomics.wait(waitBuffer, 0, 0, LOCK_POLL_MS);
    }
  }
  throw new Error(`Timed out waiting for Electron verification lock: ${lockPath}`);
}

function releaseElectronLock(lock) {
  let owner;
  try { owner = JSON.parse(fs.readFileSync(path.join(lock.lockPath, 'owner.json'), 'utf8')); } catch { return false; }
  if (owner.token !== lock.token || owner.pid !== process.pid) return false;
  fs.rmSync(lock.lockPath, { recursive: true, force: true });
  return true;
}

function diagnosticPathFor(env = {}) {
  if (env.ELECTRON_VERIFICATION_DIAGNOSTICS) return env.ELECTRON_VERIFICATION_DIAGNOSTICS;
  const uniqueDirectoryKey = Object.keys(env).find(key => /_(SCREENSHOT_DIR|OUTPUT)$/.test(key));
  if (uniqueDirectoryKey && env[uniqueDirectoryKey]) return path.join(env[uniqueDirectoryKey], 'electron-lifecycle.jsonl');
  const userDataKey = Object.keys(env).find(key => /USER_DATA$/.test(key));
  if (userDataKey && env[userDataKey]) return path.join(env[userDataKey], 'electron-lifecycle.jsonl');
  const reportKey = Object.keys(env).find(key => /_REPORT$/.test(key));
  return reportKey && env[reportKey] ? `${env[reportKey]}.lifecycle.jsonl` : null;
}

function spawnElectronSync(command, args, options = {}) {
  const lock = acquireElectronLock(options.cwd || process.cwd());
  const diagnosticsPath = diagnosticPathFor(options.env);
  const env = diagnosticsPath
    ? {
        ...options.env,
        ELECTRON_VERIFICATION_DIAGNOSTICS: diagnosticsPath,
        ELECTRON_VERIFICATION_LOCK_WAIT_MS: String(lock.waitMs),
        ELECTRON_VERIFICATION_STALE_LOCKS_RECOVERED: String(lock.staleLocksRecovered),
      }
    : options.env;
  let result;
  let released = false;
  try {
    if (diagnosticsPath) fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
    result = spawnSync(command, args, { ...options, env });
    return Object.assign(result, { electronDiagnosticsPath: diagnosticsPath, electronLock: lock });
  } finally {
    released = releaseElectronLock(lock);
    if (result) result.electronLockReleased = released;
  }
}

function assertElectronSucceeded(assert, result, expectedReportPath) {
  const details = `${electronResultDetails(result)}\nexpected report: ${expectedReportPath}`;
  assert.equal(result.error?.code === 'ETIMEDOUT', false, details);
  assert.equal(result.error, undefined, details);
  assert.equal(result.signal, null, details);
  assert.equal(result.status, 0, details);
  assert.equal(result.electronLockReleased, true, details);
  assert.ok(fs.existsSync(expectedReportPath), `Electron exited normally without creating its report.\n${details}`);
  assert.doesNotThrow(() => JSON.parse(fs.readFileSync(expectedReportPath, 'utf8')), details);
}

function electronResultDetails(result) {
  let diagnostics = 'unavailable';
  if (result.electronDiagnosticsPath) {
    try { diagnostics = fs.readFileSync(result.electronDiagnosticsPath, 'utf8').trim() || 'empty'; }
    catch (error) { diagnostics = `${error.code || error.name}: ${error.message}`; }
  }
  return [
    `status: ${String(result.status)}`,
    `signal: ${String(result.signal)}`,
    `timeout: ${result.error?.code === 'ETIMEDOUT'}`,
    `error: ${result.error ? `${result.error.name}: ${result.error.message}` : 'none'}`,
    `lock wait ms: ${result.electronLock?.waitMs ?? 'unknown'}`,
    `stale locks recovered: ${result.electronLock?.staleLocksRecovered ?? 'unknown'}`,
    `lock released: ${String(result.electronLockReleased)}`,
    `diagnostics path: ${result.electronDiagnosticsPath || 'none'}`,
    `lifecycle diagnostics:\n${diagnostics}`,
    `stdout:\n${result.stdout || ''}`,
    `stderr:\n${result.stderr || ''}`,
  ].join('\n');
}

module.exports = {
  acquireElectronLock,
  assertElectronSucceeded,
  electronResultDetails,
  lockPathFor,
  releaseElectronLock,
  spawnElectronSync,
};
