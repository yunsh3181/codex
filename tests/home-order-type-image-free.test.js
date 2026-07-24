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

test('cards expose selection and responsive overflow safeguards', () => {
  assert.match(home, /class="heroChoiceSelected"/);
  assert.match(html, /\.heroChoice:active \.heroChoiceSelected,[\s\S]*?opacity:1/);
  assert.match(html, /@media\(max-width:700px\)[\s\S]*?\.heroChoiceGrid\{[\s\S]*?grid-template-columns:1fr!important/);
  assert.match(html, /\.darkHero\{[\s\S]*?min-height:100vh!important/);
  assert.match(html, /\.heroChoiceGrid\{[\s\S]*?width:min\(92vw,980px\)!important/);
});
