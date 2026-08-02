'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '.firebase-hosting');
const webDirectories = new Set(['admin', 'assets', 'i18n', 'seat', 'styles', 'waiting-tv']);
const webExtensions = new Set(['.css', '.html', '.js']);

const trackedFiles = execFileSync('git', ['ls-files', '-z'], {
  cwd: root,
  encoding: 'utf8',
}).split('\0').filter(Boolean);

const deployFiles = trackedFiles.filter((file) => {
  if (file === 'CNAME') return false;
  const segments = file.split('/');
  if (segments.length === 1) return webExtensions.has(path.extname(file));
  return webDirectories.has(segments[0]);
});

fs.rmSync(output, { recursive: true, force: true });
for (const file of deployFiles) {
  const source = path.join(root, file);
  const destination = path.join(output, file);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

console.log(`Prepared ${deployFiles.length} tracked web files in .firebase-hosting`);
