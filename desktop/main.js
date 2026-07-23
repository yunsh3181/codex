'use strict';

const path = require('node:path');
const { fileURLToPath } = require('node:url');
const { app, BrowserWindow, Menu, powerSaveBlocker } = require('electron');

const isDevelopment = process.argv.includes('--dev');
const entryFile = path.resolve(__dirname, '..', 'index.html');
let mainWindow = null;
let powerSaveBlockerId = null;
let quitting = false;

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
  mainWindow = new BrowserWindow({
    title: 'PapaJohns Kiosk',
    kiosk: !isDevelopment,
    fullscreen: !isDevelopment,
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
