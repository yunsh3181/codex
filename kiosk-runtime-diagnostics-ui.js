(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) api.initialize(root);
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const text = value => value == null || value === '' ? '-' : String(value);
  const row = (label, value) => `<div><dt>${label}</dt><dd>${escapeHtml(text(value))}</dd></div>`;
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
  }

  function render(snapshot) {
    const error = [...snapshot.entries].reverse().find(entry => /(?:missing|failed|error|rejection)$/.test(entry.stage)) || {};
    const auth = [...snapshot.entries].reverse().find(entry =>
      Object.hasOwn(entry, 'credentialSource') || entry.authDiagnostics
    ) || {};
    const context = snapshot.context || {};
    const environment = snapshot.environment || {};
    const flags = snapshot.flags || {};
    return `<div class="kioskDiagnosticsBackdrop" role="dialog" aria-modal="true" aria-labelledby="kioskDiagnosticsTitle">
      <section class="kioskDiagnosticsPanel">
        <header><div><small>ADMIN · RUNTIME DIAGNOSTICS</small><h2 id="kioskDiagnosticsTitle">키오스크 시작 진단</h2></div>
        <button type="button" data-diagnostics-action="close" aria-label="닫기">×</button></header>
        <dl class="kioskDiagnosticsGrid">
          ${row('앱 버전', environment.appVersion)}${row('Electron', environment.electronVersion)}
          ${row('Chromium', environment.chromiumVersion)}${row('Node', environment.nodeVersion)}
          ${row('packaged', environment.packaged)}${row('현재 stage', snapshot.currentStage)}
          ${row('마지막 성공 stage', snapshot.lastSuccessfulStage)}${row('마지막 오류 stage', snapshot.lastErrorStage)}
          ${row('오류 code', error.errorCode)}${row('오류 message', error.errorMessage)}
          ${row('Firebase projectId', context.projectId)}${row('storeId', context.storeId)}
          ${row('kioskId', context.kioskId)}${row('presence path', context.path)}
          ${row('sessionId', context.sessionId)}${row('online', snapshot.online)}
          ${row('마지막 presence write', snapshot.lastPresenceWriteAt)}${row('마지막 heartbeat', snapshot.lastHeartbeatAt)}
          ${row('remote module', flags.remoteModuleLoaded)}${row('Firebase 초기화', flags.firebaseReady)}
          ${row('인증 완료', flags.authenticated)}${row('channel 생성', flags.channelCreated)}
          ${row('channel.start 완료', flags.channelStarted)}${row('로그 파일', environment.logPath)}
          ${row('Bootstrap credential detected at main startup', environment.bootstrapCredentialPresentAtStartup)}
          ${row('Bootstrap credential requested through IPC', environment.bootstrapCredentialConsumeRequested)}
          ${row('Bootstrap credential present at consume', environment.bootstrapCredentialPresentAtConsume)}
          ${row('Bootstrap credential consumed', environment.bootstrapCredentialConsumed)}
          ${row('credentialSource', auth.credentialSource ?? auth.authDiagnostics?.credentialSource)}
          ${row('credentialPresent', auth.credentialPresent ?? auth.authDiagnostics?.credentialPresent)}
          ${row('customTokenSignInAttempted', auth.customTokenSignInAttempted ?? auth.authDiagnostics?.customTokenSignInAttempted)}
          ${row('customTokenSignInSucceeded', auth.customTokenSignInSucceeded ?? auth.authDiagnostics?.customTokenSignInSucceeded)}
        </dl>
        <h3>최근 진단 로그</h3>
        <pre>${escapeHtml(JSON.stringify(snapshot.entries.slice(-30), null, 2))}</pre>
        <div class="kioskDiagnosticsActions">
          <button type="button" data-diagnostics-action="refresh">새로고침</button>
          <button type="button" data-diagnostics-action="reconnect">런타임 재연결 시도</button>
          <button type="button" data-diagnostics-action="copy">진단 로그 복사</button>
          <button type="button" data-diagnostics-action="open-log">진단 로그 파일 열기</button>
          <button type="button" data-diagnostics-action="close">닫기</button>
        </div>
      </section></div>`;
  }

  function initialize(windowObject) {
    const diagnostics = windowObject.PJ_KIOSK_DIAGNOSTICS;
    if (!diagnostics) return;
    const document = windowObject.document;
    let open = false;
    let snapshot = diagnostics.snapshot();
    let taps = [];

    function paint() {
      let root = document.getElementById('kioskRuntimeDiagnosticsRoot');
      if (!root) {
        root = document.createElement('div');
        root.id = 'kioskRuntimeDiagnosticsRoot';
        document.body.appendChild(root);
      }
      root.innerHTML = open ? render(snapshot) : '';
    }

    function setOpen(value) {
      open = value === true;
      paint();
    }

    document.addEventListener('click', event => {
      const actionButton = event.target.closest('[data-diagnostics-action]');
      if (actionButton) {
        event.preventDefault();
        const action = actionButton.dataset.diagnosticsAction;
        if (action === 'close') setOpen(false);
        if (action === 'refresh') paint();
        if (action === 'reconnect') windowObject.reconnectKioskRuntimeDiagnostics?.();
        if (action === 'copy') {
          const content = JSON.stringify(snapshot.entries, null, 2);
          Promise.resolve(windowObject.navigator.clipboard?.writeText(content)).catch(() => {});
        }
        if (action === 'open-log') windowObject.kioskDiagnosticsBridge?.openLog?.();
        return;
      }
      if (!event.target.closest('.heroLogoDark,.brandLogo')) return;
      const now = Date.now();
      taps = [...taps.filter(value => now - value < 5000), now];
      if (taps.length >= 7) {
        taps = [];
        setOpen(true);
      }
    });
    diagnostics.onChange(value => {
      snapshot = value;
      if (open) paint();
    });
    windowObject.kioskDiagnosticsBridge?.onOpen?.(() => setOpen(true));
  }

  return { escapeHtml, render, initialize };
});
