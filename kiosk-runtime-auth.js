(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PJ_KIOSK_RUNTIME_AUTH = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  function log(event, details = {}) {
    globalThis.console?.info?.(`[remote-test-mode][kiosk-auth] ${event}`, details);
  }

  async function authenticate({
    firebase,
    storeId,
    kioskId,
    identityBridge = typeof window !== 'undefined' ? window.kioskIdentity : null
  }) {
    log('authentication-start', {
      storeId,
      kioskId,
      hasCurrentUser: Boolean(firebase?.auth?.().currentUser),
      hasIdentityBridge: Boolean(identityBridge?.consumeCustomToken)
    });
    if (!firebase?.auth) throw new Error('KIOSK_AUTH_SDK_UNAVAILABLE');
    let user = firebase.auth().currentUser;
    if (!user && identityBridge?.consumeCustomToken) {
      let customToken = await identityBridge.consumeCustomToken();
      log('custom-token-consumed', { storeId, kioskId, tokenAvailable: Boolean(customToken) });
      try {
        if (customToken) {
          user = (await firebase.auth().signInWithCustomToken(customToken)).user;
          log('custom-token-sign-in-complete', { storeId, kioskId, uid: user?.uid || null });
        }
      } finally {
        customToken = null;
      }
    }
    if (!user) {
      log('authentication-failed', { storeId, kioskId, reason: 'KIOSK_AUTH_REQUIRED' });
      throw new Error('KIOSK_AUTH_REQUIRED');
    }
    const token = await user.getIdTokenResult(true);
    const claims = token?.claims || {};
    log('claims-loaded', {
      storeId,
      kioskId,
      uid: user.uid,
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
      log('authentication-failed', { storeId, kioskId, uid: user.uid, reason: 'KIOSK_IDENTITY_MISMATCH' });
      await firebase.auth().signOut();
      throw new Error('KIOSK_IDENTITY_MISMATCH');
    }
    log('authentication-complete', { storeId, kioskId, uid: user.uid, role: claims.role });
    return { uid: user.uid, role: claims.role, storeId: claimStoreId, kioskId: claimKioskId };
  }

  return { authenticate };
});
