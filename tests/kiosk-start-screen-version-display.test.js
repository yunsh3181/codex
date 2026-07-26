'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const mainSource = read('desktop/main.js');
const preloadSource = read('desktop/preload.js');
const indexSource = read('index.html');
const versionCss = read('styles/app-version.css');
const packageJson = JSON.parse(read('package.json'));

test('Electron exposes only the installed app version through the existing secure bridge', () => {
  assert.match(mainSource, /ipcMain\.handle\('kiosk-app:get-version'/);
  assert.match(mainSource, /const version = app\.getVersion\(\)/);
  assert.match(mainSource, /event\.sender !== mainWindow\.webContents/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld\('kioskApp'/);
  assert.match(preloadSource, /getVersion:\s*\(\) => ipcRenderer\.invoke\('kiosk-app:get-version'\)/);
  assert.doesNotMatch(preloadSource, /nodeIntegration/);
});

test('start screens render a safe version label and ordering screens do not', () => {
  assert.match(indexSource, /function startScreenVersionHTML\(\)/);
  assert.match(indexSource, /businessHoursPanel[\s\S]*startScreenVersionHTML\(\)/);
  assert.match(indexSource, /state\.step==='home'[\s\S]*startScreenVersionHTML\(\)/);
  assert.doesNotMatch(indexSource, /function shell\(c\)\{[^}]*startScreenVersionHTML/);
  assert.match(indexSource, /version&&version!=='undefined'&&version!=='null'/);
  assert.match(indexSource, /kioskAppVersion='DEV'/);
  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.doesNotMatch(indexSource, new RegExp(`PapaJohns Kiosk v${packageJson.version.replace(/\./g, '\\.')}`));
});

test('version metadata keeps portrait safe margins and cannot intercept kiosk input', () => {
  assert.match(versionCss, /right:\s*calc\(32px \+ env\(safe-area-inset-right/);
  assert.match(versionCss, /bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom/);
  assert.match(versionCss, /font-size:\s*16px/);
  assert.match(versionCss, /opacity:\s*\.64/);
  assert.match(versionCss, /pointer-events:\s*none/);
  assert.match(versionCss, /z-index:\s*1/);
});
