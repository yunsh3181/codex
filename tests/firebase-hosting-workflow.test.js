'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'firebase-hosting-preview.yml');
const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));

const stepsFor = (jobName) => workflow.jobs[jobName].steps;
const stepNamed = (jobName, name) => stepsFor(jobName).find((step) => step.name === name);
const commandsFor = (jobName) => stepsFor(jobName)
  .filter((step) => typeof step.run === 'string')
  .map((step) => step.run)
  .join('\n');

test('Firebase Preview validation job has no OIDC or Google credentials', () => {
  const job = workflow.jobs.build_and_test;
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job.permissions['id-token'], undefined);
  assert.doesNotMatch(JSON.stringify(job), /google-github-actions\/auth/);
  assert.match(commandsFor('build_and_test'), /npm ci/);
  assert.match(commandsFor('build_and_test'), /npm test/);
  assert.match(commandsFor('build_and_test'), /node node_modules\/electron\/install\.js/);
  assert.match(commandsFor('build_and_test'), /xvfb-run --auto-servernum npm test/);
  assert.match(commandsFor('build_and_test'), /npm run build:hosting/);
  assert.match(commandsFor('build_and_test'), /npm run test:hosting/);

  const upload = stepNamed('build_and_test', 'Upload verified Firebase Hosting artifact');
  assert.equal(upload.with.path, '.firebase-hosting/');
  assert.doesNotMatch(upload.with.path, /(?:^|\/)firebase\.json|\.firebaserc/);
});

test('Firebase Preview deploy job is gated and only consumes the verified artifact', () => {
  const job = workflow.jobs.deploy_preview;
  assert.equal(job.needs, 'build_and_test');
  assert.equal(job.environment, 'firebase-hosting-preview');
  assert.deepEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
  assert.match(job.if, /head\.repo\.full_name == github\.repository/);

  const uses = stepsFor('deploy_preview').map((step) => step.uses).filter(Boolean);
  assert.equal(uses.some((value) => value.startsWith('actions/download-artifact@')), true);
  assert.equal(uses.some((value) => value.startsWith('actions/checkout@')), false);
  assert.equal(uses.some((value) => value.startsWith('google-github-actions/auth@')), true);

  const download = stepNamed('deploy_preview', 'Download verified Firebase Hosting artifact');
  assert.equal(download.with.path, '.firebase-hosting');

  const validation = stepNamed('deploy_preview', 'Validate downloaded static artifact');
  assert.match(validation.run, /find \.firebase-hosting -type l/);
  assert.match(validation.run, /index\.html/);
  assert.match(validation.run, /admin\/index\.html/);
  for (const forbidden of ['firebase.json', '.firebaserc', 'firestore.rules', 'package.json']) {
    assert.match(validation.run, new RegExp(forbidden.replace('.', '\\.')));
  }

  const configStep = stepNamed('deploy_preview', 'Create hook-free Firebase Preview config');
  const deployStep = stepNamed('deploy_preview', 'Deploy preview channel without changing Authentication domains');
  const expectedConfigPath = '${{ github.workspace }}/firebase-preview.json';
  assert.equal(configStep.env.CONFIG_PATH, expectedConfigPath);
  assert.equal(deployStep.env.CONFIG_PATH, expectedConfigPath);
  assert.equal(configStep.env.CONFIG_PATH, deployStep.env.CONFIG_PATH);
  assert.doesNotMatch(configStep.env.CONFIG_PATH, /runner\.temp/);
  const configMatch = configStep.run.match(/<<'JSON'\n([\s\S]*?)\nJSON/);
  assert.ok(configMatch, 'Preview config JSON heredoc is missing');
  const previewConfig = JSON.parse(configMatch[1]);
  assert.deepEqual(previewConfig, {
    hosting: {
      site: 'papajohns-kiosk',
      public: '.firebase-hosting',
      ignore: ['**/.*', '**/node_modules/**'],
    },
  });
  const localConfigPath = configStep.env.CONFIG_PATH.replace('${{ github.workspace }}', root);
  assert.equal(
    path.resolve(path.dirname(localConfigPath), previewConfig.hosting.public),
    path.join(root, '.firebase-hosting')
  );

  const authIndex = stepsFor('deploy_preview').findIndex((step) => step.name === 'Authenticate to Google Cloud');
  assert.ok(stepsFor('deploy_preview').indexOf(validation) < authIndex);
  assert.ok(stepsFor('deploy_preview').indexOf(configStep) < authIndex);

  const commands = commandsFor('deploy_preview');
  assert.doesNotMatch(commands, /npm (ci|test|run\s+(?:build:hosting|test:hosting))/);
  assert.match(commands, /firebase-tools@15\.24\.0/);
  assert.match(commands, /hosting:channel:deploy/);
  assert.match(commands, /--no-authorized-domains/);
  assert.match(commands, /--expires 7d/);
  assert.match(commands, /--project papajohns-kiosk/);
  assert.match(commands, /--config "\$CONFIG_PATH"/);
  assert.doesNotMatch(commands, /firebase deploy(?:\s|$)/);
});

test('Hosting tests are separated and run after the Hosting build', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(packageJson.scripts.test, 'node --test tests/*.test.js');
  assert.equal(packageJson.scripts['test:hosting'], 'node --test tests/hosting/*.test.js');

  const commands = commandsFor('build_and_test');
  assert.ok(commands.indexOf('npm run build:hosting') < commands.indexOf('npm run test:hosting'));
});
