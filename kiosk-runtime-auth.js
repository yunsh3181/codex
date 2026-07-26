(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PJ_KIOSK_RUNTIME_AUTH = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function log(event, details = {}) {
    globalThis.console?.info?.(`[remote-test-mode][kiosk-auth] ${event}`, details);
  }

  function runtimeContext() {
    let environment = {};
    try {
      environment = globalThis.PJ_KIOSK_DIAGNOSTICS?.snapshot?.().environment || {};
    } catch {}
    return {
      packaged: environment.packaged ?? null,
      protocol: globalThis.location?.protocol || null
    };
  }

  function authDiagnostics(overrides = {}) {
    return {
      authMode: 'custom-token',
      hasCurrentUser: false,
      authReadyState: 'awaited',
      credentialSource: 'none',
      credentialPresent: false,
      customTokenSignInSucceeded: false,
      persistenceUserRestored: false,
      authenticationComplete: false,
      persistenceType: 'firebase-default',
      ...runtimeContext(),
      authDecision: 'pending',
      authFailureReason: null,
      ...overrides
    };
  }

  async function waitForAuthReady(auth, timeoutMs) {
    const timeout = Math.max(1, Number(timeoutMs) || 5000);
    let timer = null;
    let unsubscribe = null;
    let settled = false;
    const ready = typeof auth.authStateReady === 'function'
      ? Promise.resolve().then(() => auth.authStateReady())
      : new Promise((resolve, reject) => {
        if (typeof auth.onAuthStateChanged !== 'function') {
          resolve();
          return;
        }
        const finish = (callback, value) => {
          if (settled) return;
          settled = true;
          unsubscribe?.();
          callback(value);
        };
        unsubscribe = auth.onAuthStateChanged(
          () => finish(resolve),
          error => finish(reject, error)
        );
        if (settled) unsubscribe?.();
      });
    const timed = new Promise(resolve => {
      timer = setTimeout(() => resolve('timeout'), timeout);
    });
    try {
      return await Promise.race([
        ready.then(() => 'awaited'),
        timed
      ]);
    } finally {
      clearTimeout(timer);
      unsubscribe?.();
    }
  }

  async function authenticate({
    firebase,
    storeId,
    kioskId,
    identityBridge = typeof window !== 'undefined' ? window.kioskIdentity : null,
    authReadyTimeoutMs = 5000
  }) {
    const auth = firebase?.auth?.();
    if (!firebase?.auth || !auth) throw new Error('KIOSK_AUTH_SDK_UNAVAILABLE');
    const hadCurrentUserBeforeReady = Boolean(auth.currentUser);
    const authReadyState = await waitForAuthReady(auth, authReadyTimeoutMs);
    const persistenceUserRestored = !hadCurrentUserBeforeReady && Boolean(auth.currentUser);
    let diagnostics = authDiagnostics({
      hasCurrentUser: Boolean(auth?.currentUser),
      authReadyState,
      persistenceUserRestored,
      credentialSource: auth?.currentUser ? 'firebase-persistence' :
        identityBridge?.consumeCustomToken ? 'preload-ipc' : 'none'
    });
    log('authentication-start', {
      storeId,
      kioskId,
      ...diagnostics
    });
    let user = auth.currentUser;
    if (!user && identityBridge?.consumeCustomToken) {
      let customToken = await identityBridge.consumeCustomToken();
      diagnostics = authDiagnostics({
        ...diagnostics,
        credentialSource: 'preload-ipc',
        credentialPresent: Boolean(customToken)
      });
      log('custom-token-consumed', { storeId, kioskId, ...diagnostics });
      try {
        if (customToken) {
          user = (await auth.signInWithCustomToken(customToken)).user;
          log('custom-token-sign-in-complete', {
            storeId,
            kioskId,
            ...authDiagnostics({
              ...diagnostics,
              hasCurrentUser: Boolean(user),
              customTokenSignInSucceeded: Boolean(user),
              authDecision: 'accept'
            })
          });
          diagnostics = authDiagnostics({
            ...diagnostics,
            hasCurrentUser: Boolean(user),
            customTokenSignInSucceeded: Boolean(user)
          });
        }
      } finally {
        customToken = null;
      }
    }
    if (!user) {
      diagnostics = authDiagnostics({
        ...diagnostics,
        authDecision: 'reject',
        authFailureReason: diagnostics.credentialSource === 'preload-ipc'
          ? 'missing-kiosk-credential'
          : 'credential-source-unavailable'
      });
      log('authentication-failed', { storeId, kioskId, ...diagnostics, reason: 'KIOSK_AUTH_REQUIRED' });
      const error = new Error('KIOSK_AUTH_REQUIRED');
      error.authDiagnostics = diagnostics;
      throw error;
    }
    const token = await user.getIdTokenResult(true);
    const claims = token?.claims || {};
    log('claims-loaded', {
      storeId,
      kioskId,
      claims: {
        role: claims.role || null,
        storeId: claims.storeId || null,
        kioskId: claims.kioskId || null
      }
    });
    const expectedStoreId = storeId == null ? null : String(storeId).trim().toLowerCase();
    const expectedKioskId = kioskId == null ? null : String(kioskId).trim().toLowerCase();
    const claimStoreId = claims.storeId == null ? '' : String(claims.storeId).trim().toLowerCase();
    const claimKioskId = claims.kioskId == null ? '' : String(claims.kioskId).trim().toLowerCase();
    if (claims.role !== 'kiosk' || !claimStoreId || !claimKioskId ||
      (expectedStoreId !== null && claimStoreId !== expectedStoreId) ||
      (expectedKioskId !== null && claimKioskId !== expectedKioskId)) {
      log('authentication-failed', { storeId, kioskId, reason: 'KIOSK_IDENTITY_MISMATCH' });
      await auth.signOut();
      throw new Error('KIOSK_IDENTITY_MISMATCH');
    }
    diagnostics = authDiagnostics({
      ...diagnostics,
      hasCurrentUser: true,
      authenticationComplete: true,
      authDecision: 'accept'
    });
    log('authentication-complete', { storeId, kioskId, role: claims.role, ...diagnostics });
    return { uid: user.uid, role: claims.role, storeId: claimStoreId, kioskId: claimKioskId };
  }

  return { authenticate, waitForAuthReady };
});
