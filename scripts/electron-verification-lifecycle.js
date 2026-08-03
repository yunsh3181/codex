const waitForClosed = (window, timeoutMs = 2_000) => new Promise((resolve, reject) => {
  if (!window || window.isDestroyed()) return resolve();
  const timeout = setTimeout(() => reject(new Error('Timed out waiting for BrowserWindow to close')), timeoutMs);
  window.once('closed', () => {
    clearTimeout(timeout);
    resolve();
  });
  window.close();
});

async function runElectronVerification({ app }, verify) {
  let window = null;
  let debuggerAttached = false;
  let exitCode = 0;
  let cleanupStarted = false;

  const lifecycle = {
    trackWindow(value) {
      window = value;
      return value;
    },
    attachDebugger(version = '1.3') {
      window.webContents.debugger.attach(version);
      debuggerAttached = true;
    },
  };

  try {
    await app.whenReady();
    await verify(lifecycle);
  } catch (error) {
    exitCode = 1;
    console.error(error);
  } finally {
    if (cleanupStarted) return;
    cleanupStarted = true;
    try {
      if (debuggerAttached && window && !window.isDestroyed() && !window.webContents.isDestroyed() && window.webContents.debugger.isAttached()) {
        window.webContents.debugger.detach();
      }
      debuggerAttached = false;
      await waitForClosed(window);
    } catch (error) {
      exitCode = 1;
      console.error(error);
      if (window && !window.isDestroyed()) window.destroy();
    }

    process.exitCode = exitCode;
    app.quit();
  }
}

module.exports = { runElectronVerification };
