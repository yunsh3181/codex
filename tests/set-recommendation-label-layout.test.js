const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const setChoice = html.slice(
  html.indexOf("if(state.step==='setChoice')"),
  html.indexOf("if(state.step==='pizzaOptions')"),
);

test('two and three person recommendation labels are exactly 120% on each device', () => {
  const expected = [
    ['phone', 9, 10.8],
    ['tablet', 14, 16.8],
    ['kiosk21', 22, 26.4],
  ];

  for (const [layout, before, after] of expected) {
    assert.equal(after.toFixed(1), (before * 1.2).toFixed(1));
    assert.match(
      html,
      new RegExp(`html\\[data-layout="${layout}"\\][\\s\\S]*?:is\\(\\.set-2,\\.set-3\\) \\.darkSetBadge\\{[\\s\\S]*?font-size:${after}px!important`),
    );
  }
});

test('recommendation regions use stable dimensions without changing the four person label', () => {
  assert.match(html, /html\[data-layout="phone"\][\s\S]*?\.darkSetBadge\{[\s\S]*?position:absolute!important[\s\S]*?left:0!important[\s\S]*?top:4\.5px!important[\s\S]*?width:62px[\s\S]*?height:64px[\s\S]*?overflow-wrap:anywhere/);
  assert.match(html, /html\[data-layout="phone"\][\s\S]*?\.set-4 \.darkSetBadge\{[\s\S]*?top:2\.5px!important/);
  assert.match(html, /html\[data-layout="tablet"\][\s\S]*?\.darkSetCard\{[\s\S]*?display:flex!important[\s\S]*?flex-direction:column!important[\s\S]*?justify-content:flex-start!important/);
  assert.match(html, /html\[data-layout="tablet"\][\s\S]*?\.darkSetBadge\{[\s\S]*?min-height:35px/);
  assert.match(html, /html\[data-layout="kiosk21"\][\s\S]*?\.darkSetBadge\{[\s\S]*?min-height:46px/);
  const setFourBadgeRules = [...html.matchAll(/\.set-4 \.darkSetBadge\{([^}]*)\}/g)];
  assert.ok(setFourBadgeRules.length > 0);
  setFourBadgeRules.forEach(([, declarations]) => assert.doesNotMatch(declarations, /font-size/));
});

test('set card content, prices, and selection paths remain unchanged', () => {
  for (const size of [2, 3, 4]) {
    assert.match(setChoice, new RegExp(`onclick="chooseSet\\(\\$\\{s\\.n\\}\\)"`));
    assert.match(setChoice, new RegExp(`\\{n:${size},`));
  }
  assert.match(setChoice, /price:24000/);
  assert.match(setChoice, /price:33000/);
  assert.match(setChoice, /price:42000/);
  assert.match(setChoice, /benefit\.setChoice\.card\.\$\{s\.key\}\.desc/);
});
