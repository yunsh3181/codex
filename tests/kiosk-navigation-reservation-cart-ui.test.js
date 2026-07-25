const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/device-kiosk21.css'),'utf8');
const compact=css.replace(/\s+/g,'');

test('progress exposes completed/current buttons and locks future groups',()=>{
  assert.match(html,/class="progressStep \$\{status\}/);
  assert.match(html,/navigateProgress\('\$\{g\.id\}'\)/);
  assert.match(html,/disabled aria-disabled="true"/);
  assert.match(html,/if\(order\.indexOf\(group\)>order\.indexOf\(current\)\)return/);
  assert.doesNotMatch(html,/function navigateProgress[\s\S]{0,900}reset\(/);
  assert.ok(compact.includes('.progressStep{display:inline-flex'));
  assert.ok(compact.includes('min-height:56px'));
  assert.ok(compact.includes('font-size:20px'));
});

test('kiosk header and progress backgrounds are full width',()=>{
  assert.match(css,/html\[data-layout="kiosk21"\] :where\(\.head, \.c-header\)[\s\S]*?max-width: none !important/);
  assert.match(css,/html\[data-layout="kiosk21"\] :where\(\.progress, \.c-progress\)[\s\S]*?max-width: none !important/);
});

test('home uses exact 1.15 card multiplier and rectangular promos',()=>{
  assert.ok(compact.includes('min-height:clamp(253px,18.975vh,365.7px)!important'));
  assert.ok(compact.includes('height:clamp(253px,18.975vh,365.7px)!important'));
  assert.ok(compact.includes('aspect-ratio:16/9!important'));
  assert.doesNotMatch(css,/html\[data-layout="kiosk21"\][^{]*\.heroPromo[^{]*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
});

test('topping continuation remains the single fixed selection footer',()=>{
  const topping=html.match(/if\(state\.step==='topping'\)[\s\S]*?if\(state\.step==='side'\)/)?.[0]||'';
  assert.match(topping,/selectionFooter\('finishTopping\(\)'/);
  assert.equal((topping.match(/finishTopping\(\)/g)||[]).length,1);
  assert.match(css,/body:is\([\s\S]*?\[data-step="topping"\][\s\S]*?:where\(\.cartbar/);
});

test('reservation controls and selected value are kiosk-sized',()=>{
  assert.match(html,/class="reserveCards"/);
  assert.match(html,/class="reserveSelection"/);
  assert.ok(compact.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(compact.includes('.reserveCard>b{display:block'));
  assert.ok(compact.includes('font-size:30px'));
  assert.ok(compact.includes('.reserveSelectionb{color:#d71920;font-size:48px'));
});

test('cart renders categorized existing-price rows with plus formatter',()=>{
  assert.match(html,/function cartMoney\(amount,added=false\)/);
  assert.match(html,/cartDetailRows\(x\.toppings,TOPPINGS,x\.size,t\('review\.additionalToppings'\)\+' '\)/);
  for(const category of ['ui.progress.pizza','ui.progress.side','ui.progress.drink','ui.drinkScreen.accompanimentTitle'])assert.ok(html.includes(category));
  assert.match(html,/CRUSTS\.find\(c=>c\.name===/);
  assert.match(html,/SETTINGS\.HALF_EXTRA/);
  assert.doesNotMatch(html,/if\s*\(name\s*===\s*["']치즈롤["']\)/);
});
