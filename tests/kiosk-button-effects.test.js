const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const kiosk = fs.readFileSync(path.join(root, 'styles/device-kiosk21.css'), 'utf8');
const compact = value => value.replace(/\s+/g, '');

function rule(selector) {
  const start = kiosk.lastIndexOf(`${selector} {`);
  assert.notEqual(start, -1, selector);
  const open = kiosk.indexOf('{', start);
  const close = kiosk.indexOf('}', open);
  return kiosk.slice(open + 1, close);
}

test('home dine-in and takeout cards have no pointer-state border', () => {
  const states = rule(
    'html[data-layout="kiosk21"] body[data-step="home"] .heroChoice:active'
  );
  assert.match(states, /border:\s*0\s*!important/);
  assert.match(states, /outline:\s*0/);
  assert.match(states, /transform:\s*none\s*!important/);
});

test('home cards retain a branded keyboard focus indicator', () => {
  const focus = rule(
    'html[data-layout="kiosk21"] body[data-step="home"] .heroChoice:focus-visible'
  );
  assert.match(focus, /outline:\s*2px solid var\(--r\)\s*!important/);
  assert.match(focus, /outline-offset:\s*3px/);
});

test('phone keypad active feedback cannot scale, translate, animate, or glow', () => {
  const keypad = rule(
    'html[data-layout="kiosk21"] body[data-step="phone"] .keypad button,\n' +
    'html[data-layout="kiosk21"] body[data-step="phone"] .keypad button:active'
  );
  assert.match(keypad, /transform:\s*none\s*!important/);
  assert.match(keypad, /animation:\s*none\s*!important/);
  assert.match(keypad, /filter:\s*none\s*!important/);
  assert.match(keypad, /box-shadow:\s*none\s*!important/);
  assert.doesNotMatch(keypad, /scale\(|translate[XY]?\(/);
  assert.match(
    rule('html[data-layout="kiosk21"] body[data-step="phone"] .keypad button:active'),
    /opacity:\s*0\.85/
  );
});

test('kiosk button transitions stay short and ripple is disabled', () => {
  const buttons = compact(rule('html[data-layout="kiosk21"] button'));
  assert.match(buttons, /background-color80mslinear/);
  assert.match(buttons, /opacity80mslinear/);
  assert.doesNotMatch(buttons, /(?:2\d\d|[3-9]\d\d)ms/);
  assert.match(rule('html[data-layout="kiosk21"] .ripple'), /display:\s*none\s*!important/);
});

test('persistent selected states remain owned by the application stylesheet', () => {
  assert.doesNotMatch(kiosk, /\.card\.active\s*\{/);
  assert.doesNotMatch(kiosk, /\.optionBtn\.active\s*\{/);
  assert.doesNotMatch(kiosk, /\.selected\s*\{/);
});

test('reduced motion is scoped to the kiosk runtime', () => {
  assert.match(kiosk, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(kiosk, /html\[data-layout="kiosk21"\] \*::before/);
  assert.doesNotMatch(kiosk, /(?:^|\})\s*\*,\s*\*::before/m);
});
