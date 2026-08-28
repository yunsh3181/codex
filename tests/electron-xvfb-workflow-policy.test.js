const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const YAML = require('yaml');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(
  path.join(root, '.github', 'workflows', 'electron-xvfb-stability.yml'),
  'utf8',
);
const parsed = YAML.parse(workflow);

test('Electron Xvfb runs each protected suite exactly three times', () => {
  assert.equal(parsed.jobs.repeated_linux_xvfb.steps.length, 9);
  assert.equal((workflow.match(/for iteration in \{1\.\.3\}; do/g) || []).length, 3);
  assert.equal((workflow.match(/for iteration in \{1\.\.10\}; do/g) || []).length, 0);
  assert.match(workflow, /Full Xvfb suite \$\{iteration\}\/3/);
  assert.match(workflow, /Concurrent Electron suite \$\{iteration\}\/3/);
  assert.match(workflow, /waiting-TV \$\{iteration\}\/3/);
});

test('Electron Xvfb keeps suite commands, ordering, timeout, and cleanup strict', () => {
  const full = workflow.indexOf('xvfb-run --auto-servernum npm test');
  const browser = workflow.indexOf('xvfb-run --auto-servernum node --test \\\n');
  const waiting = workflow.indexOf(
    'xvfb-run --auto-servernum node --test tests/waiting-tv-completion-browser.test.js',
  );
  const cleanup = workflow.indexOf('Verify Electron and temporary resource cleanup');

  assert.ok(full >= 0 && full < browser && browser < waiting && waiting < cleanup);
  assert.match(workflow, /timeout-minutes: 60/);
  assert.match(workflow, /if pgrep -af '\[e\]lectron'; then/);
  assert.match(workflow, /electron-verification-\*\.lock\*/);
  assert.doesNotMatch(workflow, /continue-on-error|retry|--test-skip|force-success/i);
});
