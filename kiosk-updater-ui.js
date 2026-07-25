(function () {
  'use strict';

  const updater = window.kioskUpdater;
  if (!updater) return;

  let updaterState = null;
  let panelOpen = false;

  function operationalState() {
    const orderingSteps = new Set([
      'type', 'party', 'area', 'table', 'timing', 'reserve', 'promo', 'setChoice',
      'size', 'mode', 'pizzaOptions', 'pizza', 'crust', 'topping', 'side', 'drink',
      'accompaniment', 'cartReview', 'review', 'phone', 'payment'
    ]);
    return {
      businessOpen: businessHoursStatus === 'open',
      orderInProgress: orderingSteps.has(state.step) || state.cartItems.length > 0 || state.selectedTables.length > 0,
      paymentInProgress: state.step === 'payment' || mobileOrderSubmitting,
      firestoreSaving: mobileOrderSubmitting,
      // The current project has no printer adapter or print job queue.
      printerBusy: false
    };
  }

  function statusLabel(value) {
    const labels = {
      unavailable: '이 실행 환경에서는 자동 업데이트를 사용할 수 없습니다.',
      idle: '업데이트 확인 대기 중',
      checking: '최신 버전을 확인하는 중',
      'up-to-date': '최신 버전을 사용 중입니다.',
      downloading: '새 버전을 다운로드하는 중',
      downloaded: '새 버전이 준비되었습니다.',
      blocked: '지금은 재시작할 수 없습니다.',
      installing: '업데이트를 적용하고 재시작합니다.',
      error: '업데이트 확인 또는 다운로드에 실패했습니다.'
    };
    return labels[value] || value || '-';
  }

  function panelMarkup() {
    const value = updaterState || {};
    const progress = Math.round(Number(value.progress) || 0);
    return `<div class="kioskUpdaterBackdrop" role="dialog" aria-modal="true" aria-labelledby="kioskUpdaterTitle">
      <section class="kioskUpdaterPanel">
        <header><div><small>ADMIN · WINDOWS UPDATE</small><h2 id="kioskUpdaterTitle">키오스크 업데이트 관리</h2></div><button type="button" data-updater-action="close" aria-label="닫기">×</button></header>
        <dl>
          <div><dt>현재 버전</dt><dd>${value.currentVersion || '-'}</dd></div>
          <div><dt>최신 버전</dt><dd>${value.latestVersion || '확인 전'}</dd></div>
          <div><dt>아키텍처</dt><dd>${value.architecture || '-'} · ${value.channel || '-'}</dd></div>
          <div><dt>상태</dt><dd>${statusLabel(value.status)}</dd></div>
        </dl>
        ${value.status === 'downloading' ? `<div class="kioskUpdaterProgress"><span style="width:${progress}%"></span></div><p>${progress}%</p>` : ''}
        ${value.blockers?.length ? `<ul>${value.blockers.map(item => `<li>${item}</li>`).join('')}</ul>` : ''}
        ${value.error ? `<p class="kioskUpdaterError">${value.error}<br>현재 버전으로 계속 운영합니다.</p>` : ''}
        <div class="kioskUpdaterActions">
          <button type="button" data-updater-action="check" ${value.status === 'checking' || value.status === 'downloading' ? 'disabled' : ''}>최신 버전 확인</button>
          <button type="button" class="install" data-updater-action="install" ${value.downloaded && !value.installing ? '' : 'disabled'}>재시작 후 설치</button>
        </div>
        <p class="kioskUpdaterGuide">설치는 영업 종료 상태이며 주문·결제·저장·프린터 작업이 없을 때만 시작됩니다.</p>
      </section>
    </div>`;
  }

  function renderPanel() {
    let root = document.getElementById('kioskUpdaterAdminRoot');
    if (!root) {
      root = document.createElement('div');
      root.id = 'kioskUpdaterAdminRoot';
      document.body.appendChild(root);
    }
    root.innerHTML = panelOpen ? panelMarkup() : '';
  }

  async function runAction(action) {
    if (action === 'close') {
      panelOpen = false;
      renderPanel();
      return;
    }
    if (action === 'check') updaterState = await updater.check();
    if (action === 'install') updaterState = await updater.install();
    renderPanel();
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-updater-action]');
    if (!button) return;
    event.preventDefault();
    runAction(button.dataset.updaterAction).catch(error => {
      updaterState = { ...(updaterState || {}), status: 'error', error: error.message };
      renderPanel();
    });
  });

  updater.provideOperationalState(operationalState);
  updater.onState(stateValue => {
    updaterState = stateValue;
    if (panelOpen) renderPanel();
  });
  updater.onOpenAdmin(stateValue => {
    updaterState = stateValue;
    panelOpen = true;
    renderPanel();
  });
})();
