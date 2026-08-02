'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const workflowPath = path.join(root, '.github', 'workflows', 'firebase-hosting-live.yml');
const workflow = YAML.parse(fs.readFileSync(workflowPath, 'utf8'));

const stepsFor = (jobName) => workflow.jobs[jobName].steps;
const stepNamed = (jobName, name) => stepsFor(jobName).find((step) => step.name === name);
const commandsFor = (jobName) => stepsFor(jobName)
  .filter((step) => typeof step.run === 'string')
  .map((step) => step.run)
  .join('\n');

test('Firebase live workflow is manual-only and requires the exact confirmation phrase', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.push, undefined);
  assert.equal(workflow.on.pull_request, undefined);
  assert.equal(workflow.on.schedule, undefined);

  const confirmation = workflow.on.workflow_dispatch.inputs.confirmation;
  assert.equal(confirmation.required, true);
  assert.equal(confirmation.type, 'string');
  assert.match(confirmation.description, /DEPLOY_PAPAJOHNS_KIOSK_LIVE/);

  const validation = stepNamed('build_and_test', 'Validate live deployment confirmation');
  assert.ok(validation);
  assert.match(validation.run, /DEPLOY_PAPAJOHNS_KIOSK_LIVE/);
  assert.match(validation.run, /refs\/heads\/main/);
  assert.match(validation.run, /exit 1/);
  assert.ok(stepsFor('build_and_test').indexOf(validation) < stepsFor('build_and_test').findIndex((step) => step.uses));
});

test('Firebase live build job has no OIDC credentials or deployment command', () => {
  const job = workflow.jobs.build_and_test;
  assert.deepEqual(job.permissions, { contents: 'read' });
  assert.equal(job.permissions['id-token'], undefined);
  assert.doesNotMatch(JSON.stringify(job), /google-github-actions\/auth/);

  const commands = commandsFor('build_and_test');
  assert.match(commands, /npm ci/);
  assert.match(commands, /npm test/);
  assert.match(commands, /npm run build:hosting/);
  assert.match(commands, /npm run test:hosting/);
  assert.doesNotMatch(commands, /firebase deploy/);

  const upload = stepNamed('build_and_test', 'Upload verified Firebase Hosting artifact');
  assert.equal(upload.with.path, '.firebase-hosting/');
  assert.doesNotMatch(upload.with.path, /firebase\.json|\.firebaserc/);
});

test('Firebase live deploy job is isolated, environment-gated, and OIDC-only', () => {
  const job = workflow.jobs.deploy_live;
  assert.equal(job.needs, 'build_and_test');
  assert.equal(job.environment, 'firebase-hosting-live');
  assert.deepEqual(job.permissions, { contents: 'read', 'id-token': 'write' });
  assert.match(job.if, /deploy_enabled == 'true'/);

  const uses = stepsFor('deploy_live').map((step) => step.uses).filter(Boolean);
  assert.equal(uses.some((value) => value.startsWith('actions/download-artifact@')), true);
  assert.equal(uses.some((value) => value.startsWith('actions/checkout@')), false);
  assert.equal(uses.some((value) => value.startsWith('google-github-actions/auth@')), true);

  const commands = commandsFor('deploy_live');
  assert.doesNotMatch(commands, /npm (ci|test|run\s+(?:build:hosting|test:hosting))/);
  assert.match(commands, /firebase-tools@15\.24\.0 --ignore-scripts/);

  const deploy = stepNamed('deploy_live', 'Deploy only the Firebase Hosting live site');
  assert.doesNotMatch(deploy.run, /--only (?:firestore|functions|database|storage)|auth:/);

  const auth = stepNamed('deploy_live', 'Authenticate to Google Cloud');
  assert.equal(auth.with.workload_identity_provider, '${{ vars.GCP_LIVE_WORKLOAD_IDENTITY_PROVIDER }}');
  assert.equal(auth.with.service_account, '${{ vars.GCP_FIREBASE_LIVE_DEPLOY_SERVICE_ACCOUNT }}');
  assert.equal(auth.with.cleanup_credentials, true);
});

