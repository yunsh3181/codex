const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const responsiveCss = fs.readFileSync(path.join(root, 'styles/set-choice-responsive.css'), 'utf8');
const setChoice = html.slice(
  html.indexOf("if(state.step==='setChoice')"),
  html.indexOf("if(state.step==='pizzaOptions')")
);

for (const [people, key] of [['2', 'two'], ['3', 'three'], ['4', 'four']]) {
  assert(html.includes(`n:${people},`), `${people}-person set data is missing`);
  assert(setChoice.includes(`benefit.setChoice.card.${'${s.key}'}.desc`), `${key} set keeps translated composition text`);
}

for (const image of [
  'set-2-person-v2.png',
  'set-3-person-v2.png',
  'set-4-person-v2.png',
  'menu_image_017.png',
  'menu_image_005.jpg',
  'menu_image_007.png',
  'menu_image_001.png',
  'menu_image_029.png'
]) {
  assert(!setChoice.includes(image), `set cards must not reference ${image}`);
}

assert(!setChoice.includes('<img'), 'set cards must be text-only');
assert(!html.includes('<link rel="stylesheet" href="styles/set-menu-card-images.css">'));
assert.match(html, /darkSetIdentity/);
assert.match(html, /darkSetDetails/);
assert.match(html, /darkSetActionRow/);
assert.match(html, /darkSetPrice[\s\S]*darkSetSelect/);
assert.match(html, /darkSetSelect" aria-hidden="true"/);
assert.match(html, /styles\/set-choice-responsive\.css/);
assert.match(responsiveCss, /grid-template-columns:minmax\(0,34%\) minmax\(0,66%\)!important/);
assert.match(responsiveCss, /min-width:768px[\s\S]*max-width:850px[\s\S]*orientation:portrait/);
assert.match(responsiveCss, /html\[data-layout="tablet"\][^}]*\.darkSetPage\{[^}]*min-height:100%[^}]*grid-template-rows:auto auto minmax\(474px,1fr\) auto/);
assert.match(responsiveCss, /html\[data-layout="tablet"\][^}]*\.stage\{[^}]*padding-bottom:108px!important/);
assert.match(responsiveCss, /\.darkSetGrid\{[^}]*grid-template-rows:repeat\(3,150px\)!important[^}]*gap:clamp\(12px,2vh,24px\)!important/);
assert.match(responsiveCss, /html\[data-layout="kiosk21"\][\s\S]*height:224px!important/);
assert.match(responsiveCss, /html\[data-layout="phone"\][\s\S]*min-height:91px!important/);
assert.doesNotMatch(responsiveCss, /flex-direction:column!important/);
assert.match(responsiveCss, /:is\(\.darkSetBadge,\.bestRibbon\)\{[^}]*border-radius:999px!important/);

// The confirmed 4-person product configuration contains one drink.
assert(
  html.includes("function setDrinkCard(x){const selected=state.setDrink===x.id"),
  'set drinks must remain a single selected product'
);
assert(
  html.includes("<strong>${selected?1:0}</strong>"),
  'set drink quantity must remain one'
);

console.log('set menu card image tests passed');
