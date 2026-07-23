const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles/set-menu-card-images.css'), 'utf8');

const expectedImages = [
  ['2', 'two', 'assets/images/sets/set-2-person-v2.png'],
  ['3', 'three', 'assets/images/sets/set-3-person-v2.png'],
  ['4', 'four', 'assets/images/sets/set-4-person-v2.png']
];

for (const [people, key, image] of expectedImages) {
  assert(html.includes(`n:${people},`), `${people}-person set data is missing`);
  assert(html.includes(`image:'${image}'`), `${people}-person set must use ${image}`);
  assert(
    html.includes("alt=\"${escAttr(t(`benefit.setChoice.card.${s.key}.title`))}\""),
    `${people}-person set must use translated alt text`
  );
  assert(fs.existsSync(path.join(root, image)), `${image} must exist`);
}

for (const oldImage of [
  'menu_image_017.png',
  'menu_image_005.jpg',
  'menu_image_007.png',
  'menu_image_001.png',
  'menu_image_029.png'
]) {
  const setChoice = html.slice(
    html.indexOf("if(state.step==='setChoice')"),
    html.indexOf("if(state.step==='pizzaOptions')")
  );
  assert(!setChoice.includes(oldImage), `set cards must not reference ${oldImage}`);
}

assert(
  html.includes('<link rel="stylesheet" href="styles/set-menu-card-images.css">'),
  'set image stylesheet must be loaded'
);
assert(/\.setMenuImage\s*\{[\s\S]*object-fit:\s*contain\s*!important/.test(css));
assert(!/\.setMenuImage(?:-4)?\s*\{[^}]*object-fit:\s*cover/.test(css));
assert(/\.setMenuImage-4\s*\{[\s\S]*width:\s*96%/.test(css));

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
