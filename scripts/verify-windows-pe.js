'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PE_SIGNATURE = 0x00004550;
const MACHINES = {
  ia32: 0x014c,
  x64: 0x8664
};

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

function expectedArtifacts(arch) {
  const packageJson = require('../package.json');
  const version = packageJson.version;
  if (arch === 'x64') {
    return [
      path.join('dist', 'win-unpacked', 'PapaJohns-Kiosk.exe')
    ];
  }
  return [
    path.join('dist', `PapaJohns-Kiosk-Setup-${version}-${arch}.exe`),
    path.join('dist', `PapaJohns-Kiosk-Portable-${version}-${arch}.exe`),
    path.join('dist', `win-${arch}-unpacked`, 'PapaJohns-Kiosk.exe')
  ];
}

const arch = process.argv[2];
if (!Object.hasOwn(MACHINES, arch)) {
  console.error('Usage: node scripts/verify-windows-pe.js <ia32|x64>');
  process.exit(2);
}

let failed = false;
for (const relativePath of expectedArtifacts(arch)) {
  const filePath = path.resolve(__dirname, '..', relativePath);
  if (!fs.existsSync(filePath)) {
    console.error(`MISSING ${relativePath}`);
    failed = true;
    continue;
  }

  try {
    const machine = readMachine(filePath);
    const expected = MACHINES[arch];
    const formatted = `0x${machine.toString(16).padStart(4, '0')}`;
    if (machine !== expected) {
      console.error(`FAIL ${relativePath}: PE Machine ${formatted}, expected ${arch}`);
      failed = true;
    } else {
      console.log(`PASS ${relativePath}: PE Machine ${formatted} (${arch})`);
    }
  } catch (error) {
    console.error(`FAIL ${relativePath}: ${error.message}`);
    failed = true;
  }
}

if (failed) process.exit(1);
