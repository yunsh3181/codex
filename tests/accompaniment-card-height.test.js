const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const kiosk = fs.readFileSync(path.join(root, 'styles', 'device-kiosk21.css'), 'utf8');

test('accompaniment cards are exactly 80% of their previous device heights', () => {
  assert.match(html, /body\[data-step="accompaniment"\] \.textQtyCard\{[\s\S]*?min-height:168px;/);
  assert.match(html, /@media\(max-width:560px\)\{[\s\S]*?body\[data-step="accompaniment"\] \.textQtyCard\{[\s\S]*?min-height:120px!important;/);
  assert.match(kiosk, /body\[data-step="accompaniment"\] \.textQtyCard \{[\s\S]*?min-height: 156px !important;/);
  assert.deepEqual(
    {mobile:120 / 150,tablet:168 / 210,kiosk21:156 / 195},
    {mobile:.8,tablet:.8,kiosk21:.8},
  );
});

test('card width, columns, content, and touch controls remain protected', () => {
  assert.match(html, /<div class="grid four accompanimentGrid">\$\{SAUCES\.map\(x=>textQtyCard\(x,'extraDrinks'\)\)/);
  assert.match(html, /body\[data-step="accompaniment"\] \.textQtyCard\{[\s\S]*?grid-template-columns:minmax\(0,1fr\) auto;/);
  assert.match(html, /body\[data-step="accompaniment"\] \.textQtyCard \.qty button\{[\s\S]*?min-width:44px;[\s\S]*?min-height:44px;/);
  assert.match(kiosk, /body\[data-step="accompaniment"\] \.textQtyCard \.qty button \{[\s\S]*?min-width: 84px;[\s\S]*?min-height: 84px !important;/);
  assert.match(html, /function textQtyCard\(x,key,buttonOnly=false\)[\s\S]*?<h3>\$\{name\}<\/h3><div class="price">\$\{money\(x\.price\)\}<\/div>[\s\S]*?<div class="qty">/);
});

test('the reduction is scoped away from side and drink cards', () => {
  assert.doesNotMatch(html, /body\[data-step="side"\] \.textQtyCard\{[\s\S]*?min-height:168px/);
  assert.doesNotMatch(html, /body\[data-step="drink"\] \.textQtyCard\{[\s\S]*?min-height:168px/);
});
