const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const phone = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const tablet = fs.readFileSync(path.join(root, 'styles/device-tablet.css'), 'utf8');
const kiosk = fs.readFileSync(path.join(root, 'styles/device-kiosk21.css'), 'utf8');

test('pizza option headings, selected badges, and guidance typography are scoped', () => {
  assert.match(html, /\.optionSection>h2\{color:#111!important\}/);
  assert.match(phone, /body\[data-step="pizzaOptions"\] \.optionSection > h2 \{[\s\S]*?color: #111111 !important/);
  assert.match(html, /\.optionReason\{[^}]*font-size:12\.1px/);
  assert.match(html, /@media\(max-width:560px\)[\s\S]*?\.optionReason\{font-size:9\.9px\}/);
  assert.match(html, /\.optionPrice\{[^}]*font-size:11px/);
  assert.match(html, /class="optionSelectedBadge">✓ \$\{t\('ui\.common\.selected'\)\}/);
});

test('only valid active pizza options render a selected badge', () => {
  assert.match(html, /const reason=doughUnavailableReason\(v,state\.size\),selected=state\.dough===v&&!reason/);
  assert.match(html, /const reason=crustUnavailableReason\(v,state\.size,state\.dough\),selected=state\.crust===v&&!reason/);
  assert.match(html, /aria-pressed="\$\{selected\}"/);
  assert.doesNotMatch(html, /disabled[^>]*optionSelectedBadge/);
});

test('order review compression is height-driven and capped at two stages', () => {
  const source = html.slice(html.indexOf('function reviewContentOverflows'), html.indexOf('const kioskScrollContainer'));
  assert.match(source, /root\.scrollHeight>innerHeight/);
  assert.match(source, /stageBottom>availableBottom\+1/);
  assert.match(source, /reviewCompact1/);
  assert.match(source, /reviewCompact2/);
  assert.match(source, /body\.dataset\.reviewCompression='0'/);
  assert.match(source, /window\.addEventListener\('resize',scheduleOrderReviewFit\)/);
});

test('base review styles stay unchanged and compact stages remain device scoped', () => {
  for (const [layout, css] of [['phone', phone], ['tablet', tablet], ['kiosk21', kiosk]]) {
    assert.ok(css.includes(`html[data-layout="${layout}"] body[data-step="review"].reviewCompact1`));
    assert.ok(css.includes(`html[data-layout="${layout}"] body[data-step="review"].reviewCompact2`));
    const compact = css.slice(css.indexOf(`html[data-layout="${layout}"] body[data-step="review"].reviewCompact1`));
    assert.doesNotMatch(compact, /transform\s*:\s*scale|zoom\s*:/);
  }
  assert.match(phone, /\.reviewCompact2 :where\([\s\S]*?\)\s*\{[\s\S]*?font-size: 12px/);
  assert.match(phone, /\.cartOrderActions button \{[\s\S]*?min-width: 44px;[\s\S]*?min-height: 44px/);
});
