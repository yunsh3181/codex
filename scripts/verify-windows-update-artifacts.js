'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const YAML = require('yaml');

const PE_SIGNATURE = 0x00004550;
const MACHINES = { ia32: 0x014c, x64: 0x8664 };
const arch = process.argv[2];

if (!Object.hasOwn(MACHINES, arch)) {
  console.error('Usage: node scripts/verify-windows-update-artifacts.js <ia32|x64>');
  process.exit(2);
}

const root = path.resolve(__dirname, '..');
const dist = path.resolve(process.env.WINDOWS_UPDATE_ARTIFACT_DIR || path.join(root, 'dist'));
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const unpacked = arch === 'ia32' ? 'win-ia32-unpacked' : 'win-unpacked';
const names = {
  setup: `PapaJohns-Kiosk-Setup-${version}-${arch}.exe`,
  portable: `PapaJohns-Kiosk-Portable-${version}-${arch}.exe`,
  blockmap: `PapaJohns-Kiosk-Setup-${version}-${arch}.exe.blockmap`,
  yaml: `latest-${arch}.yml`,
  app: path.join(unpacked, 'PapaJohns-Kiosk.exe')
};

function digest(filePath, algorithm, encoding) {
  return crypto.createHash(algorithm).update(fs.readFileSync(filePath)).digest(encoding);
}

function readMachine(filePath) {
  const file = fs.openSync(filePath, 'r');
  try {
    const dosHeader = Buffer.alloc(64);
    fs.readSync(file, dosHeader, 0, dosHeader.length, 0);
    if (dosHeader.readUInt16LE(0) !== 0x5a4d) throw new Error('missing MZ header');
    const peOffset = dosHeader.readUInt32LE(0x3c);
    const peHeader = Buffer.alloc(6);
    fs.readSync(file, peHeader, 0, peHeader.length, peOffset);
    if (peHeader.readUInt32LE(0) !== PE_SIGNATURE) throw new Error('missing PE signature');
    return peHeader.readUInt16LE(4);
  } finally {
    fs.closeSync(file);
  }
}

function fail(message) {
  console.error(`FAIL ${message}`);
  process.exitCode = 1;
}

const files = Object.fromEntries(Object.entries(names).map(([key, name]) => [key, path.join(dist, name)]));
for (const [key, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath)) fail(`missing ${key}: ${names[key]}`);
  else if (!fs.statSync(filePath).isFile()) fail(`not a file: ${names[key]}`);
}

if (process.exitCode) process.exit(process.exitCode);

if (fs.statSync(files.blockmap).size === 0) fail(`empty blockmap: ${names.blockmap}`);
try {
  JSON.parse(zlib.gunzipSync(fs.readFileSync(files.blockmap)).toString('utf8'));
  console.log(`PASS ${names.blockmap}: gzip and JSON`);
} catch (error) {
  fail(`invalid blockmap ${names.blockmap}: ${error.message}`);
}

try {
  const metadata = YAML.parse(fs.readFileSync(files.yaml, 'utf8'));
  const setupSize = fs.statSync(files.setup).size;
  const setupSha512 = digest(files.setup, 'sha512', 'base64');
  const entry = Array.isArray(metadata.files)
    ? metadata.files.find(item => item && (item.url === names.setup || item.path === names.setup))
    : null;

  if (metadata.version !== version) fail(`${names.yaml} version ${metadata.version}, expected ${version}`);
  if (metadata.path !== names.setup) fail(`${names.yaml} path ${metadata.path}, expected ${names.setup}`);
  if (!entry) fail(`${names.yaml} files entry missing ${names.setup}`);
  if (entry && entry.size !== setupSize) fail(`${names.yaml} size ${entry.size}, expected ${setupSize}`);
  if (entry && entry.sha512 !== setupSha512) fail(`${names.yaml} files sha512 mismatch`);
  if (metadata.sha512 !== setupSha512) fail(`${names.yaml} top-level sha512 mismatch`);
  if (metadata.path.includes(arch === 'ia32' ? '-x64' : '-ia32')) fail(`${names.yaml} references opposite architecture`);
  if (!process.exitCode) console.log(`PASS ${names.yaml}: version, path, size, and SHA-512`);
} catch (error) {
  fail(`invalid YAML ${names.yaml}: ${error.message}`);
}

try {
  const machine = readMachine(files.app);
  const formatted = `0x${machine.toString(16).padStart(4, '0')}`;
  if (machine !== MACHINES[arch]) fail(`${names.app} PE Machine ${formatted}, expected ${arch}`);
  else console.log(`PASS ${names.app}: PE Machine ${formatted} (${arch})`);
} catch (error) {
  fail(`invalid PE ${names.app}: ${error.message}`);
}

for (const key of ['setup', 'portable', 'blockmap', 'yaml']) {
  const filePath = files[key];
  console.log(`FILE ${names[key]} size=${fs.statSync(filePath).size} sha256=${digest(filePath, 'sha256', 'hex')}`);
}

console.log(`SETUP ${names.setup}`);
console.log(`PORTABLE ${names.portable}`);
if (!process.exitCode) console.log(`PASS Windows update artifacts (${arch})`);
