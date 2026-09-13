(function (root, factory) {
  'use strict';

  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root?.document) api.initialize(root);
})(typeof window === 'undefined' ? null : window, function () {
  'use strict';

  const TEXT_LIMITS = Object.freeze({
    version: 64,
    architecture: 32,
    channel: 80,
    blocker: 200,
    error: 500,
    downloadMode: 32
  });
  const MAX_BLOCKERS = 20;
  const STATUS_LABELS = Object.freeze({
    unavailable: '이 실행 환경에서는 자동 업데이트를 사용할 수 없습니다.',
    idle: '업데이트 확인 대기 중',
    checking: '최신 버전을 확인하는 중',
    'up-to-date': '최신 버전을 사용 중입니다.',
    downloading: '차등 업데이트를 다운로드하는 중',
    downloaded: '새 버전이 준비되었습니다.',
    deferred: '주문 완료 후 설치할 예정입니다.',
    installing: '업데이트 설치 및 재실행 중입니다.',
    error: '업데이트 실패 — 현재 버전을 계속 사용합니다.'
  });

  function limitedString(value, maxLength, fallback = '') {
    return typeof value === 'string' ? value.slice(0, maxLength) : fallback;
  }

  function normalizeProgress(value) {
    const progress = Number(value);
    if (!Number.isFinite(progress)) return 0;
    return Math.max(0, Math.min(100, progress));
  }

  function normalizeUpdaterState(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    return {
      enabled: source.enabled === true,
      status: Object.hasOwn(STATUS_LABELS, source.status) ? source.status : 'unavailable',
      currentVersion: limitedString(source.currentVersion, TEXT_LIMITS.version),
      latestVersion: limitedString(source.latestVersion, TEXT_LIMITS.version),
      architecture: limitedString(source.architecture, TEXT_LIMITS.architecture),
      channel: limitedString(source.channel, TEXT_LIMITS.channel),
      progress: normalizeProgress(source.progress),
      transferredBytes: Math.max(0, Number(source.transferredBytes) || 0),
      downloadTotalBytes: Math.max(0, Number(source.downloadTotalBytes) || 0),
      fullSizeBytes: Math.max(0, Number(source.fullSizeBytes) || 0),
      plannedDownloadBytes: Math.max(0, Number(source.plannedDownloadBytes) || 0),
      downloadMode: limitedString(source.downloadMode, TEXT_LIMITS.downloadMode, 'unknown'),
      downloaded: source.downloaded === true,
      installing: source.installing === true,
      blockers: Array.isArray(source.blockers)
        ? source.blockers
          .filter(item => typeof item === 'string')
          .slice(0, MAX_BLOCKERS)
          .map(item => item.slice(0, TEXT_LIMITS.blocker))
        : [],
      error: limitedString(source.error, TEXT_LIMITS.error)
    };
  }

  function statusLabel(status) {
    return STATUS_LABELS[status] || '-';
  }

  function formatBytes(value) {
    const bytes = Math.max(0, Number(value) || 0);
    if (!bytes) return '-';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.round(bytes / 1024)} KB`;
  }

  function downloadModeLabel(value) {
    if (value === 'differential') return '차등 다운로드';
    if (value === 'full-fallback') return '전체 다운로드로 안전 전환';
    return '자동 판별 중';
  }

  function appendTextElement(document, parent, tagName, text, attributes = {}) {
    const element = document.createElement(tagName);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    element.textContent = text;
    parent.appendChild(element);
    return element;
  }

  function clearElement(element) {
    while (element.firstChild) element.removeChild(element.firstChild);
  }

  function renderPanelContent(document, root, rawState) {
    const value = normalizeUpdaterState(rawState);
    clearElement(root);

    const backdrop = document.createElement('div');
    backdrop.className = 'kioskUpdaterBackdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');
    backdrop.setAttribute('aria-labelledby', 'kioskUpdaterTitle');
    const panel = document.createElement('section');
    panel.className = 'kioskUpdaterPanel';
    const header = document.createElement('header');
    const heading = document.createElement('div');
    appendTextElement(document, heading, 'small', 'ADMIN · WINDOWS UPDATE');
    const title = appendTextElement(document, heading, 'h2', '키오스크 업데이트 관리');
    title.id = 'kioskUpdaterTitle';
    header.appendChild(heading);
    const close = appendTextElement(document, header, 'button', '×', {
      type: 'button',
      'data-updater-action': 'close',
      'aria-label': '닫기'
    });
    close.dataset.updaterAction = 'close';
    panel.appendChild(header);

    const details = document.createElement('dl');
    const rows = [
      ['현재 버전', value.currentVersion || '-'],
      ['최신 버전', value.latestVersion || '확인 전'],
      ['아키텍처', `${value.architecture || '-'} · ${value.channel || '-'}`],
      ['상태', statusLabel(value.status)],
      ['다운로드 방식', downloadModeLabel(value.downloadMode)],
      ['전송량', `${formatBytes(value.transferredBytes || value.plannedDownloadBytes)} / ${formatBytes(value.fullSizeBytes || value.downloadTotalBytes)}`]
    ];
    for (const [term, description] of rows) {
      const row = document.createElement('div');
      appendTextElement(document, row, 'dt', term);
      appendTextElement(document, row, 'dd', description);
      details.appendChild(row);
    }
    panel.appendChild(details);

    if (value.status === 'downloading') {
      const progress = document.createElement('div');
      progress.className = 'kioskUpdaterProgress';
      const bar = document.createElement('span');
      bar.style.width = `${value.progress}%`;
      progress.appendChild(bar);
      panel.appendChild(progress);
      appendTextElement(document, panel, 'p', `${Math.round(value.progress)}%`);
    }

    if (value.blockers.length) {
      const list = document.createElement('ul');
      for (const blocker of value.blockers) appendTextElement(document, list, 'li', blocker);
      panel.appendChild(list);
    }
    if (value.error) {
      const error = document.createElement('p');
      error.className = 'kioskUpdaterError';
      error.textContent = value.error;
      error.appendChild(document.createElement('br'));
      error.appendChild(document.createTextNode('현재 버전으로 계속 운영합니다.'));
      panel.appendChild(error);
    }

    const actions = document.createElement('div');
    actions.className = 'kioskUpdaterActions';
    const check = appendTextElement(document, actions, 'button', '최신 버전 확인', {
      type: 'button',
      'data-updater-action': 'check'
    });
    check.dataset.updaterAction = 'check';
    check.disabled = value.status === 'checking' || value.status === 'downloading';
    const install = appendTextElement(document, actions, 'button', '지금 업데이트', {
      type: 'button',
      'data-updater-action': 'install'
    });
    install.className = 'install';
    install.dataset.updaterAction = 'install';
    install.disabled = !value.downloaded || value.installing;
    panel.appendChild(actions);
    const guide = appendTextElement(document, panel, 'p', '다운로드는 백그라운드에서 진행됩니다. 주문·결제·저장·좌석 작업 중에는 설치를 보류하고, 안전한 홈 화면에서 자동 재실행합니다. 창을 닫으면 검증된 파일은 다음 정상 종료 시 적용됩니다.');
    guide.className = 'kioskUpdaterGuide';

    backdrop.appendChild(panel);
    root.appendChild(backdrop);
    return value;
  }

  function initialize(windowObject) {
    const updater = windowObject.kioskUpdater;
    if (!updater) return;
    const { document } = windowObject;
    let updaterState = normalizeUpdaterState(null);
    let panelOpen = false;

    function operationalState() {
      const orderingSteps = new Set([
        'type', 'party', 'area', 'table', 'timing', 'reserve', 'promo', 'setChoice',
        'size', 'mode', 'pizzaOptions', 'pizza', 'crust', 'topping', 'side', 'drink',
        'accompaniment', 'cartReview', 'review', 'phone', 'payment'
      ]);
      return {
        safeScreen: ['idle', 'home'].includes(state.step),
        orderInProgress: orderingSteps.has(state.step) || state.cartItems.length > 0 || state.selectedTables.length > 0,
        paymentInProgress: state.step === 'payment' || mobileOrderSubmitting,
        firestoreSaving: mobileOrderSubmitting,
        orderTransactionInProgress: seatOrderCommitStarted,
        seatHoldInProgress: state.selectedTables.length > 0 || seatOrderCommitStarted,
        printerBusy: false,
        unrecoveredError: Boolean(document.getElementById('submitError')?.textContent?.trim())
      };
    }

    function renderPanel() {
      let panelRoot = document.getElementById('kioskUpdaterAdminRoot');
      if (!panelRoot) {
        panelRoot = document.createElement('div');
        panelRoot.id = 'kioskUpdaterAdminRoot';
        document.body.appendChild(panelRoot);
      }
      clearElement(panelRoot);
      if (panelOpen) renderPanelContent(document, panelRoot, updaterState);
    }

    async function runAction(action) {
      if (action === 'close') {
        panelOpen = false;
      } else if (action === 'check') {
        updaterState = normalizeUpdaterState(await updater.check());
      } else if (action === 'install') {
        updaterState = normalizeUpdaterState(await updater.install());
      }
      renderPanel();
    }

    document.addEventListener('click', event => {
      const button = event.target.closest('[data-updater-action]');
      if (!button) return;
      event.preventDefault();
      runAction(button.dataset.updaterAction).catch(error => {
        updaterState = normalizeUpdaterState({
          ...updaterState,
          status: 'error',
          error: typeof error?.message === 'string' ? error.message : '업데이트 처리에 실패했습니다.'
        });
        renderPanel();
      });
    });

    updater.provideOperationalState(operationalState);
    updater.onState(stateValue => {
      updaterState = normalizeUpdaterState(stateValue);
      if (panelOpen) renderPanel();
    });
    updater.onOpenAdmin(stateValue => {
      updaterState = normalizeUpdaterState(stateValue);
      panelOpen = true;
      renderPanel();
    });
  }

  return {
    TEXT_LIMITS,
    normalizeProgress,
    normalizeUpdaterState,
    renderPanelContent,
    statusLabel,
    formatBytes,
    downloadModeLabel,
    initialize
  };
});
