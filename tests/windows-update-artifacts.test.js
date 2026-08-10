'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const zlib = require('node:zlib');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts', 'verify-windows-update-artifacts.js');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'windows-distribution.yml'), 'utf8');
const releaseWorkflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'windows-release.yml'), 'utf8');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function assertConsistentReleaseVersions(packageVersion, lockVersion, lockRootVersion) {
  assert.equal(typeof packageVersion, 'string');
  assert.match(packageVersion, RELEASE_VERSION);
  assert.equal(lockVersion, packageVersion);
  assert.equal(lockRootVersion, packageVersion);
}

function makePe(machine) {
  const value = Buffer.alloc(256);
  value.writeUInt16LE(0x5a4d, 0);
  value.writeUInt32LE(0x80, 0x3c);
  value.writeUInt32LE(0x00004550, 0x80);
  value.writeUInt16LE(machine, 0x84);
  return value;
}

function fixture(arch) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `windows-update-${arch}-`));
  const setup = `PapaJohns-Kiosk-Setup-${version}-${arch}.exe`;
  const blockmap = `${setup}.blockmap`;
  const yaml = `latest-${arch}.yml`;
  const unpacked = arch === 'ia32' ? 'win-ia32-unpacked' : 'win-unpacked';
  const setupBytes = Buffer.from(`setup-${arch}`);
  fs.writeFileSync(path.join(directory, setup), setupBytes);
  fs.writeFileSync(path.join(directory, blockmap), zlib.gzipSync(JSON.stringify({ version: 2, files: [] })));
  fs.mkdirSync(path.join(directory, unpacked), { recursive: true });
  fs.writeFileSync(path.join(directory, unpacked, 'PapaJohns-Kiosk.exe'), makePe(arch === 'ia32' ? 0x014c : 0x8664));
  const appDirectory = path.join(directory, 'app-source');
  const resourcesDirectory = path.join(directory, unpacked, 'resources');
  fs.mkdirSync(appDirectory);
  fs.mkdirSync(resourcesDirectory);
  fs.writeFileSync(path.join(appDirectory, 'package.json'), JSON.stringify({ name: 'fixture', version }));
  const packed = spawnSync(process.execPath, [path.join(root, 'node_modules', '@electron', 'asar', 'bin', 'asar.js'), 'pack', appDirectory, path.join(resourcesDirectory, 'app.asar')], { encoding: 'utf8' });
  assert.equal(packed.status, 0, packed.stderr);
  const sha512 = crypto.createHash('sha512').update(setupBytes).digest('base64');
  fs.writeFileSync(path.join(directory, yaml), YAML.stringify({
    version,
    files: [{ url: setup, sha512, size: setupBytes.length }],
    path: setup,
    sha512
  }));
  return { directory, setup, blockmap, yaml };
}

function run(arch, directory) {
  return spawnSync(process.execPath, [script, arch], {
    cwd: root,
    env: { ...process.env, WINDOWS_UPDATE_ARTIFACT_DIR: directory },
    encoding: 'utf8'
  });
}

function withFixture(arch, callback) {
  const value = fixture(arch);
  try { callback(value); } finally { fs.rmSync(value.directory, { recursive: true, force: true }); }
}

test('workflows build and upload exactly three ia32 NSIS update artifacts', () => {
  assert.match(workflow, /electron-builder --win nsis --ia32 --publish never --config\.publish\.channel=latest-ia32/);
  assert.match(releaseWorkflow, /electron-builder --win nsis --ia32 --publish never --config\.publish\.channel=latest-ia32/);
  for (const source of [workflow, releaseWorkflow]) {
    assert.match(source, /release-assets/);
    assert.match(source, /Count -ne 3/);
    assert.match(source, /latest-ia32\.yml/);
    assert.doesNotMatch(source, /--x64|latest-x64\.yml|Portable-\*/);
    assert.doesNotMatch(source, /win-unpacked\//);
  }
  assert.doesNotMatch(releaseWorkflow, /push:\s*\n\s*tags:/);
  assert.match(releaseWorkflow, /cancel-in-progress: false/);
});

for (const arch of ['ia32', 'x64']) {
  test(`valid ${arch} fixture passes`, () => withFixture(arch, value => {
    const result = run(arch, value.directory);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(`PASS Windows update artifacts \\(${arch}\\)`));
  }));
}

