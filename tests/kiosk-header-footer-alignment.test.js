const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kiosk = fs.readFileSync(path.join(root, 'styles/device-kiosk21.css'), 'utf8');

test('kiosk header uses measured logo and language control dimensions', () => {
  assert.match(kiosk, /\.brandLogo\s*\{[\s\S]*?width:\s*141\.6px\s*!important[\s\S]*?height:\s*69\.6px\s*!important[\s\S]*?brightness\(0\) invert\(1\)/);
  assert.match(kiosk, /\.langTopBtn\s*\{[\s\S]*?min-height:\s*70\.4px\s*!important[\s\S]*?padding:\s*9\.9px 15\.4px\s*!important[\s\S]*?font-size:\s*17\.6px/);
  assert.match(kiosk, /\.langTopBtn span\s*\{[\s\S]*?font-size:\s*14\.08px\s*!important/);
  assert.match(html, /class="langTopBtn"[^>]*>🌐 <span>\$\{'LANGUAGE'\}<\/span><\/button>/);
});

test('kiosk footer offsets text and the complete navigation group', () => {
  assert.match(html, /<button class="prev" onclick="reset\(\);render\(\)">/);
  assert.match(html, /onclick="prevStep\(\)"[\s\S]*?onclick="nextStep\(\)"/);
  assert.match(kiosk, /:where\(\.cartmain, \.cartSummary, \.orderSummary\)\s*\{[\s\S]*?margin-left:\s*5px/);
  assert.match(kiosk, /body \.cartbar\s*\{\s*padding:\s*12px 10px calc\(12px \+ var\(--safe-bottom\)\) 0\s*!important/);
});
