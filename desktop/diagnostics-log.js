'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;

function createDiagnosticsLog({
  userDataPath,
  fsModule = fs,
  maxBytes = DEFAULT_MAX_BYTES,
  now = () => new Date()
}) {
  const logsDirectory = path.join(userDataPath, 'logs');
  const logPath = path.join(logsDirectory, 'kiosk-runtime-diagnostics.log');
  const rotatedPath = `${logPath}.1`;

  function rotateIfNeeded(additionalBytes) {
    let size = 0;
    try {
      size = fsModule.statSync(logPath).size;
    } catch {}
    if (size + additionalBytes <= maxBytes) return;
    try {
      fsModule.rmSync(rotatedPath, { force: true });
      fsModule.renameSync(logPath, rotatedPath);
    } catch {}
  }

  function append(entry) {
    try {
      fsModule.mkdirSync(logsDirectory, { recursive: true });
      const timestamp = now().toISOString();
      const line = `${timestamp} ${typeof entry === 'string' ? entry : JSON.stringify(entry)}\n`;
      rotateIfNeeded(Buffer.byteLength(line, 'utf8'));
      fsModule.appendFileSync(logPath, line, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({ append, logPath, rotatedPath, maxBytes });
}

module.exports = { createDiagnosticsLog, DEFAULT_MAX_BYTES };
