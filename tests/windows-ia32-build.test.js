'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const packageJson = require('../package.json');

test('Electron remains on an exact stable 43.x release', () => {
  assert.match(packageJson.devDependencies.electron, /^43\.\d+\.\d+$/);
});

test('Windows defaults to ia32-capable NSIS without removing explicit x64 support', () => {
  assert.deepEqual(packageJson.build.win.target, ['nsis']);
  assert.match(packageJson.scripts['dist:win:x64'], /--x64/);
  assert.match(packageJson.scripts['dist:win:ia32'], /--ia32/);
  assert.match(packageJson.build.nsis.artifactName, /\$\{arch\}/);
  assert.equal(packageJson.build.portable, undefined);
  assert.match(packageJson.scripts['desktop:build:win'], /dist:win:ia32/);
});

test('ia32 scripts and Windows artifact workflow are present', () => {
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'windows-distribution.yml'),
    'utf8'
  );
  assert.equal(packageJson.scripts['dist:win:ia32'], 'electron-builder --win --ia32');
  assert.equal(packageJson.scripts['dist:win:ia32:dir'], 'electron-builder --win --ia32 --dir');
  assert.ok(fs.existsSync(path.join(root, '.github', 'workflows', 'windows-distribution.yml')));
  assert.match(workflow, /npm test -- --test-concurrency=1/);
  assert.doesNotMatch(workflow, /--x64|latest-x64|Portable-\*/);
  assert.ok(fs.existsSync(path.join(root, 'scripts', 'verify-windows-pe.js')));
});
