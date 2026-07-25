(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PJ_AFTER_HOURS_TEST_MODE = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const DURATION_MS = 30 * 60 * 1000;
  const CHANNEL_NAME = 'pj-after-hours-test-mode-v1';
  const OFF_STATE = Object.freeze({ enabled: false, enabledAt: null, expiresAt: null });

  function normalizeState(value, now = Date.now()) {
    const enabledAt = Number(value?.enabledAt);
    const expiresAt = Number(value?.expiresAt);
    if (value?.enabled !== true || !Number.isFinite(enabledAt) || !Number.isFinite(expiresAt) || expiresAt <= now) {
      return { ...OFF_STATE };
    }
    return { enabled: true, enabledAt, expiresAt };
  }

  function createController({
    role,
    now = () => Date.now(),
    channelFactory = name => typeof BroadcastChannel === 'function' ? new BroadcastChannel(name) : null,
    runtime = typeof window !== 'undefined' ? window.kioskTestMode : null,
    onChange = () => {},
    onConnection = () => {},
    onExpire = () => {},
    onOpening = () => {}
  } = {}) {
    let state = { ...OFF_STATE };
    let channel = null;
    let expiryTimer = null;
    let minuteTimer = null;
    let heartbeatTimer = null;
    let lastPeerAt = 0;
    let disposed = false;
    let activeRequestId = null;
    const seenRequestIds = new Set();
    const changeListeners = new Set();

    const snapshot = () => ({ ...state });
    const peerConnected = () => now() - lastPeerAt < 15000;
    const emitConnection = () => onConnection({ connected: peerConnected(), lastPeerAt });

    function clearTimers() {
      clearTimeout(expiryTimer);
      clearInterval(minuteTimer);
      expiryTimer = minuteTimer = null;
    }

    function notify(reason) {
      const meta = { reason, connected: peerConnected() };
      onChange(snapshot(), meta);
      for (const listener of changeListeners) listener(snapshot(), meta);
    }

    function broadcast(type, extra = {}) {
      channel?.postMessage({ type, sourceRole: role, sentAt: now(), state: snapshot(), requestId: activeRequestId, ...extra });
    }

    function apply(next, reason, { relay = false } = {}) {
      const normalized = normalizeState(next, now());
      const changed = normalized.enabled !== state.enabled ||
        normalized.enabledAt !== state.enabledAt ||
        normalized.expiresAt !== state.expiresAt;
      state = normalized;
      clearTimers();
      if (state.enabled) {
        expiryTimer = setTimeout(() => disable('expired'), Math.max(1, state.expiresAt - now()));
        minuteTimer = setInterval(() => notify('tick'), 60000);
      }
      if (changed || reason === 'tick') notify(reason);
      if (relay) broadcast('state');
      return snapshot();
    }

    async function syncRuntime(next) {
      if (!runtime?.setState) return;
      try { await runtime.setState(next); } catch (error) { console.warn('테스트 모드 런타임 동기화 실패', error); }
    }

    function enable(command = {}) {
      const enabledAt = Number(command.enabledAt) || now();
      const next = { enabled: true, enabledAt, expiresAt: Number(command.expiresAt) || enabledAt + DURATION_MS };
      activeRequestId = command.requestId || activeRequestId;
      apply(next, 'enabled');
      broadcast('enable');
      syncRuntime(next);
      return snapshot();
    }

    function disable(reason = 'disabled', requestId = null) {
      const wasEnabled = state.enabled;
      activeRequestId = null;
      apply(OFF_STATE, reason);
      broadcast('disable', { reason, requestId });
      syncRuntime(OFF_STATE);
      if (wasEnabled && reason === 'expired') onExpire();
      if (wasEnabled && reason === 'opening') onOpening();
      return snapshot();
    }

    function applyCommand(command, source = 'remote') {
      const requestId = String(command?.requestId || '');
      if (!requestId || seenRequestIds.has(requestId)) return false;
      seenRequestIds.add(requestId);
      if (seenRequestIds.size > 100) seenRequestIds.delete(seenRequestIds.values().next().value);
      if (command.action === 'enable') {
        const expiresAt = Number(command.expiresAt);
        if (!Number.isFinite(expiresAt) || expiresAt <= now()) return false;
        enable({ requestId, enabledAt: command.enabledAt, expiresAt });
        return true;
      }
      if (command.action === 'disable') {
        disable(`${source}-disabled`, requestId);
        return true;
      }
      return false;
    }

    function checkOpening(isBusinessOpen) {
      if (state.enabled && isBusinessOpen) disable('opening');
    }

    function receive(event) {
      const message = event?.data;
      if (!message || message.sourceRole === role) return;
      lastPeerAt = now();
      emitConnection();
      if (message.type === 'hello' || message.type === 'request-state') {
        broadcast('state');
        return;
      }
      if (message.type === 'state' && (message.state?.enabled || !state.enabled)) apply(message.state, 'remote');
      if (message.type === 'enable') {
        if (message.requestId) applyCommand({ action: 'enable', requestId: message.requestId, enabledAt: message.state?.enabledAt, expiresAt: message.state?.expiresAt }, 'broadcast');
        else apply(message.state, 'remote-enabled');
      }
      if (message.type === 'disable') {
        if (message.requestId) applyCommand({ action: 'disable', requestId: message.requestId }, 'broadcast');
        else apply(OFF_STATE, message.reason || 'remote-disabled');
      }
      if (message.type === 'ping') broadcast('pong');
    }

    async function start() {
      if (disposed) return snapshot();
      channel = channelFactory(CHANNEL_NAME);
      if (channel) channel.onmessage = receive;
      if (runtime?.getState) {
        try { apply(await runtime.getState(), 'runtime'); } catch (error) { console.warn('테스트 모드 런타임 조회 실패', error); }
        runtime.onState?.(next => apply(next, 'runtime'));
      }
      broadcast('hello');
      broadcast('request-state');
      heartbeatTimer = setInterval(() => { broadcast('ping'); emitConnection(); }, 5000);
      setTimeout(emitConnection, 1200);
      return snapshot();
    }

    function dispose() {
      disposed = true;
      clearTimers();
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
      channel?.close();
      channel = null;
      state = { ...OFF_STATE };
    }

    return {
      start,
      dispose,
      enable,
      disable,
      applyCommand,
      checkOpening,
      getState: snapshot,
      getActiveRequestId: () => activeRequestId,
      isEnabled: () => state.enabled,
      isPeerConnected: peerConnected,
      subscribe(listener) {
        if (typeof listener !== 'function') return () => {};
        changeListeners.add(listener);
        return () => changeListeners.delete(listener);
      }
    };
  }

  return { DURATION_MS, CHANNEL_NAME, OFF_STATE, normalizeState, createController };
});
