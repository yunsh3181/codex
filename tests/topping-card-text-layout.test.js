const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles', 'kiosk-scroll-free.css'), 'utf8');

test('topping cards render dedicated text elements without changing quantity handlers', () => {
  const toppingView = html.match(/if\(state\.step==='topping'\)[\s\S]*?if\(state\.step==='side'\)/)?.[0] || '';

  assert.match(toppingView, /class="card v4ToppingCard toppingTextCard/);
  assert.match(toppingView, /<h3>\$\{toppingName\(item\)\}<\/h3><div class="price">\+\$\{money\(item\.price\[state\.size\]\)\}<\/div>/);
  assert.match(toppingView, /<span class="badge">\$\{t\('ui\.common\.selectedCount',\{count:q\}\)\}<\/span>/);
  assert.match(toppingView, /<div class="qty"><button[\s\S]*?toppingQty\('\$\{item\.id\}',-1\)[\s\S]*?<b>\$\{q\}<\/b><button[\s\S]*?toppingQty\('\$\{item\.id\}',1\)/);
  assert.match(html, /function toppingQty\(id,d\)\{[\s\S]*?q>=2[\s\S]*?total>=5/);
});

test('topping-only typography is exactly 110 percent of the previous sizes', () => {
  assert.match(css, /body\[data-step="topping"\] \.toppingTextNotice \{[\s\S]*?font-size: 17\.6px !important;/);
  assert.match(css, /\.toppingTextCard h3 \{[\s\S]*?font-size: clamp\(19\.8px, 1\.925vw, 24\.2px\) !important;/);
  assert.match(css, /\.toppingTextCard \.price \{[\s\S]*?font-size: clamp\(15\.4px, 1\.595vw, 19\.8px\) !important;/);
  assert.match(css, /\.toppingTextCard \.qty b \{[\s\S]*?font-size: 15\.4px !important;/);
  assert.match(css, /\.toppingTextCard \.badge \{[\s\S]*?font-size: 11px;/);

  const mobile = css.match(/@media \(max-width: 700px\) \{[\s\S]*$/)?.[0] || '';
  assert.match(mobile, /\.toppingTextNotice \{[\s\S]*?font-size: 11px !important;/);
  assert.match(mobile, /\.toppingTextCard h3 \{[\s\S]*?font-size: 17\.6px !important;/);
  assert.match(mobile, /\.toppingTextCard \.price \{[\s\S]*?font-size: 13\.2px !important;/);
  assert.match(mobile, /\.toppingTextCard \.qty b \{[\s\S]*?font-size: 14\.3px !important;/);
  assert.match(mobile, /\.toppingTextCard \.badge \{[\s\S]*?font-size: 7\.7px;/);
});

test('topping rows align without changing card columns or touch targets', () => {
  assert.match(css, /\.toppingTextCard,[\s\S]*?grid-template-rows: 2\.24em 1\.1em 48px;/);
  assert.match(css, /\.toppingTextCard h3 \{[\s\S]*?height: 2\.24em;[\s\S]*?overflow-wrap: anywhere;[\s\S]*?-webkit-line-clamp: unset !important;/);
  assert.match(css, /\.toppingTextCard \.price \{[\s\S]*?display: grid;[\s\S]*?place-items: center;/);
  assert.match(css, /\.toppingTextCard \.qty button \{[\s\S]*?width: 48px !important;[\s\S]*?height: 48px !important;/);

  const mobile = css.match(/@media \(max-width: 700px\) \{[\s\S]*$/)?.[0] || '';
  assert.match(mobile, /\.toppingTextCard,[\s\S]*?grid-template-rows: 2\.2em 1\.1em 44px;/);
  assert.match(mobile, /\.toppingTextCard \.qty button \{[\s\S]*?width: 44px !important;[\s\S]*?height: 44px !important;/);

  assert.match(css, /\.toppingTextGrid \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important;/);
  assert.match(mobile, /\.toppingTextGrid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;/);
  assert.doesNotMatch(css, /body\[data-step="(?:pizza|side|drink|accompaniment)"\][^{]*\{[^}]*font-size: (?:17\.6|13\.2|14\.3|7\.7)px/);
});
