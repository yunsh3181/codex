const fs = require('node:fs');
const path = require('node:path');

const waitForClosed = (window, timeoutMs = 2_000) => new Promise((resolve, reject) => {
  if (!window || window.isDestroyed()) return resolve();
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for BrowserWindow to close')), timeoutMs);
  window.once('closed', () => { clearTimeout(timeout); resolve(); });
  window.close();
});

async function runElectronVerification({ app }, verify) {
  const diagnosticsPath = process.env.ELECTRON_VERIFICATION_DIAGNOSTICS || null;
  const started = Date.now();
  const windows = [];
  const debuggerWindows = new Set();
  let expectedReportPath = null;
  let exitCode = 0;
  let cleanupStarted = false;
  let verificationComplete = false;

  const record = (event, details = {}) => {
    const entry = { timestamp: new Date().toISOString(), elapsedMs: Date.now() - started, pid: process.pid, event, ...details };
    if (diagnosticsPath) {
      fs.mkdirSync(path.dirname(diagnosticsPath), { recursive: true });
      fs.appendFileSync(diagnosticsPath, `${JSON.stringify(entry)}\n`);
    }
  };
  record('lifecycle-start', {
    lockWaitMs: Number(process.env.ELECTRON_VERIFICATION_LOCK_WAIT_MS || 0),
    staleLocksRecovered: Number(process.env.ELECTRON_VERIFICATION_STALE_LOCKS_RECOVERED || 0),
  });
  const trackWebContents = (webContents, label) => {
    webContents.on('render-process-gone', (_event, details) => record('renderer-process-gone', { label, ...details }));
    webContents.on('render-view-deleted', () => record('render-view-deleted', { label }));
    webContents.on('unresponsive', () => record('web-contents-unresponsive', { label }));
    return webContents;
  };
  const lifecycle = {
    record,
    expectReport(reportPath) { expectedReportPath = reportPath; record('report-expected', { path: reportPath }); },
    async writeReportAtomically(reportPath, value) {
      lifecycle.expectReport(reportPath);
      const temporaryPath = path.join(path.dirname(reportPath), `.${path.basename(reportPath)}.${process.pid}.tmp`);
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      record('report-temporary-write-start', { path: temporaryPath });
      try {
        await fs.promises.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
        record('report-temporary-write-complete', { path: temporaryPath });
        record('report-atomic-rename-start', { from: temporaryPath, to: reportPath });
        await fs.promises.rename(temporaryPath, reportPath);
        record('report-atomic-rename-complete', { path: reportPath });
      } finally {
        await fs.promises.rm(temporaryPath, { force: true });
      }
    },
    trackWebContents,
    trackWindow(value, label = `window-${windows.length + 1}`) {
      windows.push(value);
      value.on('unresponsive', () => record('browser-window-unresponsive', { label }));
      value.on('closed', () => record('browser-window-closed', { label }));
      trackWebContents(value.webContents, label);
      return value;
    },
    attachDebugger(version = '1.3', window = windows.at(-1)) {
      window.webContents.debugger.attach(version);
      debuggerWindows.add(window);
      record('debugger-attached', { version });
    },
  };

  app.on('child-process-gone', (_event, details) => record('child-process-gone', {
    type: details.type, reason: details.reason, exitCode: details.exitCode,
    serviceName: details.serviceName || null, name: details.name || null,
  }));
  app.on('before-quit', event => {
    record('app-before-quit', { verificationComplete, cleanupStarted });
    if (!verificationComplete && !cleanupStarted) event.preventDefault();
  });
  app.on('will-quit', () => record('app-will-quit'));
  app.on('quit', (_event, code) => record('app-quit', { exitCode: code }));

  try {
    record('app-ready-wait-start');
    await app.whenReady();
    record('app-ready');
    record('verification-start');
    await verify(lifecycle);
    record('verification-complete');
    if (expectedReportPath) {
      record('report-validation-start', { path: expectedReportPath });
      const report = fs.readFileSync(expectedReportPath, 'utf8');
      JSON.parse(report);
      record('report-validation-complete', { path: expectedReportPath, bytes: Buffer.byteLength(report) });
    }
    verificationComplete = true;
  } catch (error) {
    exitCode = 1;
    record('verification-failed', { name: error.name, message: error.message, stack: error.stack });
    console.error(error);
  } finally {
    if (cleanupStarted) return;
    cleanupStarted = true;
    record('cleanup-start', { windowCount: windows.length });
    try {
      for (const window of debuggerWindows) {
        if (!window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.debugger.isAttached()) {
          window.webContents.debugger.detach();
          record('debugger-detached');
        }
      }
      debuggerWindows.clear();
      for (const window of [...windows].reverse()) {
        record('browser-window-close-requested');
        await waitForClosed(window);
      }
    } catch (error) {
      exitCode = 1;
      record('cleanup-failed', { name: error.name, message: error.message });
      console.error(error);
      for (const window of windows) if (!window.isDestroyed()) window.destroy();
    }
    process.exitCode = exitCode;
    record('app-quit-requested', { exitCode });
    app.quit();
  }
}

module.exports = { runElectronVerification };
