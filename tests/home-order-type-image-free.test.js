const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const home = html.match(/if\(state\.step==='home'\)return `([\s\S]*?)`;\n if\(state\.step==='type'\)/)?.[1] || '';

test('dine-in and takeout cards are text-only and have no image containers', () => {
  for (const type of ['dinein', 'takeout']) {
    const card = home.match(new RegExp(`<button class="heroChoice[^"]*" data-order-type="${type}"[\\s\\S]*?<\\/button>`))?.[0] || '';
    assert.ok(card, `${type} card exists`);
    assert.doesNotMatch(card, /<img\b/i);
    assert.doesNotMatch(card, /hero(?:Pizza|Box)Visual|heroChoiceFeatures|heroFeatureIcon|heroDivider/);
  }
  assert.doesNotMatch(home, /home_(?:dine|takeout)_[^'")]+\.(?:png|jpe?g|webp)/i);
});

test('order type values and click handlers are unchanged', () => {
  assert.match(home, /data-order-type="dinein" onclick="startDineIn\(\)"/);
  assert.match(home, /data-order-type="takeout" onclick="startTakeout\(\)"/);
  assert.match(html, /function startDineIn\(\)[\s\S]*?state\.orderType='dinein'/);
  assert.match(html, /function startTakeout\(\)[\s\S]*?state\.orderType='takeout'/);
  assert.match(html, /orderType:state\.orderType\|\|'unknown'/);
});

test('takeout timing click handlers retain their existing routes', () => {
  assert.match(html, /onclick="chooseTakeoutTiming\('now'\)"/);
  assert.match(html, /onclick="chooseTakeoutTiming\('reserve'\)"/);
  const source = html.match(/function chooseTakeoutTiming\(mode\)\{[\s\S]*?\n\}/)?.[0] || '';
  assert.match(source, /state\.orderTiming=mode;/);
  for (const [mode, expectedStep] of [['now', 'promo'], ['reserve', 'reserve']]) {
    const state = {};
    let rendered = false;
    Function('state', 'render', `${source};chooseTakeoutTiming('${mode}')`)(
      state,
      () => { rendered = true; }
    );
    assert.equal(state.orderTiming, mode);
    assert.equal(state.step, expectedStep);
    assert.equal(rendered, true);
  }
});

test('cards expose selection and responsive overflow safeguards', () => {
  assert.match(home, /class="heroChoiceSelected"/);
  assert.match(html, /\.heroChoice:active \.heroChoiceSelected,[\s\S]*?opacity:1/);
  assert.match(html, /@media\(max-width:700px\)[\s\S]*?\.heroChoiceGrid\{[\s\S]*?grid-template-columns:1fr!important/);
  assert.match(html, /\.darkHero\{[\s\S]*?min-height:100vh!important/);
  assert.match(html, /\.heroChoiceGrid\{[\s\S]*?width:min\(92vw,980px\)!important/);
});

test('home cards and promotion banners use the rebalanced kiosk dimensions', () => {
  assert.match(html, /\.heroChoice\.takeout\{[\s\S]*?min-height:clamp\(250px,19vh,368px\)!important/);
  assert.match(html, /\.heroChoice \.eyebrow\{[\s\S]*?font-size:clamp\(26px,3vw,38px\)!important[\s\S]*?color:#111111!important/);
  assert.match(html, /\.heroChoice h2\{[\s\S]*?font-size:clamp\(69px,9vw,114px\)!important/);
  assert.match(html, /\.heroChoiceDescription\{[\s\S]*?font-size:clamp\(30px,3\.6vw,47px\)!important/);
  assert.match(html, /\.heroChoiceSelected\{[\s\S]*?font-size:clamp\(26px,3vw,36px\)!important/);
  assert.match(html, /\.heroPromo\{[\s\S]*?min-height:230px!important[\s\S]*?background:#f57c00!important/);
  assert.match(html, /\.heroPromo h3\{[\s\S]*?color:#fff!important/);
  assert.match(html, /\.heroTagline\{[\s\S]*?font-size:clamp\(26\.4px,3vw,40\.8px\)!important/);
});
