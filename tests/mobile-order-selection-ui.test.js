const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const phone=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');

test('phone home renders exactly two order-type cards without duplicate benefit cards',()=>{
  const grid=html.match(/<div class="mobileOrderTypeGrid">([\s\S]*?)<\/div>\s*<div class="heroPromoStrip">/)?.[1]||'';
  assert.equal((grid.match(/class="mobileOrderTypeCard/g)||[]).length,2);
  for(const handler of ['startDineIn()','startTakeout()'])assert.ok(grid.includes(`onclick="${handler}"`),handler);
  for(const handler of ['startHappyHourBanner()','startTakeoutDiscountBanner()'])assert.ok(!grid.includes(`onclick="${handler}"`),handler);
  assert.match(phone,/body\[data-step="home"\] \.mobileOrderTypeGrid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(phone,/\.mobileOrderTypeCard \{[\s\S]*?min-height: 104px;[\s\S]*?touch-action: manipulation/);
  assert.match(phone,/\.mobileOrderTypeCard\.dinein \{[\s\S]*?background: #087348 !important/);
  assert.match(phone,/\.mobileOrderTypeCard\.takeout \{[\s\S]*?background: #c8102e !important/);
  assert.match(phone,/\.mobileOrderTypeCard :where\(\.mobileOrderTypeIcon, strong, span\) \{[\s\S]*?color: #ffffff !important/);
  assert.match(phone,/\.heroTop > \.heroLangBtn \{[\s\S]*?background: #ffffff !important;[\s\S]*?color: #111111 !important/);
  assert.match(phone,/\.heroTop > \.heroLangBtn span \{[\s\S]*?color: #111111 !important/);
  assert.doesNotMatch(phone,/\.mobileOrderTypeCard[^{]*\{[^}]*(?:display:\s*none|text-overflow:\s*ellipsis)/);
});

test('pizza option headings reuse the existing dark green on phone',()=>{
  assert.match(phone,/body\[data-step="pizzaOptions"\] \.optionSection > h2 \{[\s\S]*?color: #111111 !important/);
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

test('all pizza paths share a readable three-column phone grid without clipping',()=>{
  assert.match(phone,/body\[data-step="pizza"\] \.grid\.pizzaMenuGrid\.pizzaMenuGrid\.pizzaMenuGrid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\) !important;[\s\S]*?gap: 8px 7px !important/);
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuCard \{[\s\S]*?min-width: 0;[\s\S]*?min-height: 158px !important;[\s\S]*?overflow: hidden/);
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuCard \.imagePic \{[\s\S]*?aspect-ratio: 1\.12 \/ 1/);
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuCard h3 \{[\s\S]*?font-size: 12px !important;[\s\S]*?-webkit-line-clamp: 2/);
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuCard\.pizzaMenuCard :where\(\.price, \.discount, \.muted\) \{[\s\S]*?font-size: 10px !important/);
  assert.match(phone,/body\[data-step="pizza"\] \.pizzaMenuCard \.imagePic img \{[\s\S]*?object-fit: contain !important/);
  assert.match(html,/class="card pizzaMenuCard" aria-pressed="\$\{selected\}"/);
  assert.match(html,/function pickPizza\(id\)\{if\(state\.mode==='single'\)/);
});
