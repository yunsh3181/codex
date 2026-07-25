const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const networkCss = fs.readFileSync(path.join(root, 'styles/network-status.css'), 'utf8');
const home = html.match(/if\(state\.step==='home'\)return `([\s\S]*?)`;\n if\(state\.step==='type'\)/)?.[1] || '';

test('home and common headers always display LANGUAGE without the selected name', () => {
  assert.match(home, /<span>\$\{'LANGUAGE'\}<\/span>/);
  assert.match(html, /class="langTopBtn"[^>]*>🌐 \$\{'LANGUAGE'\}<\/button>/);
  assert.doesNotMatch(html.match(/function shell\(c\)\{[\s\S]*?\n\}/)?.[0] || '', /currentLanguageLabel\(\)/);
});

test('home branding is a horizontal white lockup and happy hour keeps order now', () => {
  assert.match(home, /class="heroBrandLockup"[\s\S]*?class="heroLogoDark"[\s\S]*?class="heroTagline"/);
  assert.match(home, /class="happyOrderNow"/);
  assert.match(html, /\.heroBrandLockup\{[\s\S]*?display:flex!important/);
  assert.match(html, /\.heroBrandLockup \.heroLogoDark\{[\s\S]*?translateY\(-10px\)[\s\S]*?brightness\(0\) invert\(1\)/);
  assert.match(html, /\.happyOrderNow,[\s\S]*?\.takeoutOrderNow\{[\s\S]*?color:var\(--home-pj-red\)!important/);
});

test('language logo, banners, footer and promo layout use kiosk-only refinements', () => {
  assert.match(html, /body\[data-step="language"\] \.languageScreen>\.heroLogoDark\{[\s\S]*?width:403px!important[\s\S]*?brightness\(0\) invert\(1\)/);
  assert.match(html, /body\[data-step="home"\] \.heroPromo\{[\s\S]*?min-height:270px!important/);
  assert.match(html, /\.cartbar\{[\s\S]*?padding-left:0!important[\s\S]*?padding-right:0!important/);
  assert.match(html, /body\[data-step="promo"\] \.darkBenefitCard\{[\s\S]*?min-height:190px!important/);
  assert.match(networkCss, /bottom:\s*max\(0px,env\(safe-area-inset-bottom\)\)/);
});
