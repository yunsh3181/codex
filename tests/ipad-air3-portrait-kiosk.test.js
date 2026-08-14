const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/device-ipad-air3-portrait.css'), 'utf8');

test('iPad Air 3 portrait overrides are exact and scale-free', () => {
  assert.match(css, /min-width:833px/);
  assert.match(css, /max-width:835px/);
  assert.match(css, /min-height:1111px/);
  assert.match(css, /max-height:1113px/);
  assert.match(css, /orientation:portrait/);
  assert.doesNotMatch(css, /transform\s*:\s*scale\(/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
});

test('iPad order flow uses shared actions and safe review reset', () => {
  assert.match(html, /device-ipad-air3-portrait\.css\?v=ipad-air3-portrait-v1/);
  assert.match(html, /reviewBackBtn[\s\S]*reviewHomeBtn[\s\S]*reviewDockConfirm/);
  assert.match(html, /onclick="requestReviewReset\(\)"/);
  assert.match(html, /state\.modal='reviewResetConfirm'/);
  assert.match(html, /await releaseSeats\(heldSeats\)/);
  assert.match(html, /reset\('idle',\{skipRelease:true\}\)/);
});
