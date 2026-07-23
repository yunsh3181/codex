'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mainSource = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('desktop shell loads the shared root customer app with hardened web preferences', () => {
  assert.match(mainSource, /path\.resolve\(__dirname, '\.\.', 'index\.html'\)/);
  assert.match(mainSource, /contextIsolation:\s*true/);
  assert.match(mainSource, /nodeIntegration:\s*false/);
  assert.match(mainSource, /sandbox:\s*true/);
  assert.match(mainSource, /fileURLToPath\(target\)/);
  assert.match(mainSource, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(mainSource, /'will-navigate'/);
});

test('desktop shell prevents duplicate instances and display sleep', () => {
  assert.match(mainSource, /requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /'second-instance'/);
  assert.match(mainSource, /powerSaveBlocker\.start\('prevent-display-sleep'\)/);
  assert.match(mainSource, /powerSaveBlocker\.stop\(powerSaveBlockerId\)/);
});

test('Windows build emits both NSIS and portable x64 artifacts', () => {
  const targets = packageJson.build.win.target;
  assert.deepEqual(targets.map(({ target }) => target), ['nsis', 'portable']);
  assert.ok(targets.every(({ arch }) => arch.includes('x64')));
  assert.equal(packageJson.build.nsis.artifactName, 'PapaJohns-Kiosk-Setup-${version}.${ext}');
  assert.equal(
    packageJson.build.portable.artifactName,
    'PapaJohns-Kiosk-Portable-${version}.${ext}'
  );
});
