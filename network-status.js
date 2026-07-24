(function initializeNetworkStatus(global) {
  'use strict';

  let online = global.navigator.onLine;
  const subscribers = new Set();

  function snapshot() {
    return Object.freeze({ online });
  }

  function renderIndicator() {
    const indicator = document.getElementById('networkStatus');
    if (!indicator) return;
    indicator.dataset.online = String(online);
    indicator.setAttribute('role', online ? 'status' : 'alert');
    indicator.textContent = online
      ? '온라인 · 인터넷 연결됨'
      : '오프라인 · 인터넷 연결을 확인해 주세요';
  }

  function update(nextOnline) {
    const changed = online !== nextOnline;
    online = nextOnline;
    renderIndicator();
    if (!changed) return;
    const detail = snapshot();
    subscribers.forEach(listener => listener(detail));
    global.dispatchEvent(new CustomEvent('pj:network-status', { detail }));
  }

  function subscribe(listener) {
    subscribers.add(listener);
    listener(snapshot());
    return () => subscribers.delete(listener);
  }

  global.PJ_NETWORK = Object.freeze({
    isOnline: () => online,
    subscribe
  });
  global.addEventListener('online', () => update(true));
  global.addEventListener('offline', () => update(false));
  document.addEventListener('DOMContentLoaded', renderIndicator, { once: true });
}(window));
