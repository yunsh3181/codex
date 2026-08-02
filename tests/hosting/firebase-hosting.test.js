'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const hostingRoot = path.join(root, '.firebase-hosting');
const firebaseConfig = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'));
const rc = JSON.parse(fs.readFileSync(path.join(root, '.firebaserc'), 'utf8'));

test('Hosting targets the existing Firebase project and staged static output', () => {
  assert.equal(rc.projects.default, 'papajohns-kiosk');
  assert.equal(firebaseConfig.hosting.site, 'papajohns-kiosk');
  assert.equal(firebaseConfig.hosting.public, '.firebase-hosting');
  assert.equal(firebaseConfig.hosting.rewrites, undefined);
  assert.equal(firebaseConfig.hosting.trailingSlash, undefined);
});

test('Hosting output contains direct main and admin entries with their assets', () => {
  for (const file of ['index.html', 'admin/index.html', 'admin.css', 'admin.js']) {
    assert.equal(fs.existsSync(path.join(hostingRoot, file)), true, `${file} is missing`);
  }
  const admin = fs.readFileSync(path.join(hostingRoot, 'admin/index.html'), 'utf8');
  assert.match(admin, /\.\.\/admin\.css/);
  assert.match(admin, /\.\.\/admin\.js/);
});

test('Firebase output excludes GitHub Pages CNAME and non-hosting configuration', () => {
  for (const file of ['CNAME', 'firebase.json', 'firestore.rules', 'package.json']) {
    assert.equal(fs.existsSync(path.join(hostingRoot, file)), false, `${file} must not be deployed`);
  }
});

test('application Firebase project remains unchanged', () => {
  const customer = fs.readFileSync(path.join(hostingRoot, 'index.html'), 'utf8');
  const adminConfig = fs.readFileSync(path.join(hostingRoot, 'firebase-config.js'), 'utf8');
  assert.match(customer, /projectId:\s*["']papajohns-kiosk["']/);
  assert.match(adminConfig, /projectId:\s*["']papajohns-kiosk["']/);
});
