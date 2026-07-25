'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, BrowserWindow, Menu, ipcMain, powerSaveBlocker, screen } = require('electron');
const { normalizePrinter, testReceiptHtml } = require('./printer-service');

const entryFile = path.resolve(__dirname, '..', 'index.html');
const diagnosticsFile = path.resolve(__dirname, '..', 'printer-diagnostics.html');
let mainWindow = null;
let diagnosticsWindow = null;
let powerSaveBlockerId = null;
let quitting = false;

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

function isTrustedRenderer(senderFrame) {
  if (!senderFrame?.url) return false;
  try {
    const filePath = path.normalize(fileURLToPath(senderFrame.url));
    const appRoot = path.normalize(path.resolve(__dirname, '..') + path.sep);
    return filePath.startsWith(appRoot);
  } catch {
    return false;
  }
}

function registerPrinterHandlers() {
  ipcMain.handle('printer:list', async event => {
    if (!isTrustedRenderer(event.senderFrame)) throw new Error('허용되지 않은 프린터 조회 요청입니다.');
    const printers = await event.sender.getPrintersAsync();
    return printers.map(normalizePrinter);
  });

  ipcMain.handle('printer:test', async (event, printerName) => {
    if (!isTrustedRenderer(event.senderFrame)) throw new Error('허용되지 않은 출력 요청입니다.');
    const name = String(printerName || '').trim();
    if (!name) throw new Error('출력할 프린터를 선택해 주세요.');
    const printers = (await event.sender.getPrintersAsync()).map(normalizePrinter);
    const printer = printers.find(candidate => candidate.name === name);
    if (!printer) throw new Error(`설치된 프린터에서 "${name}"을(를) 찾을 수 없습니다.`);
    if (!printer.available) throw new Error(`"${name}" 프린터를 사용할 수 없습니다. 상태: ${printer.status}`);

    const printWindow = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    try {
      const html = testReceiptHtml(name);
      await printWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
      await new Promise((resolve, reject) => {
        printWindow.webContents.print({
          silent: true,
          printBackground: true,
          deviceName: name,
          margins: { marginType: 'none' },
          pageSize: { width: 80000, height: 200000 }
        }, (success, failureReason) => {
          if (success) resolve();
          else reject(new Error(failureReason || 'Windows 인쇄 작업이 실패했습니다.'));
        });
      });
      console.info('[printer] test print succeeded', { printer: name });
      return { success: true, printerName: name, printedAt: new Date().toISOString() };
    } catch (error) {
      console.error('[printer] test print failed', { printer: name, message: error.message });
      throw error;
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  });
}

function openPrinterDiagnostics() {
  if (diagnosticsWindow && !diagnosticsWindow.isDestroyed()) {
    diagnosticsWindow.show();
    diagnosticsWindow.focus();
    return;
  }
  diagnosticsWindow = new BrowserWindow({
    title: '영수증 프린터 진단',
    width: 720,
    height: 820,
    minWidth: 620,
    minHeight: 680,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  diagnosticsWindow.removeMenu();
  diagnosticsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  diagnosticsWindow.webContents.on('will-navigate', (event, targetUrl) => {
    try {
      if (path.normalize(fileURLToPath(targetUrl)) !== path.normalize(diagnosticsFile)) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
  diagnosticsWindow.on('closed', () => { diagnosticsWindow = null; });
  diagnosticsWindow.loadFile(diagnosticsFile);
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
    const printerDiagnosticsShortcut =
      input.control && input.alt && input.shift && key === 'p';

    if (printerDiagnosticsShortcut) {
      event.preventDefault();
      openPrinterDiagnostics();
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
    registerPrinterHandlers();
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
    createWindow();
  });

  app.on('before-quit', () => {
    quitting = true;
    if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
      powerSaveBlocker.stop(powerSaveBlockerId);
    }
    powerSaveBlockerId = null;
  });

  app.on('window-all-closed', requestQuit);
}
