const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const phone=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');

test('phone order selection exposes four complete cards in a two-column grid',()=>{
  assert.match(html,/class="mobileOrderTypeGrid"/);
  for(const handler of ['startDineIn()','startTakeout()','startHappyHourBanner()','startTakeoutDiscountBanner()']){
    assert.ok(html.includes(`onclick="${handler}"`),handler);
  }
  assert.match(phone,/body\[data-step="home"\] \.mobileOrderTypeGrid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phone,/\.mobileOrderTypeCard \{[\s\S]*?min-height: 104px;[\s\S]*?touch-action: manipulation/);
  assert.doesNotMatch(phone,/\.mobileOrderTypeCard[^{]*\{[^}]*(?:display:\s*none|text-overflow:\s*ellipsis)/);
});

test('pizza option headings reuse the existing dark green on phone',()=>{
  assert.match(phone,/body\[data-step="pizzaOptions"\] \.optionSection > h2 \{[\s\S]*?color: var\(--v10-green\) !important/);
  assert.doesNotMatch(phone,/body\[data-step="pizzaOptions"\] \.optionSection > h2 \{[^}]*color:\s*#fff/);
});

test('half selection indicator always renders two independently updating slots',()=>{
  assert.match(html,/const halfIndicator=state\.mode==='half'\?/);
  assert.match(html,/class="halfSelectionSlot \$\{state\.left\?'selected':''\}"/);
  assert.match(html,/class="halfSelectionPlus" aria-hidden="true">\+<\/span>/);
  assert.match(html,/class="halfSelectionSlot \$\{state\.right\?'selected':''\}"/);
  assert.match(html,/state\.right\?\`\$\{itemPic\(po\(state\.right\)\)\}<b>\$\{pizzaName\(po\(state\.right\)\)\}<\/b>\`/);
  assert.match(phone,/\.halfSelectionSlot \.pic img \{[\s\S]*?object-fit: contain !important/);
});

test('single and half pizza menus share a four-column phone grid without clipping',()=>{
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuGrid \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\) !important/);
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuCard \{[\s\S]*?min-width: 0/);
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuCard \.imagePic img \{[\s\S]*?object-fit: contain !important/);
  assert.match(html,/class="card pizzaMenuCard" aria-pressed="\$\{selected\}"/);
  assert.match(html,/function pickPizza\(id\)\{if\(state\.mode==='single'\)/);
});
