'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { authenticate } = require('../kiosk-runtime-auth.js');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const claims = { role: 'kiosk', storeId: 'store-a', kioskId: 'kiosk-a' };

function user(customClaims = claims) {
  return {
    uid: 'principal-a',
    getIdTokenResult: async () => ({ claims: customClaims })
  };
}

function firebaseHarness(currentUser = null, ready = async () => {}) {
  const calls = [];
  const auth = {
    currentUser,
    authStateReady: ready,
    async signInWithCustomToken(value) {
      calls.push(['signInWithCustomToken', value]);
      auth.currentUser = user();
      return { user: auth.currentUser };
    },
    async signOut() {
      calls.push(['signOut']);
      auth.currentUser = null;
    }
  };
  return { firebase: { auth: () => auth }, auth, calls };
}

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  assert.fail('expected promise to reject');
}

test('currentUser succeeds without consuming a credential', async () => {
  const harness = firebaseHarness(user());
  let consumed = 0;
  const identity = await authenticate({
    firebase: harness.firebase,
    identityBridge: { async consumeCustomToken() { consumed += 1; return null; } }
  });
  assert.equal(identity.kioskId, 'kiosk-a');
  assert.equal(consumed, 0);
  assert.deepEqual(harness.calls, []);
});

test('missing currentUser and credential throws app Error with safe decision diagnostics', async () => {
  const harness = firebaseHarness();
  const error = await rejection(authenticate({
    firebase: harness.firebase,
    identityBridge: { async consumeCustomToken() { return null; } }
  }));
  assert.match(error.message, /KIOSK_AUTH_REQUIRED/);
  assert.equal(error.code, undefined);
  assert.deepEqual(error.authDiagnostics, {
    authMode: 'custom-token',
    hasCurrentUser: false,
    authReadyState: 'awaited',
    credentialSource: 'preload-ipc',
    credentialPresent: false,
    customTokenSignInSucceeded: false,
    persistenceUserRestored: false,
    authenticationComplete: false,
    persistenceType: 'firebase-default',
    packaged: null,
    protocol: null,
    authDecision: 'reject',
    authFailureReason: 'missing-kiosk-credential'
  });
});

test('present credential calls only signInWithCustomToken and never logs its value', async () => {
  const harness = firebaseHarness();
  const secret = 'sensitive-custom-token';
  const messages = [];
  const previousInfo = console.info;
  console.info = (...items) => messages.push(items);
  try {
    await authenticate({
      firebase: harness.firebase,
      identityBridge: { async consumeCustomToken() { return secret; } }
    });
  } finally {
    console.info = previousInfo;
  }
  assert.deepEqual(harness.calls, [['signInWithCustomToken', secret]]);
  assert.doesNotMatch(JSON.stringify(messages), new RegExp(secret));
});

test('auth restoration waits for a delayed currentUser and does not consume a credential', async () => {
  const harness = firebaseHarness();
  harness.auth.authStateReady = async () => {
    await new Promise(resolve => setTimeout(resolve, 10));
    harness.auth.currentUser = user();
  };
  let consumed = 0;
  await assert.doesNotReject(authenticate({
    firebase: harness.firebase,
    identityBridge: { async consumeCustomToken() { consumed += 1; return 'unused'; } },
    authReadyTimeoutMs: 100
  }));
  assert.equal(consumed, 0);
  assert.deepEqual(harness.calls, []);
});

test('compat onAuthStateChanged fallback waits once for restored currentUser', async () => {
  const harness = firebaseHarness();
  delete harness.auth.authStateReady;
  harness.auth.onAuthStateChanged = callback => {
    const timer = setTimeout(() => {
      harness.auth.currentUser = user();
      callback(harness.auth.currentUser);
    }, 10);
    return () => clearTimeout(timer);
  };
  await assert.doesNotReject(authenticate({
    firebase: harness.firebase,
    identityBridge: null,
    authReadyTimeoutMs: 100
  }));
});

test('auth restoration timeout uses a present custom token', async () => {
  const harness = firebaseHarness(null, () => new Promise(() => {}));
  await assert.doesNotReject(authenticate({
    firebase: harness.firebase,
    identityBridge: { async consumeCustomToken() { return 'one-time-token'; } },
    authReadyTimeoutMs: 5
  }));
  assert.deepEqual(harness.calls, [['signInWithCustomToken', 'one-time-token']]);
});

test('packaged and development flags do not add an authentication fallback', async () => {
  const previousDiagnostics = globalThis.PJ_KIOSK_DIAGNOSTICS;
  for (const packaged of [true, false]) {
    globalThis.PJ_KIOSK_DIAGNOSTICS = { snapshot: () => ({ environment: { packaged } }) };
    const harness = firebaseHarness();
    const error = await rejection(authenticate({ firebase: harness.firebase, identityBridge: null }));
    assert.match(error.message, /KIOSK_AUTH_REQUIRED/);
    assert.equal(error.authDiagnostics.packaged, packaged);
    assert.equal(error.authDiagnostics.credentialSource, 'none');
  }
  globalThis.PJ_KIOSK_DIAGNOSTICS = previousDiagnostics;
});

