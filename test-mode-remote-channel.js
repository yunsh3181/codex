(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PJ_TEST_MODE_REMOTE = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const STORE_ID = 'pangyo2-techno-valley';
  const DEFAULT_KIOSK_ID = 'mobile-01';
  const ACK_TIMEOUT_MS = 10000;
  const PRESENCE_INTERVAL_MS = 15000;
  const PRESENCE_STALE_MS = 45000;

  function id(prefix) {
    const uuid = globalThis.crypto?.randomUUID?.();
    return uuid ? `${prefix}-${uuid}` : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function timestampMillis(value) {
    if (!value) return 0;
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.toDate === 'function') return value.toDate().getTime();
    const parsed = new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function createKioskChannel({
    db,
    firebase,
    controller,
    storeId = STORE_ID,
    kioskId = DEFAULT_KIOSK_ID,
    sessionId = id('session'),
    now = () => Date.now(),
    onStatus = () => {}
  }) {
    let unsubscribe = null;
    let heartbeat = null;
    let unsubscribeController = null;
    let lastCommand = null;
    let stopped = false;
    const presenceRef = db.collection('runtimeControls').doc(storeId).collection('kiosks').doc(kioskId);
    const commandRef = db.collection('runtimeControls').doc(storeId).collection('commands').doc(kioskId);

    function presencePayload() {
      return {
        storeId,
        kioskId,
        sessionId,
        role: 'kiosk',
        heartbeatAt: firebase.firestore.FieldValue.serverTimestamp()
      };
    }

    async function publishPresence() {
      if (stopped) return;
      await presenceRef.set(presencePayload(), { merge: false });
      onStatus({ phase: 'connected', kioskId, sessionId });
    }

    async function acknowledge(command, applied) {
      await commandRef.update({
        ack: {
          requestId: command.requestId,
          kioskId,
          sessionId,
          action: command.action,
          applied,
          enabled: controller.isEnabled()
        },
        acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    }

    async function receive(snapshot) {
      if (!snapshot.exists || stopped) return;
      const command = snapshot.data() || {};
      if (command.targetSessionId !== sessionId || command.kioskId !== kioskId || command.storeId !== storeId) return;
      if (!['enable', 'disable'].includes(command.action) || typeof command.requestId !== 'string') return;
      if (command.ack?.requestId === command.requestId && command.ack?.sessionId === sessionId) return;
      const expiresAt = timestampMillis(command.expiresAt);
      if (command.action === 'enable' && (!expiresAt || expiresAt <= now())) {
        await acknowledge(command, false);
        onStatus({ phase: 'expired-request', requestId: command.requestId, kioskId, sessionId });
        return;
      }
      lastCommand = command;
      controller.applyCommand({
        action: command.action,
        requestId: command.requestId,
        enabledAt: timestampMillis(command.requestedAt) || now(),
        expiresAt
      }, 'remote');
      await acknowledge(command, command.action === 'enable' ? controller.isEnabled() : !controller.isEnabled());
      onStatus({ phase: command.action === 'enable' ? 'applied' : 'disabled', requestId: command.requestId, kioskId, sessionId });
    }

    async function start() {
      stopped = false;
      await publishPresence();
      heartbeat = setInterval(() => publishPresence().catch(error => onStatus({ phase: 'error', error })), PRESENCE_INTERVAL_MS);
      unsubscribe = commandRef.onSnapshot(snapshot => receive(snapshot).catch(error => onStatus({ phase: 'error', error })), error => onStatus({ phase: 'error', error }));
      unsubscribeController = controller.subscribe((state, meta) => {
        if (state.enabled || !lastCommand || lastCommand.action !== 'enable') return;
        acknowledge(lastCommand, true).then(() => onStatus({
          phase: 'disabled',
          reason: meta.reason,
          requestId: lastCommand.requestId,
          kioskId,
          sessionId
        })).catch(error => onStatus({ phase: 'error', error }));
      });
      return { storeId, kioskId, sessionId };
    }

    function stop() {
      stopped = true;
      clearInterval(heartbeat);
      heartbeat = null;
      unsubscribe?.();
      unsubscribeController?.();
      unsubscribe = null;
      unsubscribeController = null;
    }

    return { start, stop, publishPresence, receive, getIdentity: () => ({ storeId, kioskId, sessionId }) };
  }

  function createAdminChannel({
    db,
    firebase,
    controller,
    user,
    storeId = STORE_ID,
    kioskId = DEFAULT_KIOSK_ID,
    now = () => Date.now(),
    ackTimeoutMs = ACK_TIMEOUT_MS,
    presenceStaleMs = PRESENCE_STALE_MS,
    onStatus = () => {}
  }) {
    let presenceUnsubscribe = null;
    let commandUnsubscribe = null;
    let ackTimer = null;
    let targetSessionId = null;
    let pending = null;
    const presenceRef = db.collection('runtimeControls').doc(storeId).collection('kiosks').doc(kioskId);
    const commandRef = db.collection('runtimeControls').doc(storeId).collection('commands').doc(kioskId);

    function emit(phase, extra = {}) {
      onStatus({ phase, kioskId, targetSessionId, requestId: pending?.requestId || null, ...extra });
    }

    function watchAck() {
      commandUnsubscribe = commandRef.onSnapshot(snapshot => {
        if (!snapshot.exists) return;
        const command = snapshot.data() || {};
        const ack = command.ack || {};
        if (!pending && ack.requestId === command.requestId && ack.sessionId === targetSessionId &&
          ack.kioskId === kioskId && ack.enabled === false && controller.isEnabled()) {
          controller.applyCommand({ action: 'disable', requestId: `${ack.requestId}:terminated` }, 'kiosk-ack');
          emit('off');
          return;
        }
        if (!pending) return;
        if (command.requestId !== pending.requestId || ack.requestId !== pending.requestId ||
          ack.sessionId !== pending.targetSessionId || ack.kioskId !== kioskId) return;
        clearTimeout(ackTimer);
        ackTimer = null;
        if (ack.applied !== true) {
          emit('rejected');
          return;
        }
        const expectedEnabled = pending.action === 'enable';
        if (ack.enabled !== expectedEnabled) {
          emit('rejected');
          return;
        }
        emit(pending.action === 'enable' ? 'applied' : 'off');
        pending = null;
      }, error => emit('error', { error }));
    }

    function waitForAck(request) {
      clearTimeout(ackTimer);
      ackTimer = setTimeout(() => {
        if (pending?.requestId === request.requestId) emit('no-response');
      }, ackTimeoutMs);
    }

    async function request(action) {
      if (!user?.uid) throw new Error('관리자 인증이 필요합니다.');
      if (!targetSessionId) {
        emit('waiting');
        throw new Error('연결된 키오스크 세션이 없습니다.');
      }
      const requestId = id('request');
      const requestedAtMillis = now();
      const expiresAtMillis = action === 'enable'
        ? requestedAtMillis + Math.min(30 * 60 * 1000, globalThis.PJ_AFTER_HOURS_TEST_MODE?.DURATION_MS || 30 * 60 * 1000)
        : requestedAtMillis + ACK_TIMEOUT_MS;
      pending = { requestId, action, targetSessionId };
      emit('requesting');
      await commandRef.set({
        storeId,
        kioskId,
        targetSessionId,
        action,
        requestId,
        requestedBy: user.uid,
        requestedAt: firebase.firestore.FieldValue.serverTimestamp(),
        expiresAt: firebase.firestore.Timestamp.fromMillis(expiresAtMillis),
        ack: null,
        acknowledgedAt: null
      }, { merge: false });
      controller.applyCommand({ action, requestId, enabledAt: requestedAtMillis, expiresAt: expiresAtMillis }, 'admin-remote');
      waitForAck(pending);
      return requestId;
    }

    async function start() {
      presenceUnsubscribe = presenceRef.onSnapshot(snapshot => {
        const presence = snapshot.exists ? snapshot.data() || {} : {};
        const heartbeatAt = timestampMillis(presence.heartbeatAt);
        if (presence.kioskId === kioskId && presence.storeId === storeId && presence.role === 'kiosk' &&
          typeof presence.sessionId === 'string' && heartbeatAt && now() - heartbeatAt <= presenceStaleMs) {
          targetSessionId = presence.sessionId;
          emit('connected');
        } else {
          targetSessionId = null;
          emit('waiting');
        }
      }, error => emit('error', { error }));
      watchAck();
    }

    function stop() {
      clearTimeout(ackTimer);
      ackTimer = null;
      presenceUnsubscribe?.();
      commandUnsubscribe?.();
      presenceUnsubscribe = commandUnsubscribe = null;
      targetSessionId = null;
      pending = null;
    }

    return {
      start,
      stop,
      requestEnable: () => request('enable'),
      requestDisable: () => request('disable'),
      retry: () => request(pending?.action || 'enable'),
      getStatus: () => ({ kioskId, targetSessionId, pending: pending ? { ...pending } : null })
    };
  }

  return {
    STORE_ID,
    DEFAULT_KIOSK_ID,
    ACK_TIMEOUT_MS,
    PRESENCE_INTERVAL_MS,
    PRESENCE_STALE_MS,
    timestampMillis,
    createKioskChannel,
    createAdminChannel
  };
});
