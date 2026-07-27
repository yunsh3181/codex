const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const phoneCss = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8').replace(/\s+/g, ' ');
const toppingCss = fs.readFileSync(path.join(root, 'styles/kiosk-scroll-free.css'), 'utf8').replace(/\s+/g, ' ');

test('phone progress uses five accessible stages without changing kiosk stages', () => {
  const progressSource = html.match(/function progress\(\)\{[\s\S]*?function progressTarget/)?.[0] || '';
  assert.ok(progressSource.includes("dataset?.layout==='phone'"));
  assert.ok(progressSource.includes("...(phoneLayout?['cartReview','review','phone','payment']:[])"));
  assert.ok(progressSource.includes("...(!phoneLayout?[{id:'checkout'"));
  assert.match(phoneCss, /html\[data-layout="phone"\] \.progress \.progressStep [^{]*\{[^}]*flex: 1 1 20%/);
  assert.match(phoneCss, /min-height: 82px/);
  assert.match(phoneCss, /\.progressStep\.current::before [^{]*\{[^}]*background: #c8102e/);
  assert.match(phoneCss, /\.progressStep\.completed::before [^{]*\{[^}]*background: #006b3c/);
});

test('topping cards preserve readable hierarchy, selection contrast, and touch targets', () => {
  assert.match(toppingCss, /body\[data-step="topping"\] \.toppingTextGrid [^{]*\{[^}]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(toppingCss, /\.toppingTextCard h3 [^{]*\{[^}]*font-size: clamp\(18px, 1\.75vw, 22px\)/);
  assert.match(toppingCss, /\.toppingTextCard\.active [^{]*\{[^}]*background: #c8102e !important/);
  assert.match(toppingCss, /\.toppingTextCard\.active h3,[^{]*\.toppingTextCard\.active \.qty b [^{]*\{[^}]*color: #fff !important/);
  assert.match(toppingCss, /@media \(max-width: 700px\)[\s\S]*\.toppingTextGrid [^{]*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(toppingCss, /\.toppingTextCard \.qty button [^{]*\{[^}]*min-width: 44px !important;[^}]*min-height: 44px !important/);
});
