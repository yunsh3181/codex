'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const stateListeners = new Set();
const openListeners = new Set();
const testModeListeners = new Set();
const diagnosticsOpenListeners = new Set();
let operationalStateProvider = null;

ipcRenderer.on('kiosk-updater:state', (_event, state) => {
  for (const listener of stateListeners) listener(state);
});
ipcRenderer.on('kiosk-updater:open-admin', (_event, state) => {
  for (const listener of openListeners) listener(state);
});
ipcRenderer.on('kiosk-updater:request-operational-state', (_event, requestId) => {
  const state = operationalStateProvider ? operationalStateProvider() : null;
  ipcRenderer.send('kiosk-updater:operational-state', requestId, state);
});
ipcRenderer.on('kiosk-test-mode:state', (_event, state) => {
  for (const listener of testModeListeners) listener(state);
});
ipcRenderer.on('kiosk-diagnostics:open', () => {
  for (const listener of diagnosticsOpenListeners) listener();
});

contextBridge.exposeInMainWorld('kioskUpdater', Object.freeze({
  getState: () => ipcRenderer.invoke('kiosk-updater:get-state'),
  check: () => ipcRenderer.invoke('kiosk-updater:check'),
  install: () => ipcRenderer.invoke('kiosk-updater:install'),
  onState: listener => {
    if (typeof listener !== 'function') return () => {};
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  },
  onOpenAdmin: listener => {
    if (typeof listener !== 'function') return () => {};
    openListeners.add(listener);
    return () => openListeners.delete(listener);
  },
  provideOperationalState: provider => {
    if (typeof provider !== 'function') return;
    operationalStateProvider = provider;
  }
}));

contextBridge.exposeInMainWorld('kioskTestMode', Object.freeze({
  getState: () => ipcRenderer.invoke('kiosk-test-mode:get-state'),
  setState: state => ipcRenderer.invoke('kiosk-test-mode:set-state', state),
  onState: listener => {
    if (typeof listener !== 'function') return () => {};
    testModeListeners.add(listener);
    return () => testModeListeners.delete(listener);
  }
}));

contextBridge.exposeInMainWorld('kioskIdentity', Object.freeze({
  consumeCustomToken: () => ipcRenderer.invoke('kiosk-identity:consume-custom-token')
}));

contextBridge.exposeInMainWorld('kioskApp', Object.freeze({
  getVersion: () => ipcRenderer.invoke('kiosk-app:get-version')
}));

contextBridge.exposeInMainWorld('kioskDiagnosticsBridge', Object.freeze({
  getEnvironment: () => ipcRenderer.sendSync('kiosk-diagnostics:get-environment-sync'),
  append: entry => ipcRenderer.invoke('kiosk-diagnostics:append', entry),
  openLog: () => ipcRenderer.invoke('kiosk-diagnostics:open-log'),
  onOpen: listener => {
    if (typeof listener !== 'function') return () => {};
    diagnosticsOpenListeners.add(listener);
    return () => diagnosticsOpenListeners.delete(listener);
  }
}));
