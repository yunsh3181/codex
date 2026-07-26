#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

const EXPECTED_PROJECT_ID = 'papajohns-kiosk';

function validateCustomToken(token) {
  if (typeof token !== 'string') {
    throw new Error('Firebase Admin returned a non-string Custom Token');
  }
  const segments = token.split('.');
  if (segments.length !== 3 || segments.some(segment => !segment)) {
    throw new Error('Firebase Admin returned a malformed Custom Token');
  }
  return token;
}

function fail(message) {
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

function options(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) throw new Error(`Unknown argument: ${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}`);
    result[key.slice(2)] = value;
    index += 1;
  }
  return result;
}

async function main() {
  const args = options(process.argv.slice(2));
  const storeId = args['store-id']?.trim();
  const kioskId = args['kiosk-id']?.trim();
  if (!storeId) throw new Error('Required option missing: --store-id');
  if (!kioskId) throw new Error('Required option missing: --kiosk-id');

  let credential;
  let configuredProjectId = null;
  if (args['service-account']) {
    const serviceAccountPath = path.resolve(args['service-account']);
    if (!fs.existsSync(serviceAccountPath)) {
      throw new Error(`Service account file not found: ${serviceAccountPath}`);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    configuredProjectId = serviceAccount.project_id;
    credential = cert(serviceAccount);
  } else {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      throw new Error(
        'Set GOOGLE_APPLICATION_CREDENTIALS or pass --service-account with a repository-external JSON path'
      );
    }
    credential = applicationDefault();
  }

  const projectId = configuredProjectId || await credential.getProjectId();
  if (projectId !== EXPECTED_PROJECT_ID) {
    throw new Error(`Firebase project mismatch: expected ${EXPECTED_PROJECT_ID}, received ${projectId || 'unknown'}`);
  }
  const app = getApps()[0] || initializeApp({ credential, projectId });
  const uid = `kiosk:${storeId}:${kioskId}`;
  const token = validateCustomToken(
    await getAuth(app).createCustomToken(uid, { role: 'kiosk', storeId, kioskId })
  );

  process.stdout.write(`${token}\n`);
}

if (require.main === module) {
  main().catch(error => fail(error?.message || String(error)));
}

module.exports = { main, options, validateCustomToken };
