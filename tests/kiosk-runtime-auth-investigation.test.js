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

function user() {
  return {
    uid: 'principal-a',
    getIdTokenResult: async () => ({ claims })
  };
}

function firebaseHarness(currentUser = null) {
  const calls = [];
  const auth = {
    currentUser,
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
    authReadyState: 'not-awaited',
    credentialSource: 'preload-ipc',
    credentialPresent: false,
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

test('auth restoration is not awaited and a later retry observes restored currentUser', async () => {
  const harness = firebaseHarness();
  await assert.rejects(authenticate({ firebase: harness.firebase, identityBridge: null }), /KIOSK_AUTH_REQUIRED/);
  harness.auth.currentUser = user();
  await assert.doesNotReject(authenticate({ firebase: harness.firebase, identityBridge: null }));
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
  assert.doesNotMatch(authSources, /localStorage|sessionStorage|signInAnonymously|authStateReady|onAuthStateChanged/);
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
