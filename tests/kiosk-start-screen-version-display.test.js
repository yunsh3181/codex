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
  assert.match(indexSource, /function languageView\(\)[\s\S]*startScreenVersionHTML\(\)/);
  assert.match(indexSource, /state\.step==='home'[\s\S]*startScreenVersionHTML\(\)/);
  assert.doesNotMatch(indexSource, /function shell\(c\)\{[^}]*startScreenVersionHTML/);
  assert.match(indexSource, /version&&version!=='undefined'&&version!=='null'&&version!=='\[object Object\]'/);
  assert.match(indexSource, /kioskAppVersion='DEV'/);
  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
  assert.doesNotMatch(indexSource, new RegExp(`PapaJohns Kiosk v${packageJson.version.replace(/\./g, '\\.')}`));
});

test('language persistence remains unchanged outside kiosk21 and kiosk resets use the idle screen', () => {
  assert.match(indexSource, /sessionStorage\.getItem\('pjLangSelected'\)\?'idle':'language'/);
  assert.match(indexSource, /sessionStorage\.setItem\('pjLangSelected','1'\);state\.step='home';render\(\)/);
  assert.match(indexSource, /function defaultResetStep\(\)\{return isKioskInactivityLayout\(\)\?'idle':'home'\}/);
  assert.match(indexSource, /function reset\(targetStep=defaultResetStep\(\),options=\{\}\)[\s\S]*Object\.assign\(state,\{step:targetStep/);
  assert.match(indexSource, /if\(state\.step==='language'\)return languageView\(\)/);
  assert.match(indexSource, /if\(state\.step==='idle'\)return idlePromotionView\(\)/);
  assert.match(indexSource, /if\(state\.step==='home'\)return `[\s\S]*startScreenVersionHTML\(\)/);
});

test('version loading starts at DEV, upgrades valid Electron values, and keeps DEV for invalid responses', () => {
  const normalize = value => {
    const version = typeof value === 'string' ? value.trim() : '';
    return version && version !== 'undefined' && version !== 'null' && version !== '[object Object]' ? version : 'DEV';
  };
  assert.equal(normalize('1.1.0'), '1.1.0');
  assert.equal(normalize(null), 'DEV');
  assert.equal(normalize(undefined), 'DEV');
  assert.equal(normalize({ version: '1.1.0' }), 'DEV');
  assert.match(indexSource, /Promise\.resolve\(window\.kioskApp\?\.getVersion\?\.\(\)\)\.then\(value=>/);
  assert.match(indexSource, /kioskAppVersion=normalizedKioskAppVersion\(value\);\s*updateStartScreenVersion\(\)/);
});

test('business-hours status never replaces the kiosk start screen', () => {
  assert.doesNotMatch(indexSource, /businessHoursClosedView|dataset\.step='business-hours'/);
  assert.match(indexSource, /function render\(\)\{/);
});

test('version metadata keeps portrait safe margins and cannot intercept kiosk input', () => {
  assert.match(versionCss, /right:\s*calc\(32px \+ env\(safe-area-inset-right/);
  assert.match(versionCss, /bottom:\s*calc\(64px \+ env\(safe-area-inset-bottom/);
  assert.match(versionCss, /font-size:\s*16px/);
  assert.match(versionCss, /opacity:\s*\.64/);
  assert.match(versionCss, /pointer-events:\s*none/);
  assert.match(versionCss, /z-index:\s*1/);
  assert.match(versionCss, /body\[data-step="language"\] \.kioskAppVersion\s*\{\s*z-index:\s*56/);
});
