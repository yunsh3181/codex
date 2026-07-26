const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const kiosk = fs.readFileSync(path.join(root, 'styles', 'device-kiosk21.css'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'styles', 'device-phone.css'), 'utf8');
const tablet = fs.readFileSync(path.join(root, 'styles', 'device-tablet.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const compact = value => value.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '');
const css = compact(kiosk);

test('kiosk root is the single native vertical touch scroller', () => {
  assert.match(css, /html\[data-layout="kiosk21"\]\{[^}]*overflow-x:hidden;[^}]*overflow-y:auto;/);
  assert.match(css, /html\[data-layout="kiosk21"\]\{[^}]*overscroll-behavior-x:none;/);
  assert.match(css, /html\[data-layout="kiosk21"\]\{[^}]*touch-action:pan-y;/);
  assert.match(css, /html\[data-layout="kiosk21"\]\{[^}]*scrollbar-width:none;/);
  assert.match(kiosk, /html\[data-layout="kiosk21"\]::\-webkit-scrollbar\s*\{[\s\S]*?display: none/);
  assert.match(css, /html\[data-layout="kiosk21"\]body\{[^}]*overflow-y:visible;/);
  assert.match(css, /html\[data-layout="kiosk21"\]:where\(#main,\.app\)\{[^}]*overflow-x:clip;[^}]*overflow-y:visible;/);
});

test('touch scrolling remains kiosk-only and leaves other device layers alone', () => {
  assert.doesNotMatch(phone, /html\[data-layout="kiosk21"\]/);
  assert.doesNotMatch(tablet, /html\[data-layout="kiosk21"\]/);
  assert.doesNotMatch(kiosk, /html\[data-layout="(?:phone|tablet|default)"\]/);
  assert.doesNotMatch(kiosk, /(?:^|,)\s*(?:html|body)\s*(?:,|\{)/m);
});

test('fixed header, progress, and footer reserves remain unchanged', () => {
  assert.match(css, /--kiosk21-stage-top-offset:calc\(var\(--kiosk21-header-height\)\+var\(--kiosk21-progress-height\)\+var\(--safe-top\)\)/);
  assert.match(css, /--kiosk21-bottom-stack-height:calc\(var\(--kiosk21-cta-height\)\+var\(--kiosk21-active-summary-height\)\+var\(--kiosk21-bottom-gap\)\+var\(--safe-bottom\)\)/);
  assert.match(css, /:where\(\.selectionFooterSpacer,\.c-selection-footer-spacer,\.footerSpacer\)\{[^}]*height:var\(--kiosk21-bottom-stack-height\)/);
  assert.match(css, /:where\(\.head,\.c-header\)\{[^}]*position:fixed;[^}]*inset:00auto;/);
  assert.match(css, /:where\(\.progress,\.c-progress\)\{[^}]*position:fixed;/);
  assert.match(css, /body:not\(\[data-step="home"\]\):not\(\[data-step="language"\]\):not\(\[data-step="done"\]\)\.stage\{[^}]*margin-top:var\(--kiosk21-stage-top-offset\)/);
  assert.match(html, /\.cartbar\{[^}]*position:fixed/);
});

test('native gesture handling keeps tap controls and avoids a manual drag engine', () => {
  assert.match(css, /:where\(\.card,[\s\S]*?touch-action:manipulation;/);
  assert.match(css, /:where\(\.qty,[\s\S]*?touch-action:manipulation;/);
  assert.doesNotMatch(html, /(?:touchmove|pointermove)[\s\S]{0,160}scrollTop/);
  assert.doesNotMatch(html, /scrollTop[\s\S]{0,160}(?:touchmove|pointermove)/);
});

test('modal owns touch and wheel scrolling while the kiosk root is locked', () => {
  assert.match(css, /:has\(#modal:where\(\.backdrop,\.c-popup-backdrop\)\)\{overflow-y:hidden;/);
  assert.match(css, /:where\(\.backdrop,\.c-popup-backdrop\)\{[^}]*overscroll-behavior:none;[^}]*touch-action:none;/);
  assert.match(css, /:where\(\.c-popup,[\s\S]*?overflow-y:auto;[^}]*overscroll-behavior:contain;[^}]*touch-action:pan-y;/);
});

test('reservation wheel contains its own vertical gesture', () => {
  assert.match(css, /body\[data-step="reserve"\]\.reserveWheel\{[^}]*overflow-y:auto;[^}]*overscroll-behavior:contain;[^}]*touch-action:pan-y;/);
});
