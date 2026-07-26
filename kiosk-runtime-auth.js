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
      authReadyState: 'not-awaited',
      credentialSource: 'none',
      credentialPresent: false,
      persistenceType: 'firebase-default',
      ...runtimeContext(),
      authDecision: 'pending',
      authFailureReason: null,
      ...overrides
    };
  }

  async function authenticate({
    firebase,
    storeId,
    kioskId,
    identityBridge = typeof window !== 'undefined' ? window.kioskIdentity : null
  }) {
    const auth = firebase?.auth?.();
    let diagnostics = authDiagnostics({
      hasCurrentUser: Boolean(auth?.currentUser),
      credentialSource: auth?.currentUser ? 'firebase-persistence' :
        identityBridge?.consumeCustomToken ? 'preload-ipc' : 'none'
    });
    log('authentication-start', {
      storeId,
      kioskId,
      ...diagnostics
    });
    if (!firebase?.auth) throw new Error('KIOSK_AUTH_SDK_UNAVAILABLE');
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
            ...authDiagnostics({ ...diagnostics, hasCurrentUser: Boolean(user), authDecision: 'accept' })
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
    log('authentication-complete', { storeId, kioskId, role: claims.role });
    return { uid: user.uid, role: claims.role, storeId: claimStoreId, kioskId: claimKioskId };
  }

  return { authenticate };
});