test('credential supply is environment to one-shot main memory to IPC preload only', () => {
  assert.match(mainSource, /process\.env\.PJ_KIOSK_FIREBASE_CUSTOM_TOKEN \|\| null/);
  assert.match(mainSource, /const token = kioskFirebaseCustomToken;\s*kioskFirebaseCustomToken = null;\s*return token;/);
  assert.match(preloadSource, /ipcRenderer\.invoke\('kiosk-identity:consume-custom-token'\)/);
  assert.match(htmlSource, /error\?\.authDiagnostics\|\|\{\}/);
  const authSources = mainSource + preloadSource +
    fs.readFileSync(path.join(root, 'kiosk-runtime-auth.js'), 'utf8');
  assert.doesNotMatch(authSources, /localStorage|sessionStorage|signInAnonymously/);
  assert.match(authSources, /authStateReady/);
  assert.match(authSources, /onAuthStateChanged/);
});

test('reconnect repeats the same missing-input failure without creating a channel', async () => {
  const harness = firebaseHarness();
  let consumes = 0;
  const bridge = { async consumeCustomToken() { consumes += 1; return null; } };
  await assert.rejects(authenticate({ firebase: harness.firebase, identityBridge: bridge }), /KIOSK_AUTH_REQUIRED/);
  await assert.rejects(authenticate({ firebase: harness.firebase, identityBridge: bridge }), /KIOSK_AUTH_REQUIRED/);
  assert.equal(consumes, 2);
  assert.deepEqual(harness.calls, []);
});

test('role and kiosk identity claims are enforced without logging UID', async () => {
  for (const invalidClaims of [
    { role: 'admin', storeId: 'store-a', kioskId: 'kiosk-a' },
    { role: 'kiosk', storeId: 'store-b', kioskId: 'kiosk-a' },
    { role: 'kiosk', storeId: 'store-a', kioskId: 'kiosk-b' }
  ]) {
    const harness = firebaseHarness(user(invalidClaims));
    await assert.rejects(authenticate({
      firebase: harness.firebase,
      storeId: 'store-a',
      kioskId: 'kiosk-a'
    }), /KIOSK_IDENTITY_MISMATCH/);
    assert.deepEqual(harness.calls, [['signOut']]);
  }

  const messages = [];
  const previousInfo = console.info;
  console.info = (...items) => messages.push(items);
  try {
    const harness = firebaseHarness(user());
    await authenticate({ firebase: harness.firebase, storeId: 'store-a', kioskId: 'kiosk-a' });
  } finally {
    console.info = previousInfo;
  }
  assert.doesNotMatch(JSON.stringify(messages), /principal-a/);
});

test('bootstrap tooling never persists credentials or includes service account material', () => {
  const powershell = fs.readFileSync(path.join(root, 'scripts', 'bootstrap-kiosk-auth.ps1'), 'utf8');
  const generator = fs.readFileSync(path.join(root, 'scripts', 'create-kiosk-custom-token.js'), 'utf8');
  assert.doesNotMatch(powershell, /SetEnvironmentVariable\([^)]*,\s*[^,]+,\s*['"](?:User|Machine)['"]/i);
  assert.doesNotMatch(powershell, /Registry|Set-ItemProperty|New-ItemProperty/i);
  assert.match(powershell, /SetEnvironmentVariable\(\$environmentName, \$plainToken, 'Process'\)/);
  assert.match(generator, /firebase-admin\/auth/);
  assert.match(generator, /EXPECTED_PROJECT_ID = 'papajohns-kiosk'/);
  assert.doesNotMatch(generator, /private_key|BEGIN PRIVATE KEY/);
});

test('bootstrap checks the selected executable process before setting any token environment', () => {
  const powershell = fs.readFileSync(path.join(root, 'scripts', 'bootstrap-kiosk-auth.ps1'), 'utf8');
  const processCheck = powershell.indexOf('Get-Process -Name $processName');
  const pathComparison = powershell.indexOf('[StringComparison]::OrdinalIgnoreCase');
  const alreadyRunningError = powershell.indexOf('PapaJohns Kiosk is already running.');
  const environmentSet = powershell.indexOf(
    "[Environment]::SetEnvironmentVariable($environmentName, $plainToken, 'Process')"
  );
  const processStart = powershell.indexOf('Start-Process -FilePath $resolvedExecutablePath');

  assert.ok(processCheck >= 0);
  assert.ok(pathComparison > processCheck);
  assert.ok(alreadyRunningError > pathComparison);
  assert.ok(environmentSet > alreadyRunningError);
  assert.ok(processStart > environmentSet);
  assert.match(powershell, /path cannot be verified[\s\S]+run this bootstrap script again/);
});

test('running-process guard never starts or terminates the existing kiosk and always clears secrets', () => {
  const powershell = fs.readFileSync(path.join(root, 'scripts', 'bootstrap-kiosk-auth.ps1'), 'utf8');
  const guard = powershell.match(
    /foreach \(\$runningProcess[\s\S]+?(?=\n    \[Environment\]::SetEnvironmentVariable)/
  )?.[0] || '';

  assert.match(guard, /throw 'PapaJohns Kiosk is already running\./);
  assert.doesNotMatch(guard, /Start-Process/);
  assert.doesNotMatch(powershell, /Stop-Process|taskkill/i);
  assert.doesNotMatch(powershell, /SetEnvironmentVariable\([^)]*,\s*[^,]+,\s*['"](?:User|Machine)['"]/i);
  assert.match(
    powershell,
    /\[Environment\]::SetEnvironmentVariable\(\$environmentName, \$null, 'Process'\)/
  );
  assert.match(powershell, /\$plainToken = \$null/);
  assert.match(powershell, /ZeroFreeBSTR\(\$tokenPointer\)/);
});
