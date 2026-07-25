'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { normalizePrinter, connectionFromPort, testReceiptHtml } = require('../desktop/printer-service');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const preloadSource = fs.readFileSync(path.join(root, 'desktop', 'preload.js'), 'utf8');
const diagnosticsHtml = fs.readFileSync(path.join(root, 'printer-diagnostics.html'), 'utf8');

test('normalizes Windows printer metadata without native architecture dependencies', () => {
  const printer = normalizePrinter({
    name: 'Receipt',
    displayName: 'BIXOLON Receipt',
    status: 0x80,
    isDefault: true,
    options: {
      'port-name': 'USB001',
      'driver-name': 'BIXOLON SRP-350plusIII'
    }
  });
  assert.equal(printer.connection, 'USB');
  assert.equal(printer.offline, true);
  assert.equal(printer.available, false);
  assert.equal(printer.driverName, 'BIXOLON SRP-350plusIII');
  assert.equal(connectionFromPort('IP_192.168.0.20', ''), 'Network');
});

test('generates an 80mm test receipt and escapes the selected device name', () => {
  const html = testReceiptHtml('<Receipt & Main>', new Date('2026-01-01T00:00:00Z'));
  assert.match(html, /@page\{size:80mm auto/);
  assert.match(html, /&lt;Receipt &amp; Main&gt;/);
  assert.doesNotMatch(html, /<Receipt & Main>/);
});

test('exposes only narrow printer IPC methods from the sandboxed preload', () => {
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('kioskPrinter'/);
  assert.match(preloadSource, /ipcRenderer\.invoke\('printer:list'\)/);
  assert.match(preloadSource, /ipcRenderer\.invoke\('printer:test', printerName\)/);
  assert.match(mainSource, /isTrustedRenderer\(event\.senderFrame\)/);
  assert.match(mainSource, /getPrintersAsync\(\)/);
  assert.match(mainSource, /deviceName:\s*name/);
  assert.match(mainSource, /silent:\s*true/);
});

test('diagnostics screen has explicit refresh, persistence and test controls', () => {
  assert.match(diagnosticsHtml, /Content-Security-Policy/);
  assert.match(diagnosticsHtml, /id="refreshPrinters"/);
  assert.match(diagnosticsHtml, /id="savePrinter"/);
  assert.match(diagnosticsHtml, /id="useDefaultPrinter"/);
  assert.match(diagnosticsHtml, /id="testPrint"/);
  assert.match(diagnosticsHtml, /id="lastResult"/);
});
