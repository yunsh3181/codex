'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const RUNTIME_EVENTS = new Set([
  'authentication-start',
  'authentication-success',
  'registerPresence-called',
  'presence-write-start',
  'presence-write-success',
  'presence-write-failed',
  'command-listener-start',
  'heartbeat-start',
  'heartbeat-tick',
  'heartbeat-write-start',
  'heartbeat-write-success',
  'heartbeat-write-failed'
]);

const SAFE_DETAIL_KEYS = new Set([
  'uid',
  'role',
  'storeId',
  'kioskId',
  'documentPath',
  'operation',
  'projectId',
  'path',
  'presenceWriteCount',
  'intervalMs'
]);

function textOrNull(value) {
  return typeof value === 'string' && value.length <= 1000 ? value : null;
}

function safePrimitive(value) {
  if (typeof value === 'string') return textOrNull(value);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean' || value === null) return value;
  return null;
}

function sanitizeDetails(event, details) {
  const source = details && typeof details === 'object' ? details : {};
  const safe = {};
  if (!event.endsWith('-failed')) {
    for (const key of SAFE_DETAIL_KEYS) {
      if (Object.hasOwn(source, key)) safe[key] = safePrimitive(source[key]);
    }
  }
  if (event.endsWith('-failed') && source.error && typeof source.error === 'object') {
    safe.error = {
      code: textOrNull(source.error.code),
      message: textOrNull(source.error.message)
    };
  }
  if (source.currentUser && typeof source.currentUser === 'object') {
    safe.uid = textOrNull(source.currentUser.uid);
  }
  if (source.claims && typeof source.claims === 'object') {
    safe.claims = {
      role: textOrNull(source.claims.role),
      storeId: textOrNull(source.claims.storeId),
      kioskId: textOrNull(source.claims.kioskId)
    };
  }
  for (const key of ['storeId', 'kioskId', 'documentPath', 'operation']) {
    if (event.endsWith('-failed') && Object.hasOwn(source, key)) safe[key] = textOrNull(source[key]);
  }
  return safe;
}

function createRuntimeLog({
  userDataPath,
  fsModule = fs,
  now = () => new Date(),
  maxBytes = DEFAULT_MAX_BYTES
}) {
  const logPath = path.join(userDataPath, 'runtime.log');
  const rotatedPath = `${logPath}.1`;

  try {
    if (fsModule.statSync(logPath).size > maxBytes) {
      fsModule.rmSync(rotatedPath, { force: true });
      fsModule.renameSync(logPath, rotatedPath);
    }
  } catch {}

  function append(event, details = {}) {
    if (!RUNTIME_EVENTS.has(event)) return false;
    try {
      fsModule.mkdirSync(userDataPath, { recursive: true });
      const safeDetails = sanitizeDetails(event, details);
      const suffix = Object.keys(safeDetails).length ? `\n${JSON.stringify(safeDetails)}` : '';
      fsModule.appendFileSync(
        logPath,
        `${now().toISOString()}\n[RUNTIME]\n${event}${suffix}\n`,
        'utf8'
      );
      return true;
    } catch {
      return false;
    }
  }

  return Object.freeze({ append, logPath, rotatedPath, maxBytes });
}

module.exports = { createRuntimeLog, sanitizeDetails, RUNTIME_EVENTS, DEFAULT_MAX_BYTES };
