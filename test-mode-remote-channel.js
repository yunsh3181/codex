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
  const PRESENCE_CHECK_INTERVAL_MS = 5000;

  function log(scope, event, details = {}) {
    globalThis.console?.info?.(`[remote-test-mode][${scope}] ${event}`, details);
  }

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

  function normalizeIdentity(value) {
    if (value === null || value === undefined) return '';
    return String(value).trim().toLowerCase();
  }

  function evaluateSessions(sessions, {
    storeId,
    kioskId,
    now = Date.now(),
    presenceStaleMs = PRESENCE_STALE_MS
  }) {
    const expectedStoreId = normalizeIdentity(storeId);
    const expectedKioskId = normalizeIdentity(kioskId);
    const evaluated = (Array.isArray(sessions) ? sessions : []).map((candidate, index) => {
      const data = candidate?.data || candidate || {};
      const heartbeatAt = timestampMillis(data.heartbeatAt);
      const reasons = [];
      if (normalizeIdentity(data.storeId) !== expectedStoreId) reasons.push('storeId 불일치');
      if (normalizeIdentity(data.kioskId) !== expectedKioskId) reasons.push('kioskId 불일치');
      if (data.role !== 'kiosk') reasons.push('role 불일치');
      if (!normalizeIdentity(data.sessionId)) reasons.push('sessionId 없음');
      if (!heartbeatAt) reasons.push('heartbeat 미확정');
      else if (now - heartbeatAt > presenceStaleMs) reasons.push('stale heartbeat');
      return {
        index,
        path: candidate?.path || null,
        data,
        heartbeatAt,
        stale: !heartbeatAt || now - heartbeatAt > presenceStaleMs,
        reasons,
        active: reasons.length === 0
      };
    });
    const active = evaluated.filter(candidate => candidate.active)
      .sort((left, right) => right.heartbeatAt - left.heartbeatAt);
    return {
      selected: active[0] || null,
      active,
      evaluated,
      ambiguous: active.length > 1 && active[0].heartbeatAt === active[1].heartbeatAt
    };
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
    let started = false;
    let presenceWriteCount = 0;
    let commandFirstSnapshotLogged = false;
    storeId = normalizeIdentity(storeId);
    kioskId = normalizeIdentity(kioskId);
    sessionId = normalizeIdentity(sessionId);
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
      const writeType = presenceWriteCount === 0 ? 'registration' : 'heartbeat';
      log('kiosk', `${writeType}-start`, {
        path: `runtimeControls/${storeId}/kiosks/${kioskId}`,
        storeId,
        kioskId,
        sessionId,
        role: 'kiosk',
        heartbeatAt: 'serverTimestamp',
        lastSeen: null
      });
      try {
        await presenceRef.set(presencePayload(), { merge: false });
      } catch (error) {
        log('kiosk', `${writeType}-failed`, {
          storeId,
          kioskId,
          sessionId,
          code: error?.code || null,
          message: error?.message || String(error)
        });
        throw error;
      }
      presenceWriteCount += 1;
      log('kiosk', `${writeType}-complete`, {
        path: `runtimeControls/${storeId}/kiosks/${kioskId}`,
        storeId,
        kioskId,
        sessionId,
        presenceWriteCount
      });
      onStatus({ phase: 'connected', kioskId, sessionId });
    }

    async function acknowledge(command, applied) {
      const ack = {
        requestId: command.requestId,
        kioskId,
        sessionId,
        action: command.action,
        applied,
        enabled: controller.isEnabled()
      };
      log('kiosk', 'ack-write-start', {
        path: `runtimeControls/${storeId}/commands/${kioskId}`,
        storeId,
        kioskId,
        sessionId,
        ack
      });
      await commandRef.update({
        ack,
        acknowledgedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      log('kiosk', 'ack-write-complete', {
        path: `runtimeControls/${storeId}/commands/${kioskId}`,
        storeId,
        kioskId,
        sessionId,
        ack
      });
    }

    async function receive(snapshot) {
      log('kiosk', 'command-received', {
        path: `runtimeControls/${storeId}/commands/${kioskId}`,
        exists: Boolean(snapshot.exists),
        storeId,
        kioskId,
        sessionId,
        command: snapshot.exists ? snapshot.data() || {} : null
      });
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
      if (started) return { storeId, kioskId, sessionId };
      started = true;
      stopped = false;
      commandFirstSnapshotLogged = false;
      log('kiosk', 'channel-start', { storeId, kioskId, sessionId });
      heartbeat = setInterval(() => publishPresence().catch(error => onStatus({ phase: 'error', error })), PRESENCE_INTERVAL_MS);
      log('kiosk', 'command-listener-connecting', {
        path: `runtimeControls/${storeId}/commands/${kioskId}`,
        storeId,
        kioskId,
        sessionId
      });
      unsubscribe = commandRef.onSnapshot(snapshot => {
        if (!commandFirstSnapshotLogged) {
          commandFirstSnapshotLogged = true;
          log('kiosk', 'command-listener-first-snapshot', {
            exists: Boolean(snapshot.exists),
            path: `runtimeControls/${storeId}/commands/${kioskId}`,
            storeId,
            kioskId,
            sessionId
          });
        }
        receive(snapshot).catch(error => onStatus({ phase: 'error', error }));
      }, error => {
        log('kiosk', 'command-listener-error', {
          path: `runtimeControls/${storeId}/commands/${kioskId}`,
          storeId,
          kioskId,
          sessionId,
          code: error?.code || null,
          message: error?.message || String(error)
        });
        onStatus({ phase: 'error', error });
      });
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
      await publishPresence().catch(error => onStatus({ phase: 'error', error }));
      return { storeId, kioskId, sessionId };
    }

    function stop() {
      if (!started) return;
      started = false;
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
    storeId = normalizeIdentity(storeId);
    kioskId = normalizeIdentity(kioskId);
    let presenceUnsubscribe = null;
    let commandUnsubscribe = null;
    let ackTimer = null;
    let presenceTimer = null;
    let latestPresence = null;
    let targetSessionId = null;
    let pending = null;
    let currentPhase = 'idle';
    let latestPresenceExists = false;
    let lastCommandId = null;
    let lastAckStatus = '없음';
    const presenceRef = db.collection('runtimeControls').doc(storeId).collection('kiosks').doc(kioskId);
    const commandRef = db.collection('runtimeControls').doc(storeId).collection('commands').doc(kioskId);

    function emit(phase, extra = {}) {
      currentPhase = phase;
      onStatus({ phase, kioskId, targetSessionId, requestId: pending?.requestId || null, ...extra });
    }

    function presenceDiagnostics() {
      const presence = latestPresence || {};
      const path = `runtimeControls/${storeId}/kiosks/${kioskId}`;
      const selection = evaluateSessions(latestPresenceExists ? [{ data: presence, path }] : [], {
        storeId, kioskId, now: now(), presenceStaleMs
      });
      const evaluated = selection.evaluated[0];
      const heartbeatAt = evaluated?.heartbeatAt || 0;
      const lastSeen = timestampMillis(presence.lastSeen);
      const ageMs = heartbeatAt ? now() - heartbeatAt : null;
      const matchesIdentity = Boolean(evaluated && !evaluated.reasons.some(reason => reason.includes('불일치')));
      const stale = evaluated?.stale ?? true;
      return {
        path,
        storeId,
        kioskId,
        queryType: 'document-listener',
        queriedKioskId: kioskId,
        queriedSessionId: presence.sessionId || null,
        selectedSessionId: selection.selected?.data.sessionId || null,
        activeSessionCount: selection.active.length,
        ambiguous: selection.ambiguous,
        stale,
        staleThresholdMs: presenceStaleMs,
        heartbeatAt: heartbeatAt || null,
        heartbeatAgeMs: ageMs,
        lastSeen: lastSeen || null,
        matchesIdentity,
        exclusionReasons: evaluated?.reasons || ['presence 문서 없음'],
        lastCommandId,
        ackStatus: lastAckStatus,
        firestoreQueryResult: {
          exists: latestPresenceExists,
          data: latestPresenceExists ? presence : null
        }
      };
    }

    function refreshPresence() {
      const diagnostics = presenceDiagnostics();
      log('admin', 'presence-stale-evaluation', diagnostics);
      if (diagnostics.selectedSessionId && !diagnostics.ambiguous) {
        const changed = targetSessionId !== diagnostics.selectedSessionId;
        targetSessionId = diagnostics.selectedSessionId;
        if (!pending && (changed || currentPhase !== 'connected')) emit('connected', { diagnostics });
      } else {
        const changed = targetSessionId !== null;
        targetSessionId = null;
        if (!pending && (changed || currentPhase !== 'waiting')) emit('waiting', { diagnostics });
      }
    }

    function watchAck() {
      commandUnsubscribe = commandRef.onSnapshot(snapshot => {
        if (!snapshot.exists) return;
        const command = snapshot.data() || {};
        const ack = command.ack || {};
        if (!pending && ack.requestId === command.requestId && ack.sessionId === targetSessionId &&
          ack.kioskId === kioskId && ack.enabled === false && controller.isEnabled()) {
          controller.applyCommand({ action: 'disable', requestId: `${ack.requestId}:terminated` }, 'kiosk-ack');
          emit('disabled-confirmed');
          return;
        }
        if (!pending) return;
        if (command.storeId !== storeId || command.kioskId !== kioskId ||
          command.targetSessionId !== pending.targetSessionId || command.action !== pending.action ||
          command.requestId !== pending.requestId || ack.requestId !== pending.requestId ||
          ack.sessionId !== pending.targetSessionId || ack.kioskId !== kioskId ||
          ack.action !== pending.action) return;
        clearTimeout(ackTimer);
        ackTimer = null;
        lastAckStatus = ack.applied === true ? 'ACK 수신' : 'ACK 거부';
        if (ack.applied !== true) {
          emit('rejected');
          return;
        }
        const expectedEnabled = pending.action === 'enable';
        if (ack.enabled !== expectedEnabled) {
          emit('rejected');
          return;
        }
        controller.applyCommand({
          action: pending.action,
          requestId: pending.requestId,
          enabledAt: pending.requestedAtMillis,
          expiresAt: pending.expiresAtMillis
        }, 'kiosk-ack');
        emit(pending.action === 'enable' ? 'enabled-confirmed' : 'disabled-confirmed');
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
      log('admin', `${action}-requested`, {
        ...presenceDiagnostics(),
        targetSessionId
      });
      if (!targetSessionId) {
        emit('waiting');
        throw new Error('연결된 키오스크 세션이 없습니다.');
      }
      const requestId = id('request');
      lastCommandId = requestId;
      lastAckStatus = 'ACK 대기';
      const requestedAtMillis = now();
      const expiresAtMillis = action === 'enable'
        ? requestedAtMillis + Math.min(30 * 60 * 1000, globalThis.PJ_AFTER_HOURS_TEST_MODE?.DURATION_MS || 30 * 60 * 1000)
        : requestedAtMillis + ACK_TIMEOUT_MS;
      pending = { requestId, action, targetSessionId, requestedAtMillis, expiresAtMillis };
      emit(action === 'enable' ? 'requesting-enable' : 'requesting-disable');
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
      waitForAck(pending);
      return requestId;
    }

    async function start() {
      presenceUnsubscribe = presenceRef.onSnapshot(snapshot => {
        latestPresenceExists = snapshot.exists;
        latestPresence = snapshot.exists ? snapshot.data() || {} : null;
        log('admin', 'presence-query-result', presenceDiagnostics());
        refreshPresence();
      }, error => {
        log('admin', 'presence-listener-error', {
          path: `runtimeControls/${storeId}/kiosks/${kioskId}`,
          storeId,
          kioskId,
          code: error?.code || null,
          message: error?.message || String(error)
        });
        emit('error', { error });
      });
      presenceTimer = setInterval(refreshPresence, Math.min(PRESENCE_CHECK_INTERVAL_MS, presenceStaleMs));
      watchAck();
    }

    function stop() {
      clearTimeout(ackTimer);
      ackTimer = null;
      clearInterval(presenceTimer);
      presenceTimer = null;
      presenceUnsubscribe?.();
      commandUnsubscribe?.();
      presenceUnsubscribe = commandUnsubscribe = null;
      targetSessionId = null;
      latestPresence = null;
      latestPresenceExists = false;
      pending = null;
    }

    return {
      start,
      stop,
      requestEnable: () => request('enable'),
      requestDisable: () => request('disable'),
      retry: () => request(pending?.action || 'enable'),
      getStatus: () => ({
        phase: currentPhase,
        storeId,
        kioskId,
        targetSessionId,
        pending: pending ? { ...pending } : null,
        diagnostics: presenceDiagnostics()
      })
    };
  }

  return {
    STORE_ID,
    DEFAULT_KIOSK_ID,
    ACK_TIMEOUT_MS,
    PRESENCE_INTERVAL_MS,
    PRESENCE_STALE_MS,
    PRESENCE_CHECK_INTERVAL_MS,
    timestampMillis,
    normalizeIdentity,
    evaluateSessions,
    createKioskChannel,
    createAdminChannel
  };
});