test('Firebase live deployment validates only the verified static artifact before authentication', () => {
  const download = stepNamed('deploy_live', 'Download verified Firebase Hosting artifact');
  assert.equal(download.with.path, '.firebase-hosting');

  const validation = stepNamed('deploy_live', 'Validate downloaded static artifact');
  assert.match(validation.run, /find \.firebase-hosting -type l/);
  assert.match(validation.run, /index\.html/);
  assert.match(validation.run, /admin\/index\.html/);
  for (const forbidden of ['firebase.json', '.firebaserc', 'firestore.rules', 'package.json']) {
    assert.match(validation.run, new RegExp(forbidden.replace('.', '\\.')));
  }

  const configStep = stepNamed('deploy_live', 'Create hook-free Firebase live config');
  const targetStep = stepNamed('deploy_live', 'Validate live target before authentication');
  const authIndex = stepsFor('deploy_live').findIndex((step) => step.name === 'Authenticate to Google Cloud');
  assert.ok(stepsFor('deploy_live').indexOf(validation) < authIndex);
  assert.ok(stepsFor('deploy_live').indexOf(configStep) < authIndex);
  assert.ok(stepsFor('deploy_live').indexOf(targetStep) < authIndex);

  const configMatch = configStep.run.match(/<<'JSON'\n([\s\S]*?)\nJSON/);
  assert.ok(configMatch, 'Live config JSON heredoc is missing');
  const liveConfig = JSON.parse(configMatch[1]);
  assert.deepEqual(liveConfig, {
    hosting: {
      site: 'papajohns-kiosk',
      public: '.firebase-hosting',
      ignore: ['**/.*', '**/node_modules/**'],
    },
  });
  assert.equal(configStep.env.CONFIG_PATH, '${{ github.workspace }}/firebase-live.json');
  assert.equal(targetStep.env.CONFIG_PATH, configStep.env.CONFIG_PATH);
  assert.match(targetStep.run, /config\.hosting\?\.site !== 'papajohns-kiosk'/);
  assert.match(targetStep.run, /predeploy|postdeploy/);

  const summary = stepNamed('deploy_live', 'Print final live deployment summary');
  const deploy = stepNamed('deploy_live', 'Deploy only the Firebase Hosting live site');
  assert.ok(stepsFor('deploy_live').indexOf(summary) > authIndex);
  assert.ok(stepsFor('deploy_live').indexOf(summary) < stepsFor('deploy_live').indexOf(deploy));
  assert.match(summary.run, /Verified artifact file count/);
  assert.match(summary.run, /Deployment confirmation matched: yes/);
});

test('Firebase live deployment is fixed to the project and exact Hosting site', () => {
  const deploy = stepNamed('deploy_live', 'Deploy only the Firebase Hosting live site');
  assert.match(deploy.run, /^firebase deploy\s/m);
  assert.match(deploy.run, /--only hosting(?:\s|$)/);
  assert.doesNotMatch(deploy.run, /--only hosting:papajohns-kiosk/);
  assert.doesNotMatch(deploy.run, /hosting:/);
  assert.doesNotMatch(deploy.run, /\.firebaserc/);
  assert.match(deploy.run, /--project papajohns-kiosk/);
  assert.match(deploy.run, /--config "\$CONFIG_PATH"/);
  assert.match(deploy.run, /--non-interactive/);
  assert.doesNotMatch(deploy.run, /--only (?:firestore|functions|database|storage)/);
});

test('Missing live identity variables safely skip the deploy job', () => {
  const eligibility = stepNamed('build_and_test', 'Check live deployment eligibility');
  assert.equal(eligibility.env.WORKLOAD_IDENTITY_PROVIDER, '${{ vars.GCP_LIVE_WORKLOAD_IDENTITY_PROVIDER }}');
  assert.equal(eligibility.env.DEPLOY_SERVICE_ACCOUNT, '${{ vars.GCP_FIREBASE_LIVE_DEPLOY_SERVICE_ACCOUNT }}');
  assert.match(eligibility.run, /enabled=false/);
  assert.match(eligibility.run, /GCP_LIVE_WORKLOAD_IDENTITY_PROVIDER/);
  assert.match(eligibility.run, /GCP_FIREBASE_LIVE_DEPLOY_SERVICE_ACCOUNT/);
  assert.match(workflow.jobs.deploy_live.if, /needs\.build_and_test\.outputs\.deploy_enabled/);
});
