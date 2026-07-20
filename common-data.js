
(function(global){
  'use strict';
  const SCHEMA_VERSION = 2;
  const STORE_ID = 'pangyo2-techno-valley';

  function normalizePhone(value){
    return String(value || '').replace(/\D/g, '').slice(0, 11);
  }
  function maskPhone(value){
    const digits = normalizePhone(value);
    if (digits.length < 4) return null;
    return digits.length === 11
      ? `${digits.slice(0,3)}-****-${digits.slice(-4)}`
      : `***-${digits.slice(-4)}`;
  }
  function buildClientMeta(channel, version){
    return {
      channel,
      deviceId: localStorage.getItem('pjDeviceId') || `${channel}-01`,
      appVersion: version,
      schemaVersion: SCHEMA_VERSION,
      storeId: STORE_ID,
      storeName: '판교2테크노밸리점'
    };
  }
  function legacyChannel(order){
    if (order.channel) return order.channel;
    const src = String(order.source || '').toLowerCase();
    return src.includes('mobile') ? 'mobile' : 'pc';
  }
  global.PJCommon = {
    SCHEMA_VERSION,
    STORE_ID,
    normalizePhone,
    maskPhone,
    buildClientMeta,
    legacyChannel
  };
})(window);
