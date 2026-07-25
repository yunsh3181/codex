'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const stateListeners = new Set();
const openListeners = new Set();
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
