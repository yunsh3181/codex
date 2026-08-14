const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/device-ipad-air3-portrait.css'), 'utf8');

test('iPad Air 3 portrait overrides survive Safari visual viewport changes', () => {
  assert.match(css, /min-width:820px/);
  assert.match(css, /max-width:850px/);
  assert.doesNotMatch(css, /min-height:1111px|max-height:1113px/);
  assert.match(css, /orientation:portrait/);
  assert.doesNotMatch(css, /transform\s*:\s*scale\(/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /100svh/);
  assert.match(css, /body \.app\{[^}]*display:flex!important[^}]*height:100dvh!important[^}]*min-height:0!important[^}]*overflow:hidden!important/);
  assert.match(css, /body \.stage\{[^}]*min-height:0!important[^}]*overflow-x:hidden!important[^}]*overflow-y:auto!important[^}]*-webkit-overflow-scrolling:touch[^}]*touch-action:pan-y/);
  assert.match(css, /left:max\(24px,env\(safe-area-inset-left\)\)/);
  assert.match(css, /right:max\(24px,env\(safe-area-inset-right\)\)/);
  assert.doesNotMatch(css, /left:50%/);
});

test('iPad order flow uses shared actions and safe review reset', () => {
  assert.match(html, /device-ipad-air3-portrait\.css\?v=ipad-air3-review-list-v4/);
  assert.match(html, /matchMedia\('\(min-width:820px\) and \(max-width:850px\) and \(orientation:portrait\)'\)/);
  assert.match(html, /if\(ipadPortrait\)reviewPages=\[cards\.map/);
  assert.match(html, /reviewOrderFinancials/);
  assert.match(html, /reviewBackBtn[\s\S]*reviewHomeBtn[\s\S]*reviewDockConfirm/);
  assert.match(html, /onclick="requestReviewReset\(\)"/);
  assert.match(html, /state\.modal='reviewResetConfirm'/);
  assert.match(html, /await releaseSeats\(heldSeats\)/);
  assert.match(html, /reset\('idle',\{skipRelease:true\}\)/);
});
