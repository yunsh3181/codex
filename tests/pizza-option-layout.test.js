const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('pizza composition and every crust grid use one full-width column',()=>{
  assert.match(html,/body\[data-step="mode"\] \.grid\.modeChoiceGrid,[\s\S]*?body\[data-step="mode"\] \.optionButtons\.two\.modeOptionButtons,[\s\S]*?body\[data-step="crust"\] \.crustTextGrid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important;[\s\S]*?width:100%!important/);
  assert.match(html,/@media\(max-width:700px\)\{[\s\S]*?body\[data-step="mode"\] \.grid\.modeChoiceGrid,[\s\S]*?body\[data-step="crust"\] \.crustTextGrid\{gap:14px!important;margin-bottom:28px!important\}/);
});

test('full-width option cards expose the requested touch typography',()=>{
  assert.match(html,/body\[data-step="mode"\] :where\(\.modeChoiceCard,\.modeOptionButtons \.optionBtn,\.setCrustCard\),[\s\S]*?min-height:150px!important;[\s\S]*?padding:25px 36px!important;[\s\S]*?gap:12px!important/);
  assert.match(html,/font-size:clamp\(34px,4vw,40px\)!important/);
  assert.match(html,/font-size:clamp\(22px,2\.4vw,24px\)!important/);
  assert.match(html,/font-size:clamp\(26px,3vw,30px\)!important/);
});

test('selected and disabled states remain visible without changing their behavior',()=>{
  assert.match(html,/body\[data-step="crust"\] \.crustTextCard:is\(\.active,\[aria-pressed="true"\]\)\{[\s\S]*?border-width:4px!important/);
  assert.match(html,/body\[data-step="crust"\] \.crustTextCard:disabled\{[\s\S]*?opacity:\.58!important;[\s\S]*?filter:grayscale\(\.9\)!important/);
  assert.match(html,/body:is\(\[data-step="mode"\],\[data-step="crust"\]\) \.disabledReason\{[\s\S]*?font-size:22px!important/);
  assert.match(html,/onclick="selectPizzaMode\('single'\)"/);
  assert.match(html,/onclick="selectPizzaMode\('half'\)"/);
  assert.match(html,/onclick="selectCrust\('\$\{c\.name\}'\)"/);
  assert.match(html,/\$\{halfDisabled\?'disabled':''\} onclick="selectPizzaMode\('half'\)"/);
});
