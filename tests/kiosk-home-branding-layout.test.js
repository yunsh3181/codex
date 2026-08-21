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
  assert.match(html, /class="langTopBtn"[^>]*>🌐 <span>\$\{'LANGUAGE'\}<\/span><\/button>/);
  assert.doesNotMatch(html.match(/function shell\(c\)\{[\s\S]*?\n\}/)?.[0] || '', /currentLanguageLabel\(\)/);
});

test('home branding is a horizontal white lockup and happy hour keeps order now', () => {
  assert.match(home, /class="heroBrandLockup"[\s\S]*?class="heroLogoDark"[\s\S]*?class="heroBrandText"[\s\S]*?class="heroLocation"[\s\S]*?class="heroTagline"/);
  assert.match(home, /class="happyOrderNow"/);
  assert.match(html, /\.heroBrandLockup\{[\s\S]*?display:flex!important/);
  assert.match(html, /\.heroBrandLockup\{[\s\S]*?gap:6px!important/);
  assert.match(html, /\.heroBrandLockup \.heroLogoDark\{[\s\S]*?width:248\.4px!important[\s\S]*?height:149\.04px!important[\s\S]*?translateY\(-10px\)[\s\S]*?brightness\(0\) invert\(1\)/);
  assert.match(html, /\.heroBrandText \.heroLocation\{[\s\S]*?color:#f7cf2b!important[\s\S]*?font-size:20\.28px!important/);
  assert.match(html, /\.heroBrandLockup \.heroTagline\{[\s\S]*?font-size:19\.2px!important/);
  assert.match(html, /\.heroBrandLockup \.heroTagline\{[\s\S]*?white-space:nowrap!important[\s\S]*?text-transform:uppercase/);
  assert.match(html, /\.heroBrandText\{[\s\S]*?margin-left:-32px!important[\s\S]*?align-items:flex-start!important/);
  assert.match(html, /\.happyOrderNow,[\s\S]*?\.takeoutOrderNow\{[\s\S]*?color:var\(--home-pj-red\)!important/);
});

test('language logo, banners, footer and promo layout use kiosk-only refinements', () => {
  assert.match(html, /body\[data-step="language"\] \.languageScreen>\.heroLogoDark\{[\s\S]*?width:403px!important[\s\S]*?brightness\(0\) invert\(1\)/);
  assert.match(html, /body\[data-step="home"\] \.heroPromo\{[\s\S]*?height:364px!important[\s\S]*?min-height:270px!important/);
  assert.match(html, /body\[data-step="home"\] \.heroPromo>\*\{[\s\S]*?max-width:100%[\s\S]*?white-space:normal!important[\s\S]*?overflow-wrap:anywhere/);
  assert.match(html, /@media\(max-width:700px\)\{[\s\S]*?\.heroBrandText \.heroLocation\{[\s\S]*?font-size:14\.4px!important[\s\S]*?\.heroBrandLockup \.heroTagline\{[\s\S]*?font-size:10\.2px!important/);
  assert.match(html, /@media\(max-width:700px\)\{[\s\S]*?\.heroBrandLockup\{[\s\S]*?gap:2px!important[\s\S]*?\.heroBrandText\{[\s\S]*?margin-left:-8px!important/);
  assert.match(html, /@media\(max-width:700px\)\{[\s\S]*?\.heroBrandText\{[\s\S]*?max-width:calc\(100vw - 216px\)!important[\s\S]*?\.heroLocation\{[\s\S]*?white-space:normal!important[\s\S]*?overflow-wrap:anywhere[\s\S]*?\.heroTagline\{[\s\S]*?white-space:normal!important/);
  assert.match(html, /\.heroTop>\.heroLangBtn span\{[\s\S]*?font-size:9\.6px!important/);
  assert.match(html, /\.langTopBtn span\{[\s\S]*?font-size:12\.8px!important/);
  assert.match(html, /\.cartbar\{[\s\S]*?padding-left:0!important[\s\S]*?padding-right:0!important/);
  assert.match(html, /body\[data-step="promo"\] \.darkBenefitGrid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important/);
  assert.match(html, /body\[data-step="promo"\] \.darkBenefitCard\{[\s\S]*?grid-template-columns:60px minmax\(0,1fr\) minmax\(150px,220px\)!important[\s\S]*?min-height:150px!important/);
  assert.match(networkCss, /bottom:\s*max\(0px,env\(safe-area-inset-bottom\)\)/);
  assert.match(networkCss, /var\(--order-summary-height,\s*92px\)[\s\S]*?safe-area-inset-bottom/);
  assert.match(networkCss, /var\(--kiosk21-summary-height\)[\s\S]*?var\(--safe-bottom\)/);
});

test('tablet home fits its viewport while preserving two equal banners', () => {
  const tabletHome = html.match(/@media \(min-width:701px\) and \(max-width:1024px\) and \(orientation:portrait\)\{([\s\S]*?)\n\}\n\n@media\(max-width:700px\)/)?.[1] || '';
  assert.match(tabletHome, /body\[data-step="home"\] \.app\{[\s\S]*?padding-bottom:0!important/);
  assert.match(tabletHome, /\.darkHero\{[\s\S]*?min-height:100vh!important[\s\S]*?padding-bottom:calc\(96px \+ var\(--safe-bottom\)\)!important/);
  assert.match(tabletHome, /\.heroChoice,[\s\S]*?height:178px!important[\s\S]*?min-height:178px!important/);
  assert.match(tabletHome, /\.heroPromo\{[\s\S]*?height:236px!important[\s\S]*?min-height:236px!important/);
  assert.doesNotMatch(tabletHome, /overflow\s*:\s*hidden/);
});

test('mobile branding stays clear of the LANGUAGE button at supported widths', () => {
  const horizontalPadding = 12;
  const logoAndGapWidth = 88 + 2 - 8;
  const languageButtonWidth = 92;
  const headerGap = 18;

  for (const viewportWidth of [360, 390]) {
    const brandTextWidth = viewportWidth - 216;
    const brandRight = horizontalPadding + logoAndGapWidth + brandTextWidth;
    const languageButtonLeft = viewportWidth - horizontalPadding - languageButtonWidth;
    assert.ok(
      brandRight + headerGap <= languageButtonLeft,
      `${viewportWidth}px branding must not overlap the LANGUAGE button`,
    );
  }
});
