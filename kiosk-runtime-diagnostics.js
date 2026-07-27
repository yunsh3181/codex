(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) root.PJ_KIOSK_DIAGNOSTICS = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';

  const MAX_ENTRIES = 200;
  const SECRET_KEY = /api.?key|access.?token|refresh.?token|authorization|password|payment|phone|customer|order/i;
  const state = {
    environment: {},
    entries: [],
    currentStage: null,
    lastSuccessfulStage: null,
    lastErrorStage: null,
    context: {},
    flags: {
      remoteModuleLoaded: false,
      firebaseReady: false,
      authenticated: false,
      channelCreated: false,
      channelStarted: false
    },
    lastPresenceWriteAt: null,
    lastHeartbeatAt: null
  };
  const listeners = new Set();
  const failureStage = stage => /(?:missing|failed|error|rejection)$/.test(stage);
  const lifecycleStage = Object.freeze({
    'connect-runtime-attempt': 'authentication-start',
    'authentication-complete': 'authentication-success',
    connected: 'channel-connected'
  });

  function safeString(value, limit = 2000) {
    return String(value == null ? '' : value).replace(/(apiKey=)[^&\s]+/ig, '$1[REDACTED]').slice(0, limit);
  }

  function sanitize(value, seen = new WeakSet()) {
    if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (typeof value === 'string') return safeString(value);
    if (value instanceof Error) return errorDetails(value);
    if (typeof value !== 'object') return safeString(value);
    if (seen.has(value)) return '[Circular]';
    seen.add(value);
    if (Array.isArray(value)) return value.slice(0, 50).map(item => sanitize(item, seen));
    const output = {};
    for (const [key, item] of Object.entries(value)) {
      output[key] = SECRET_KEY.test(key) ? '[REDACTED]' : sanitize(item, seen);
    }
    return output;
  }

  function errorDetails(error) {
    return {
      errorCode: safeString(error?.code || '', 200) || null,
      errorName: safeString(error?.name || 'Error', 200),
      errorMessage: safeString(error?.message || error || '', 1000),
      stack: safeString(error?.stack || '', 4000) || null
    };
  }

  function safeLocation() {
    return `${root.location?.protocol || ''}//${root.location?.host || ''}${root.location?.pathname || ''}`;
  }

  function snapshot() {
    return sanitize({
      ...state,
      online: root.navigator?.onLine !== false,
      documentReadyState: root.document?.readyState || null
    });
  }

  function notify() {
    const value = snapshot();
    for (const listener of listeners) {
      try { listener(value); } catch {}
    }
  }

  function updateContext(context = {}) {
    state.context = { ...state.context, ...sanitize(context) };
    notify();
  }

  function record(stage, details = {}) {
    const previousStage = state.currentStage;
    const clean = sanitize(details);
    const entry = {
      timestamp: new Date().toISOString(),
      appVersion: state.environment.appVersion || clean.appVersion || null,
      stage,
      projectId: clean.projectId ?? state.context.projectId ?? null,
      storeId: clean.storeId ?? state.context.storeId ?? null,
      kioskId: clean.kioskId ?? state.context.kioskId ?? null,
      path: clean.path ?? state.context.path ?? null,
      sessionId: clean.sessionId ?? state.context.sessionId ?? null,
      online: root.navigator?.onLine !== false,
      documentReadyState: root.document?.readyState || null,
      protocol: root.location?.protocol || null,
      location: safeLocation(),
      userAgent: root.navigator?.userAgent || null,
      packaged: state.environment.packaged ?? null,
      previousStage,
      ...clean
    };
    state.currentStage = stage;
    if (failureStage(stage)) state.lastErrorStage = stage;
    else state.lastSuccessfulStage = stage;
    if (stage === 'presence-write-success') state.lastPresenceWriteAt = entry.timestamp;
    if (stage === 'heartbeat-started' || stage === 'connected') state.lastHeartbeatAt = entry.timestamp;
    state.entries.push(entry);
    if (state.entries.length > MAX_ENTRIES) state.entries.splice(0, state.entries.length - MAX_ENTRIES);
    root.console?.info?.('[remote-runtime][kiosk]', entry);
    if (lifecycleStage[stage]) {
      root.console?.info?.(`[remote-test-mode][kiosk] ${lifecycleStage[stage]}`, {
        storeId: entry.storeId,
        kioskId: entry.kioskId,
        sessionId: entry.sessionId
      });
    }
    Promise.resolve(root.kioskDiagnosticsBridge?.append?.(entry)).catch(() => {});
    notify();
    return entry;
  }

  function setFlag(name, value = true) {
    if (Object.hasOwn(state.flags, name)) state.flags[name] = value === true;
    notify();
  }

  function onChange(listener) {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    listener(snapshot());
    return () => listeners.delete(listener);
  }

  function initialize() {
    try {
      state.environment = sanitize(root.kioskDiagnosticsBridge?.getEnvironment?.() || {});
    } catch {}
    root.kioskDiagnosticsBridge?.onBootstrapCredentialChange?.(environment => {
      state.environment = {
        ...state.environment,
        ...sanitize(environment || {})
      };
      notify();
    });
    record('app-start', { source: 'kiosk-runtime-diagnostics.js:initialize' });
    record('document-loading', { source: 'kiosk-runtime-diagnostics.js:load' });
  }

  function installGlobalErrorHandlers() {
    root.addEventListener?.('error', event => {
      const scriptFailure = event?.target && event.target !== root && (event.target.src || event.target.href);
      record(scriptFailure ? 'script-load-failed' : 'uncaught-error', {
        source: scriptFailure ? safeString(event.target.src || event.target.href) : safeString(event?.filename || 'window.error'),
        ...errorDetails(event?.error || event?.message || 'Unknown renderer error')
      });
    }, true);
    root.addEventListener?.('unhandledrejection', event => {
      record('unhandled-rejection', {
        source: 'window.unhandledrejection',
        ...errorDetails(event?.reason || 'Unhandled promise rejection')
      });
    });
  }

  installGlobalErrorHandlers();
  initialize();

  return Object.freeze({
    errorDetails,
    initialize,
    onChange,
    record,
    sanitize,
    setFlag,
    snapshot,
    updateContext
  });
});
