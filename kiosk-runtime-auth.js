(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PJ_KIOSK_RUNTIME_AUTH = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  async function authenticate({
    firebase,
    storeId,
    kioskId,
    identityBridge = typeof window !== 'undefined' ? window.kioskIdentity : null
  }) {
    if (!firebase?.auth) throw new Error('KIOSK_AUTH_SDK_UNAVAILABLE');
    let user = firebase.auth().currentUser;
    if (!user && identityBridge?.consumeCustomToken) {
      let customToken = await identityBridge.consumeCustomToken();
      try {
        if (customToken) user = (await firebase.auth().signInWithCustomToken(customToken)).user;
      } finally {
        customToken = null;
      }
    }
    if (!user) throw new Error('KIOSK_AUTH_REQUIRED');
    const token = await user.getIdTokenResult(true);
    const claims = token?.claims || {};
    if (claims.role !== 'kiosk' || claims.storeId !== storeId || claims.kioskId !== kioskId) {
      await firebase.auth().signOut();
      throw new Error('KIOSK_IDENTITY_MISMATCH');
    }
    return { uid: user.uid, role: claims.role, storeId: claims.storeId, kioskId: claims.kioskId };
  }

  return { authenticate };
});
