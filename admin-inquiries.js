(function () {
  'use strict';

  const button = document.getElementById('inquiryNotificationButton');
  const badge = document.getElementById('inquiryNotificationBadge');
  const modal = document.getElementById('inquiryNotificationModal');
  const list = document.getElementById('inquiryNotificationList');
  const closeButton = document.getElementById('closeInquiryNotifications');
  const permissionButton = document.getElementById('enableBrowserNotifications');
  const status = document.getElementById('inquiryNotificationStatus');
  const toast = document.getElementById('inquiryToast');
  const toastText = document.getElementById('inquiryToastText');
  const toastOpenButton = document.getElementById('openInquiryNotificationsFromToast');
  if (!button || !badge || !modal || !list) return;

  const DEFAULT_API = 'https://erp.papabottle.com/api/public/inquiries/notifications';
  const POLL_MS = 20_000;
  const SEEN_KEY = 'pb-inquiry-seen-v2';
  let inquiries = [];
  let timer = null;
  let running = false;
  let firstLoad = true;
  let audioContext = null;
  let returnFocus = null;

  function apiUrl() {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      const override = new URLSearchParams(location.search).get('inquiryApi');
      if (override && /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(override)) return override;
    }
    return DEFAULT_API;
  }

  function setStatus(message = '', isError = false) {
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
    status.hidden = !message;
  }

  function maskedPhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length >= 8 ? `${digits.slice(0, 3)}-****-${digits.slice(-4)}` : '연락처 확인 필요';
  }

  function maskedName(item) {
    if (item.customerNameMasked) return String(item.customerNameMasked);
    const value = String(item.customerName || '고객').trim();
    return `${value.charAt(0) || '고'}${'O'.repeat(Math.min(2, Math.max(1, value.length - 1)))}`;
  }

  function statusText(value) {
    return ({ NEW: '신규', CHECKING: '확인중', CONTACTED: '연락완료', COMPLETED: '완료', CANCELLED: '취소' })[value] || String(value || '상태 확인 필요');
  }

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ko-KR', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Seoul'
    }).format(date);
  }

  function seenIds() {
    try {
      const value = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      return new Set(Array.isArray(value) ? value.filter(id => typeof id === 'string') : []);
    } catch {
      return new Set();
    }
  }

  function saveSeen(ids) {
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(ids).slice(-200))); } catch { /* optional cache */ }
  }

  async function idToken() {
    const user = globalThis.firebase?.auth?.()?.currentUser;
    if (!user) throw new Error('관리자 인증이 필요합니다.');
    return user.getIdToken();
  }

  function requestHeaders(token) {
    return { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  }

  function renderBadge() {
    const count = inquiries.filter(item => item.isUnread === true).length;
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    button.setAttribute('aria-label', `파파보틀 문의 알림${count ? ` 읽지 않음 ${count}건` : ''}`);
  }

  function itemSummary(item) {
    const items = Array.isArray(item.items) ? item.items : [];
    const first = items[0];
    if (!first) return '희망 와인 확인 필요';
    const total = Number(item.totalQuantity) || items.reduce((sum, wine) => sum + Number(wine.quantity || 0), 0);
    return `${String(first.wineName || '와인')}${items.length > 1 ? ` 외 ${items.length - 1}종` : ''} · 총 ${total}병`;
  }

  function appendDetail(details, label, value) {
    const row = document.createElement('div');
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = String(value || '-');
    row.append(term, description);
    details.append(row);
  }

  function safeErpUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.origin === 'https://erp.papabottle.com' && url.pathname.startsWith('/inquiries/') ? url.href : '';
    } catch {
      return '';
    }
  }

  function renderList() {
    list.replaceChildren();
    if (!inquiries.length) {
      const empty = document.createElement('p');
      empty.className = 'inquiry-alert-empty';
      empty.textContent = '확인할 문의가 없습니다.';
      list.append(empty);
      return;
    }

    inquiries.forEach(item => {
      const card = document.createElement('article');
      card.className = `inquiry-alert-card${item.isUnread ? ' is-new' : ''}`;
      card.dataset.inquiryId = String(item.id || '');

      const summary = document.createElement('button');
      summary.type = 'button';
      summary.className = 'inquiry-alert-summary';
      summary.dataset.action = 'toggle-inquiry';
      summary.setAttribute('aria-expanded', 'false');
      const meta = document.createElement('span');
      const state = document.createElement('b');
      state.textContent = `${statusText(item.status)}${item.isUnread ? ' · 미확인' : ''}`;
      meta.append(state, document.createTextNode(formatDate(item.createdAt)));
      const name = document.createElement('strong');
      name.textContent = String(item.customerName || '고객');
      const preview = document.createElement('small');
      preview.textContent = `${itemSummary(item)} · ${maskedPhone(item.phone)}`;
      summary.append(meta, name, preview);

      const detail = document.createElement('div');
      detail.className = 'inquiry-alert-detail';
      detail.hidden = true;
      const details = document.createElement('dl');
      appendDetail(details, '접수시간', formatDate(item.createdAt));
      appendDetail(details, '고객명', item.customerName);
      appendDetail(details, '전화번호', item.phone);
      appendDetail(details, '회사·단체명', item.company);
      appendDetail(details, '희망 와인', (Array.isArray(item.items) ? item.items : []).map(wine => `${String(wine.wineName || '와인')} ${Number(wine.quantity) || 0}병`).join('\n'));
      appendDetail(details, '희망 수령일', item.desiredDate);
      appendDetail(details, '희망 지역', item.desiredRegion);
      appendDetail(details, '요청사항', item.note);

      const actions = document.createElement('div');
      actions.className = 'inquiry-alert-actions';
      const readButton = document.createElement('button');
      readButton.type = 'button';
      readButton.dataset.action = 'read-inquiry';
      readButton.disabled = !item.isUnread;
      readButton.textContent = item.isUnread ? '확인' : '확인됨';
      const phone = document.createElement('a');
      phone.href = `tel:${String(item.phone || '').replace(/\D/g, '')}`;
      phone.textContent = '전화하기';
      const erpUrl = safeErpUrl(item.erpUrl);
      const erp = document.createElement(erpUrl ? 'a' : 'button');
      erp.textContent = 'ERP에서 보기';
      if (erpUrl) {
        erp.href = erpUrl;
        erp.target = '_blank';
        erp.rel = 'noreferrer';
      } else {
        erp.type = 'button';
        erp.disabled = true;
        erp.title = 'ERP 문의 URL 확인 후 활성화됩니다.';
      }
      actions.append(readButton, phone, erp);
      detail.append(details, actions);
      card.append(summary, detail);
      list.append(card);
    });
  }

  function openModal() {
    returnFocus = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('inquiry-alert-open');
    renderList();
    closeButton?.focus();
  }

  function closeModal() {
    modal.hidden = true;
    document.body.classList.remove('inquiry-alert-open');
    returnFocus?.focus?.();
  }

  function showToast(item) {
    if (!toast || !toastText) return;
    toastText.textContent = `${maskedName(item)} · ${itemSummary(item)}`;
    toast.hidden = false;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => {
      toast.classList.remove('show');
      toast.hidden = true;
    }, 6000);
  }

  function playOnce() {
    try {
      if (!audioContext) return;
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.setValueAtTime(740, now);
      oscillator.frequency.setValueAtTime(940, now + 0.12);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.3);
    } catch { /* notification sound is optional */ }
  }

  function browserNotify(item) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const notification = new Notification('PAPA BOTTLE 신규 문의', {
      body: `${maskedName(item)}\n${itemSummary(item)}`,
      tag: `pb-inquiry-${String(item.id || '')}`
    });
    notification.onclick = () => { window.focus(); openModal(); notification.close(); };
  }

  function schedulePoll() {
    clearTimeout(timer);
    timer = null;
    if (!running || document.hidden) return;
    timer = setTimeout(poll, POLL_MS);
  }

  async function poll() {
    if (!running || document.hidden || !globalThis.firebase?.auth?.()?.currentUser) {
      schedulePoll();
      return;
    }
    try {
      const token = await idToken();
      const response = await fetch(apiUrl(), { headers: requestHeaders(token), cache: 'no-store' });
      if (!response.ok) throw new Error(`문의 알림 연결 ${response.status}`);
      const result = await response.json();
      const next = Array.isArray(result?.inquiries) ? result.inquiries.filter(item => item && typeof item.id === 'string') : [];
      const seen = seenIds();
      const added = next.filter(item => item.isUnread === true && !seen.has(item.id));
      inquiries = next;
      renderBadge();
      if (!modal.hidden) renderList();
      setStatus();
      if (firstLoad) {
        const hadSeen = seen.size > 0;
        next.forEach(item => seen.add(item.id));
        saveSeen(seen);
        firstLoad = false;
        if (!hadSeen) return;
      }
      if (added.length) {
        added.forEach(item => seen.add(item.id));
        saveSeen(seen);
        showToast(added[0]);
        playOnce();
        browserNotify(added[0]);
      }
    } catch (error) {
      console.warn('파파보틀 문의 알림을 갱신하지 못했습니다.');
      if (!modal.hidden) setStatus('문의 알림을 불러오지 못했습니다. 잠시 후 다시 시도합니다.', true);
    } finally {
      schedulePoll();
    }
  }

  function start() {
    if (running) return;
    running = true;
    firstLoad = true;
    poll();
  }

  function stop() {
    running = false;
    clearTimeout(timer);
    timer = null;
    inquiries = [];
    renderBadge();
    setStatus();
    closeModal();
  }

  async function markRead(id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('문의 식별자를 확인할 수 없습니다.');
    const token = await idToken();
    const response = await fetch(apiUrl(), {
      method: 'PATCH', headers: requestHeaders(token), body: JSON.stringify({ id })
    });
    if (!response.ok) throw new Error('문의 확인 상태를 저장하지 못했습니다.');
    inquiries = inquiries.map(item => item.id === id ? { ...item, isUnread: false } : item);
    renderBadge();
    renderList();
    setStatus();
  }

  button.addEventListener('click', openModal);
  closeButton?.addEventListener('click', closeModal);
  toastOpenButton?.addEventListener('click', openModal);
  modal.addEventListener('click', event => { if (event.target === modal) closeModal(); });
  list.addEventListener('click', async event => {
    const action = event.target.closest?.('[data-action]');
    const card = action?.closest?.('[data-inquiry-id]');
    if (!action || !card) return;
    if (action.dataset.action === 'toggle-inquiry') {
      const detail = card.querySelector('.inquiry-alert-detail');
      detail.hidden = !detail.hidden;
      action.setAttribute('aria-expanded', String(!detail.hidden));
      return;
    }
    if (action.dataset.action === 'read-inquiry') {
      action.disabled = true;
      try { await markRead(card.dataset.inquiryId); }
      catch { action.disabled = false; setStatus('문의 확인 상태를 저장하지 못했습니다.', true); }
    }
  });

  permissionButton?.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      permissionButton.textContent = '브라우저 알림 미지원';
      permissionButton.disabled = true;
      return;
    }
    const permission = await Notification.requestPermission();
    permissionButton.textContent = permission === 'granted' ? '파파보틀 브라우저 알림 허용됨' : permission === 'denied' ? '파파보틀 브라우저 알림 차단됨' : '파파보틀 브라우저 알림 허용';
    if (permission !== 'default') permissionButton.disabled = true;
  });

  if (permissionButton && 'Notification' in window && Notification.permission !== 'default') {
    permissionButton.textContent = Notification.permission === 'granted' ? '파파보틀 브라우저 알림 허용됨' : '파파보틀 브라우저 알림 차단됨';
    permissionButton.disabled = true;
  }

  document.addEventListener('pointerdown', () => {
    if (!audioContext) {
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (AudioCtor) audioContext = new AudioCtor();
    }
    audioContext?.resume?.();
  }, { once: true });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clearTimeout(timer);
      timer = null;
    } else if (running) {
      poll();
    }
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) closeModal(); });

  globalThis.firebase?.auth?.()?.onAuthStateChanged?.(async user => {
    try {
      const claims = await user?.getIdTokenResult();
      if (user && claims?.claims?.admin === true) start();
      else stop();
    } catch {
      stop();
    }
  });

  window.PapaBottleInquiryAlerts = Object.freeze({ poll, start, stop });
})();
