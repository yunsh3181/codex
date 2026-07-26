'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, BrowserWindow, Menu, ipcMain, powerSaveBlocker, screen, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const { createKioskUpdater } = require('./updater');
const { createDiagnosticsLog } = require('./diagnostics-log');
const { createBootstrapCredential } = require('./bootstrap-credential');

const entryFile = path.resolve(__dirname, '..', 'index.html');
let mainWindow = null;
let powerSaveBlockerId = null;
let quitting = false;
let updaterManager = null;
let diagnosticsLog = null;
const bootstrapCredential = createBootstrapCredential(
  process.env.PJ_KIOSK_FIREBASE_CUSTOM_TOKEN || null
);
const { bootstrapCredentialPresentAtStartup } = bootstrapCredential;
delete process.env.PJ_KIOSK_FIREBASE_CUSTOM_TOKEN;
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
    const senderValid = Boolean(mainWindow && event.sender === mainWindow.webContents);
    const result = bootstrapCredential.consume(senderValid);
    appendMainDiagnostic('bootstrap-credential-consume', {
      bootstrapCredentialConsumeRequested: result.bootstrapCredentialConsumeRequested,
      bootstrapCredentialPresentAtConsume: result.bootstrapCredentialPresentAtConsume,
      bootstrapCredentialConsumed: result.bootstrapCredentialConsumed,
      senderValid: result.senderValid
    });
    return result.token;
  });
}

function registerKioskAppIpc() {
  ipcMain.removeHandler('kiosk-app:get-version');
  ipcMain.handle('kiosk-app:get-version', event => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    const version = app.getVersion();
    return typeof version === 'string' && version.trim() ? version.trim() : null;
  });
}

function diagnosticEnvironment() {
  return {
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron || null,
    chromiumVersion: process.versions.chrome || null,
    nodeVersion: process.versions.node || null,
    packaged: app.isPackaged,
    logPath: diagnosticsLog?.logPath || null,
    ...bootstrapCredential.diagnostics()
  };
}

function appendMainDiagnostic(stage, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    source: 'desktop/main.js',
    stage,
    ...diagnosticEnvironment(),
    ...details
  };
  console.info('[remote-runtime][main]', entry);
  diagnosticsLog?.append({ scope: 'main', ...entry });
}

function registerDiagnosticsIpc() {
  ipcMain.removeAllListeners('kiosk-diagnostics:get-environment-sync');
  ipcMain.removeHandler('kiosk-diagnostics:get-environment');
  ipcMain.removeHandler('kiosk-diagnostics:append');
  ipcMain.removeHandler('kiosk-diagnostics:open-log');
  ipcMain.on('kiosk-diagnostics:get-environment-sync', event => {
    if (!mainWindow || event.sender !== mainWindow.webContents) {
      event.returnValue = null;
      return;
    }
    event.returnValue = diagnosticEnvironment();
  });
  ipcMain.handle('kiosk-diagnostics:get-environment', event => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return null;
    return diagnosticEnvironment();
  });
  ipcMain.handle('kiosk-diagnostics:append', (event, entry) => {
    if (!mainWindow || event.sender !== mainWindow.webContents) return false;
    return diagnosticsLog?.append({ scope: 'renderer', entry }) === true;
  });
  ipcMain.handle('kiosk-diagnostics:open-log', async event => {
    if (!mainWindow || event.sender !== mainWindow.webContents || !diagnosticsLog) return false;
    diagnosticsLog.append({ scope: 'main', stage: 'diagnostics-log-open-request' });
    return (await shell.openPath(diagnosticsLog.logPath)) === '';
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
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    appendMainDiagnostic('render-process-gone', {
      reason: details?.reason || null,
      exitCode: details?.exitCode ?? null
    });
  });
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    let locationProtocol = null;
    try { locationProtocol = validatedURL ? new URL(validatedURL).protocol : null; } catch {}
    appendMainDiagnostic('did-fail-load', {
      errorCode,
      errorMessage: errorDescription,
      locationProtocol,
      isMainFrame
    });
  });
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    appendMainDiagnostic('preload-error', {
      preloadFile: path.basename(preloadPath || ''),
      errorName: error?.name || 'Error',
      errorMessage: error?.message || String(error),
      stack: error?.stack || null
    });
  });

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
    const diagnosticsShortcut =
      input.control && input.alt && input.shift && key === 'd';

    if (diagnosticsShortcut) {
      event.preventDefault();
      mainWindow.webContents.send('kiosk-diagnostics:open');
      return;
    }
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
    diagnosticsLog = createDiagnosticsLog({ userDataPath: app.getPath('userData') });
    appendMainDiagnostic('app-start');
    appendMainDiagnostic('bootstrap-credential-detected', {
      bootstrapCredentialPresentAtStartup
    });
    Menu.setApplicationMenu(null);
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    registerDiagnosticsIpc();
    createWindow();
    registerTestModeIpc();
    registerKioskIdentityIpc();
    registerKioskAppIpc();
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
    ipcMain.removeHandler('kiosk-app:get-version');
    ipcMain.removeHandler('kiosk-diagnostics:get-environment');
    ipcMain.removeAllListeners('kiosk-diagnostics:get-environment-sync');
    ipcMain.removeHandler('kiosk-diagnostics:append');
    ipcMain.removeHandler('kiosk-diagnostics:open-log');
    bootstrapCredential.clear();
  });

  app.on('window-all-closed', requestQuit);
}

process.on('uncaughtExceptionMonitor', error => {
  appendMainDiagnostic('uncaught-error', {
    errorName: error?.name || 'Error',
    errorMessage: error?.message || String(error),
    stack: error?.stack || null
  });
});
process.on('unhandledRejection', reason => {
  appendMainDiagnostic('unhandled-rejection', {
    errorName: reason?.name || 'Error',
    errorMessage: reason?.message || String(reason),
    stack: reason?.stack || null
  });
});
