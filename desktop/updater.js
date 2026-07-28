'use strict';

const { randomUUID } = require('node:crypto');

const INITIAL_CHECK_DELAY_MS = 15000;
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const OPERATIONAL_STATE_TIMEOUT_MS = 5000;
const ALLOWED_ARCHITECTURES = new Set(['ia32', 'x64']);
const OPERATIONAL_KEYS = [
  'businessOpen',
  'orderInProgress',
  'paymentInProgress',
  'firestoreSaving',
  'printerBusy',
  'testModeEnabled'
];

function sanitizeOperationalState(value) {
  if (!value || typeof value !== 'object') return null;
  const sanitized = {};
  for (const key of OPERATIONAL_KEYS) {
    if (typeof value[key] !== 'boolean') return null;
    sanitized[key] = value[key];
  }
  return sanitized;
}

function installBlockers(operationalState) {
  const sanitized = sanitizeOperationalState(operationalState);
  if (!sanitized) return ['운영 상태를 확인할 수 없습니다.'];
  const blockers = [];
  if (sanitized.orderInProgress) blockers.push('진행 중인 주문이 있습니다.');
  if (sanitized.paymentInProgress) blockers.push('결제가 진행 중입니다.');
  if (sanitized.firestoreSaving) blockers.push('주문 저장이 진행 중입니다.');
  if (sanitized.printerBusy) blockers.push('프린터 작업이 진행 중입니다.');
  return blockers;
}

function createKioskUpdater({
  app,
  autoUpdater,
  ipcMain,
  getWindow,
  platform = process.platform,
  arch = process.arch,
  isPortable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE),
  setTimeoutFn = setTimeout,
  setIntervalFn = setInterval,
  clearTimeoutFn = clearTimeout,
  clearIntervalFn = clearInterval
}) {
  let initialized = false;
  let initialTimer = null;
  let intervalTimer = null;
  const pendingOperationalRequests = new Map();
  const enabled = app.isPackaged && platform === 'win32' && ALLOWED_ARCHITECTURES.has(arch) && !isPortable;
  const channel = ALLOWED_ARCHITECTURES.has(arch) ? `latest-${arch}` : null;
  const state = {
    enabled,
    status: enabled ? 'idle' : 'unavailable',
    currentVersion: app.getVersion(),
    latestVersion: null,
    progress: 0,
    downloaded: false,
    installing: false,
    architecture: arch,
    channel,
    error: null,
    blockers: [],
    lastCheckedAt: null
  };

  function snapshot() {
    return { ...state, blockers: [...state.blockers] };
  }

  function sendState() {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send('kiosk-updater:state', snapshot());
  }

  function patchState(patch) {
    Object.assign(state, patch);
    sendState();
  }

  async function checkForUpdates() {
    if (!enabled || state.installing || state.downloaded || ['checking', 'downloading'].includes(state.status)) return snapshot();
    patchState({ status: 'checking', error: null, blockers: [], lastCheckedAt: new Date().toISOString() });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      patchState({ status: 'error', error: error?.message || '업데이트 확인에 실패했습니다.' });
    }
    return snapshot();
  }

  function requestOperationalState() {
    const window = getWindow();
    if (!window || window.isDestroyed()) return Promise.resolve(null);
    const requestId = randomUUID();
    return new Promise(resolve => {
      const timeoutId = setTimeoutFn(() => {
        pendingOperationalRequests.delete(requestId);
        resolve(null);
      }, OPERATIONAL_STATE_TIMEOUT_MS);
      pendingOperationalRequests.set(requestId, value => {
        clearTimeoutFn(timeoutId);
        resolve(value);
      });
      window.webContents.send('kiosk-updater:request-operational-state', requestId);
    });
  }

  async function installDownloadedUpdate() {
    if (!enabled || !state.downloaded || state.installing) return snapshot();
    const operationalState = await requestOperationalState();
    const blockers = installBlockers(operationalState);
    if (blockers.length) {
      patchState({ status: 'blocked', blockers, error: null });
      return snapshot();
    }
    patchState({ status: 'installing', installing: true, blockers: [], error: null });
    setTimeoutFn(() => autoUpdater.quitAndInstall(false, true), 0);
    return snapshot();
  }

  function openAdminPanel() {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send('kiosk-updater:open-admin', snapshot());
  }

  function handleOperationalState(event, requestId, value) {
    const window = getWindow();
    if (!window || window.isDestroyed() || event.sender !== window.webContents) return;
    if (typeof requestId !== 'string' || requestId.length > 100) return;
    const resolve = pendingOperationalRequests.get(requestId);
    if (!resolve) return;
    pendingOperationalRequests.delete(requestId);
    resolve(sanitizeOperationalState(value));
  }

  function registerIpc() {
    ipcMain.removeHandler('kiosk-updater:get-state');
    ipcMain.removeHandler('kiosk-updater:check');
    ipcMain.removeHandler('kiosk-updater:install');
    ipcMain.handle('kiosk-updater:get-state', () => snapshot());
    ipcMain.handle('kiosk-updater:check', () => checkForUpdates());
    ipcMain.handle('kiosk-updater:install', () => installDownloadedUpdate());
    ipcMain.removeListener('kiosk-updater:operational-state', handleOperationalState);
    ipcMain.on('kiosk-updater:operational-state', handleOperationalState);
  }

  function registerUpdaterEvents() {
    autoUpdater.on('update-available', info => {
      patchState({ status: 'downloading', latestVersion: info?.version || null, progress: 0, error: null });
    });
    autoUpdater.on('update-not-available', info => {
      patchState({ status: 'up-to-date', latestVersion: info?.version || state.currentVersion, progress: 0, error: null });
    });
    autoUpdater.on('download-progress', progress => {
      patchState({ status: 'downloading', progress: Math.max(0, Math.min(100, Number(progress?.percent) || 0)) });
    });
    autoUpdater.on('update-downloaded', info => {
      patchState({
        status: 'downloaded',
        latestVersion: info?.version || state.latestVersion,
        progress: 100,
        downloaded: true,
        error: null
      });
    });
    autoUpdater.on('error', error => {
      patchState({ status: 'error', error: error?.message || '업데이트 처리에 실패했습니다.' });
    });
  }

  function initialize() {
    if (initialized) return snapshot();
    initialized = true;
    registerIpc();
    if (!enabled) return snapshot();
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.channel = channel;
    registerUpdaterEvents();
    initialTimer = setTimeoutFn(checkForUpdates, INITIAL_CHECK_DELAY_MS);
    intervalTimer = setIntervalFn(checkForUpdates, CHECK_INTERVAL_MS);
    return snapshot();
  }

  function dispose() {
    if (initialTimer !== null) clearTimeoutFn(initialTimer);
    if (intervalTimer !== null) clearIntervalFn(intervalTimer);
    initialTimer = intervalTimer = null;
    for (const resolve of pendingOperationalRequests.values()) resolve(null);
    pendingOperationalRequests.clear();
    ipcMain.removeListener('kiosk-updater:operational-state', handleOperationalState);
    ipcMain.removeHandler('kiosk-updater:get-state');
    ipcMain.removeHandler('kiosk-updater:check');
    ipcMain.removeHandler('kiosk-updater:install');
  }

  return {
    initialize,
    dispose,
    checkForUpdates,
    installDownloadedUpdate,
    openAdminPanel,
    snapshot
  };
}

module.exports = {
  INITIAL_CHECK_DELAY_MS,
  CHECK_INTERVAL_MS,
  sanitizeOperationalState,
  installBlockers,
  createKioskUpdater
};
