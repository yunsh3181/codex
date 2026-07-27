const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/kiosk-scroll-free.css'), 'utf8');
const compact = css.replace(/\s+/g, ' ');

test('scroll-free stylesheet is loaded after device-specific styles', () => {
  const kiosk = html.indexOf('styles/device-kiosk21.css?v=kiosk-scroll-indicator-v1.2.11');
  const scrollFree = html.indexOf('styles/kiosk-scroll-free.css?v=kiosk-scroll-free-v1');
  assert.ok(kiosk >= 0);
  assert.ok(scrollFree > kiosk);
});

test('pizza menu uses isolated 4-column cards without changing selection logic', () => {
  assert.match(html, /class="grid pizzaMenuGrid"/);
  assert.match(html, /class="card pizzaMenuCard"[\s\S]*?onclick="pickPizza\('\$\{p\.id\}'\)"/);
  assert.match(compact, /body\[data-step="pizza"\] \.pizzaMenuGrid [^{]*\{[^}]*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important/);
  assert.match(compact, /body\[data-step="pizza"\] \.pizzaMenuCard \.imagePic img [^{]*\{[^}]*object-fit: cover !important/);
});

test('topping screen is text-only and keeps ID-based quantity handlers', () => {
  const toppingView = html.match(/if\(state\.step==='topping'\)[\s\S]*?if\(state\.step==='side'\)/)?.[0] || '';
  assert.ok(toppingView.includes('toppingTextGrid'));
  assert.ok(toppingView.includes('toppingTextCard'));
  assert.ok(toppingView.includes('toppingCheck'));
  assert.ok(toppingView.includes("toppingQty('${item.id}',1)"));
  assert.ok(toppingView.includes("toppingQty('${item.id}',-1)"));
  assert.doesNotMatch(toppingView, /toppingVisual\(item\.name\)/);
  assert.match(compact, /body\[data-step="topping"\] \.toppingTextCard\.active [^{]*\{[^}]*border-color: #d71920 !important/);
});

test('new CSS does not redefine shared card, grid, or menu-item selectors', () => {
  const selectors = css
    .split('{')
    .slice(0, -1)
    .map(chunk => chunk.slice(chunk.lastIndexOf('}') + 1).trim())
    .filter(selector => selector && !selector.startsWith('/*') && !selector.startsWith('@media'));

  for (const selector of selectors) {
    assert.match(
      selector,
      /body\[data-step="(?:pizza|topping)"\]/,
      `unscoped selector: ${selector}`
    );
  }
  assert.doesNotMatch(css, /(^|[},]\s*)\.(?:card|grid|menu-item)\s*\{/m);
});
