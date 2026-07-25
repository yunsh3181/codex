'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('kioskPrinter', Object.freeze({
  list: () => ipcRenderer.invoke('printer:list'),
  testPrint: printerName => ipcRenderer.invoke('printer:test', printerName)
}));
