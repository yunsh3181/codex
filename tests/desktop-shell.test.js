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
  assert.match(mainSource, /!app\.isPackaged && process\.argv\.includes\('--dev'\)/);
  assert.match(mainSource, /mainWindow\.setKiosk\(true\)/);
  assert.match(mainSource, /mainWindow\.setFullScreen\(true\)/);
  assert.match(mainSource, /screen\.getPrimaryDisplay\(\)\.bounds/);
  assert.match(mainSource, /mainWindow\.setBounds\(primaryDisplayBounds\)/);
  assert.match(mainSource, /show:\s*false/);
  assert.match(mainSource, /setWindowOpenHandler\(\(\) => \(\{ action: 'deny' \}\)\)/);
  assert.match(mainSource, /'will-navigate'/);
});

test('desktop shell prevents duplicate instances and display sleep', () => {
  assert.match(mainSource, /requestSingleInstanceLock\(\)/);
  assert.match(mainSource, /'second-instance'/);
  assert.match(mainSource, /powerSaveBlocker\.start\('prevent-display-sleep'\)/);
  assert.match(mainSource, /powerSaveBlocker\.stop\(powerSaveBlockerId\)/);
});

test('Windows default build emits architecture-labelled NSIS Setup only', () => {
  assert.match(
    packageJson.scripts['desktop:build:win'],
    /process\.platform !== 'win32'/
  );
  const targets = packageJson.build.win.target;
  assert.deepEqual(targets, ['nsis']);
  assert.match(packageJson.scripts['dist:win:x64'], /--x64/);
  assert.match(packageJson.scripts['dist:win:ia32'], /--ia32/);
  assert.equal(packageJson.build.nsis.artifactName, 'PapaJohns-Kiosk-Setup-${version}-${arch}.${ext}');
  assert.equal(packageJson.build.nsis.oneClick, false);
  assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
  assert.equal(packageJson.build.nsis.runAfterFinish, false);
  assert.equal(packageJson.build.portable, undefined);
});