for (const missing of ['blockmap', 'yaml']) {
  test(`missing ${missing} fails with the exact file name`, () => withFixture('ia32', value => {
    fs.rmSync(path.join(value.directory, value[missing]));
    const result = run('ia32', value.directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(value[missing].replaceAll('.', '\\.')));
  }));
}

for (const [name, mutate, message] of [
  ['version mismatch', metadata => { metadata.version = '0.0.0'; }, /version 0\.0\.0/],
  ['opposite architecture path', metadata => { metadata.path = metadata.path.replace('-ia32', '-x64'); }, /path .* expected/],
  ['size mismatch', metadata => { metadata.files[0].size += 1; }, /size .* expected/],
  ['SHA-512 mismatch', metadata => { metadata.files[0].sha512 = 'invalid'; }, /files sha512 mismatch/]
]) {
  test(`${name} fails`, () => withFixture('ia32', value => {
    const filePath = path.join(value.directory, value.yaml);
    const metadata = YAML.parse(fs.readFileSync(filePath, 'utf8'));
    mutate(metadata);
    fs.writeFileSync(filePath, YAML.stringify(metadata));
    const result = run('ia32', value.directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, message);
  }));
}

test('corrupt gzip blockmap fails', () => withFixture('x64', value => {
  fs.writeFileSync(path.join(value.directory, value.blockmap), 'not gzip');
  const result = run('x64', value.directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid blockmap/);
}));

test('blockmap JSON accepts numeric 2 and electron-builder string "2"', () => {
  for (const blockmapVersion of [2, '2']) {
    withFixture('ia32', value => {
      fs.writeFileSync(path.join(value.directory, value.blockmap), zlib.gzipSync(JSON.stringify({ version: blockmapVersion, files: [] })));
      const result = run('ia32', value.directory);
      assert.equal(result.status, 0, result.stderr);
    });
  }
});

for (const [name, blockmap] of [
  ['missing version', { files: [] }],
  ['empty version', { version: '', files: [] }],
  ['non-numeric version', { version: 'two', files: [] }],
  ['different version', { version: 1, files: [] }]
]) {
  test(`blockmap JSON ${name} fails`, () => withFixture('ia32', value => {
    fs.writeFileSync(path.join(value.directory, value.blockmap), zlib.gzipSync(JSON.stringify(blockmap)));
    const result = run('ia32', value.directory);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /expected 2/);
  }));
}

test('portable or x64 top-level output fails an ia32 bundle', () => withFixture('ia32', value => {
  fs.writeFileSync(path.join(value.directory, `PapaJohns-Kiosk-Portable-${version}-ia32.exe`), 'unexpected');
  const result = run('ia32', value.directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /prohibited top-level artifacts/);
}));

test('release version consistency accepts supported patch releases', () => {
  assert.doesNotThrow(() => assertConsistentReleaseVersions('1.2.21', '1.2.21', '1.2.21'));
  assert.doesNotThrow(() => assertConsistentReleaseVersions('1.2.22', '1.2.22', '1.2.22'));
});

for (const [name, values] of [
  ['package mismatch', ['1.2.22', '1.2.21', '1.2.21']],
  ['lock root mismatch', ['1.2.22', '1.2.22', '1.2.21']],
  ['empty version', ['', '', '']],
  ['v-prefixed version', ['v1.2.22', 'v1.2.22', 'v1.2.22']],
  ['incomplete version', ['1.2', '1.2', '1.2']],
  ['arbitrary version', ['release', 'release', 'release']]
]) {
  test(`${name} fails release version consistency`, () => {
    assert.throws(() => assertConsistentReleaseVersions(...values));
  });
}

test('package and lockfile versions stay internally consistent', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  assertConsistentReleaseVersions(pkg.version, lock.version, lock.packages[''].version);
});
