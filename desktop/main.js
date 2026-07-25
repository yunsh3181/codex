'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, BrowserWindow, Menu, ipcMain, powerSaveBlocker, screen } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createKioskUpdater } = require('./updater');

const entryFile = path.resolve(__dirname, '..', 'index.html');
let mainWindow = null;
let powerSaveBlockerId = null;
let quitting = false;
let updaterManager = null;
let kioskFirebaseCustomToken = process.env.PJ_KIOSK_FIREBASE_CUSTOM_TOKEN || null;
const TEST_MODE_DURATION_MS = 30 * 60 * 1000;
const testModeState = { enabled: false, enabledAt: null, expiresAt: null };
let testModeTimer = null;

function publicTestModeState() {
  return { ...testModeState };
}

function setTestModeState(next = {}) {
  clearTimeout(testModeTimer);
  testModeTimer = null;
  const enabledAt = Number(next.enabledAt);
  const expiresAt = Number(next.expiresAt);
  const valid = next.enabled === true && Number.isFinite(enabledAt) && Number.isFinite(expiresAt) &&
    expiresAt > Date.now() && expiresAt - enabledAt <= TEST_MODE_DURATION_MS;
  Object.assign(testModeState, valid
    ? { enabled: true, enabledAt, expiresAt }
    : { enabled: false, enabledAt: null, expiresAt: null });
  if (testModeState.enabled) {
    testModeTimer = setTimeout(() => setTestModeState(), Math.max(1, testModeState.expiresAt - Date.now()));
  }
  mainWindow?.webContents.send('kiosk-test-mode:state', publicTestModeState());
  return publicTestModeState();
}

function registerTestModeIpc() {
  ipcMain.removeHandler('kiosk-test-mode:get-state');
  ipcMain.removeHandler('kiosk-test-mode:set-state');
  ipcMain.handle('kiosk-test-mode:get-state', () => publicTestModeState());
  ipcMain.handle('kiosk-test-mode:set-state', (_event, next) => setTestModeState(next));
}

function registerKioskIdentityIpc() {
  ipcMain.removeHandler('kiosk-identity:consume-custom-token');
  ipcMain.handle('kiosk-identity:consume-custom-token', event => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    const token = kioskFirebaseCustomToken;
    kioskFirebaseCustomToken = null;
    return token;
  });
}

function isDevelopmentMode() {
  return !app.isPackaged && process.argv.includes('--dev');
}

function isLocalEntryNavigation(targetUrl) {
  try {
    const target = new URL(targetUrl);
    return target.protocol === 'file:' &&
      path.normalize(fileURLToPath(target)) === path.normalize(entryFile);
  } catch {
    return false;
  }
}

function requestQuit() {
  quitting = true;
  app.quit();
}

function createWindow() {
  const isDevelopment = isDevelopmentMode();
  const primaryDisplayBounds = screen.getPrimaryDisplay().bounds;

  mainWindow = new BrowserWindow({
    title: 'PapaJohns Kiosk',
    ...(!isDevelopment ? primaryDisplayBounds : {}),
    kiosk: !isDevelopment,
    fullscreen: !isDevelopment,
    show: false,
    frame: isDevelopment,
    resizable: isDevelopment,
    minimizable: isDevelopment,
    maximizable: false,
    autoHideMenuBar: true,
    backgroundColor: '#fff8ed',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      devTools: isDevelopment
    }
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (isDevelopment) {
    mainWindow.webContents.session.webRequest.onBeforeRequest((details, callback) => {
      const requestUrl = new URL(details.url);
      const isFirebase = /(^|\.)firebaseio\.com$|(^|\.)googleapis\.com$|(^|\.)firebaseapp\.com$/.test(requestUrl.hostname);
      console.info('[network]', {
        url: `${requestUrl.origin}${requestUrl.pathname}`,
        domain: requestUrl.hostname,
        resourceType: details.resourceType,
        firebase: isFirebase
      });
      callback({});
    });
  }

  mainWindow.once('ready-to-show', () => {
    if (!isDevelopment) {
      mainWindow.setBounds(primaryDisplayBounds);
      mainWindow.setKiosk(true);
      mainWindow.setFullScreen(true);
    }
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.on('will-navigate', (event, targetUrl) => {
    if (!isLocalEntryNavigation(targetUrl)) event.preventDefault();
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    const key = input.key.toLowerCase();
    const closeShortcut = (input.control || input.meta) && key === 'w';
    const devToolsShortcut = key === 'f12' ||
      ((input.control || input.meta) && input.shift && key === 'i');
    const productionQuitShortcut =
      !isDevelopment && input.control && input.alt && input.shift && key === 'q';
    const developmentQuitShortcut =
      isDevelopment && ((input.control || input.meta) && key === 'q');
    const updaterAdminShortcut =
      input.control && input.alt && input.shift && key === 'u';

    if (updaterAdminShortcut) {
      event.preventDefault();
      updaterManager?.openAdminPanel();
      return;
    }
    if (productionQuitShortcut || developmentQuitShortcut) {
      event.preventDefault();
      requestQuit();
      return;
    }

    if (closeShortcut || devToolsShortcut) event.preventDefault();
  });

  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow.focus();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(entryFile);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    createWindow();
    registerTestModeIpc();
    registerKioskIdentityIpc();
    updaterManager = createKioskUpdater({
      app,
      autoUpdater,
      ipcMain,
      getWindow: () => mainWindow
    });
    updaterManager.initialize();
  });

  app.on('before-quit', () => {
    quitting = true;
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
    updaterManager?.dispose();
    clearTimeout(testModeTimer);
    testModeTimer = null;
    Object.assign(testModeState, { enabled: false, enabledAt: null, expiresAt: null });
    ipcMain.removeHandler('kiosk-test-mode:get-state');
    ipcMain.removeHandler('kiosk-test-mode:set-state');
    ipcMain.removeHandler('kiosk-identity:consume-custom-token');
    kioskFirebaseCustomToken = null;
  });

  app.on('window-all-closed', requestQuit);
}
