const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const phone=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');

test('pizza composition keeps two touch cards while crust remains full width',()=>{
  assert.match(html,/body\[data-step="mode"\] \.grid\.modeChoiceGrid,[\s\S]*?body\[data-step="mode"\] \.optionButtons\.two\.modeOptionButtons\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;[\s\S]*?gap:20px!important/);
  assert.match(html,/body\[data-step="mode"\] \.setCrustGrid,[\s\S]*?body\[data-step="crust"\] \.crustTextGrid\{[\s\S]*?grid-template-columns:minmax\(0,1fr\)!important;[\s\S]*?gap:20px!important/);
  assert.match(html,/@media\(max-width:700px\)\{[\s\S]*?body\[data-step="mode"\] \.grid\.modeChoiceGrid,[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;[\s\S]*?gap:16px!important/);
  assert.match(phone,/body\[data-step="mode"\] \.grid\.two\.modeChoiceGrid,[\s\S]*?body\[data-step="mode"\] \.optionButtons\.two\.modeOptionButtons \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\) !important;[\s\S]*?gap: 16px !important/);
});

test('composition and crust cards expose the requested touch dimensions and typography',()=>{
  assert.match(html,/body\[data-step="mode"\] :where\(\.modeChoiceCard,\.modeOptionButtons \.optionBtn\)\{[\s\S]*?min-height:260px!important;[\s\S]*?padding:32px 36px!important/);
  assert.match(html,/body\[data-step="mode"\] \.setCrustCard,[\s\S]*?body\[data-step="crust"\] \.crustTextCard\{[\s\S]*?min-height:250px!important;[\s\S]*?padding:32px 36px!important/);
  assert.match(html,/font-size:clamp\(36px,4vw,40px\)!important/);
  assert.match(html,/font-size:clamp\(22px,2\.4vw,24px\)!important/);
  assert.match(html,/font-size:clamp\(28px,3vw,30px\)!important/);
  assert.match(phone,/body\[data-step="mode"\] \.grid\.two\.modeChoiceGrid \.modeChoiceCard,[\s\S]*?body\[data-step="mode"\] \.modeOptionButtons \.optionBtn \{[\s\S]*?min-height: 220px !important;[\s\S]*?padding: 24px 18px !important/);
  assert.match(phone,/body\[data-step="crust"\] \.crustTextCard \{[\s\S]*?min-height: 220px !important;[\s\S]*?padding: 24px 22px !important/);
});

test('selected and disabled states remain visible without changing their behavior',()=>{
  assert.match(html,/body\[data-step="crust"\] \.crustTextCard:is\(\.active,\[aria-pressed="true"\]\)\{[\s\S]*?border-color:#ffd21c!important;[\s\S]*?outline:4px solid #ffd21c!important;[\s\S]*?box-shadow:[^;]+!important;[\s\S]*?transform:none!important/);
  assert.match(html,/body\[data-step="crust"\] \.crustTextCard:active\{[\s\S]*?transform:none!important/);
  assert.match(html,/body\[data-step="crust"\] \.crustTextCard:disabled\{[\s\S]*?opacity:\.58!important;[\s\S]*?filter:grayscale\(\.9\)!important/);
  assert.match(html,/body:is\(\[data-step="mode"\],\[data-step="crust"\]\) \.disabledReason\{[\s\S]*?font-size:22px!important/);
  assert.match(html,/onclick="selectPizzaMode\('single'\)"/);
  assert.match(html,/onclick="selectPizzaMode\('half'\)"/);
  assert.match(html,/onclick="selectCrust\('\$\{c\.name\}'\)"/);
  assert.match(html,/\$\{halfDisabled\?'disabled':''\} onclick="selectPizzaMode\('half'\)"/);
});

test('phone pizza option cards use available height without shrinking text',()=>{
  assert.match(phone,/body\[data-step="pizzaOptions"\] \.optionBtn \{[\s\S]*?min-height: 72px;[\s\S]*?padding: 11px 7px;[\s\S]*?font-size: 16px;/);
  assert.match(phone,/body\[data-step="pizzaOptions"\] \.optionSection \{[\s\S]*?margin-bottom: 3px;[\s\S]*?padding: 9px 10px 9px;/);
  assert.match(phone,/body\[data-step="pizzaOptions"\] \.optionSection > h2 \{[\s\S]*?font-size: 18px;/);
  assert.match(phone,/body\[data-step="pizzaOptions"\] \.optionReason \{[\s\S]*?font-size: 12px;[\s\S]*?word-break: keep-all;/);
  assert.match(phone,/body\[data-step="pizzaOptions"\] \.optionBtn\.active \{[\s\S]*?border-width: 3px;[\s\S]*?box-shadow:/);
});

test('three and four person sets use compact equal composition cards with visible prices',()=>{
  assert.match(html,/class="setOptionCombined setOptionCombined-\$\{state\.set\}"/);
  assert.match(html,/modeMainLabel[^>]*>\$\{t\('ui\.pizzaOptions\.whole'\)\}<\/span><span class="modeBasePrice">\$\{money\(0\)\}/);
  assert.match(html,/html\[data-layout\] body\[data-step="mode"\][\s\S]*?:is\(\.setOptionCombined-3\.setOptionCombined-3,\.setOptionCombined-4\.setOptionCombined-4\)[\s\S]*?\.optionButtons\.two\.modeOptionButtons\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important;[\s\S]*?align-items:stretch!important/);
  assert.match(html,/html\[data-layout\] body\[data-step="mode"\][\s\S]*?:is\(\.setOptionCombined-3\.setOptionCombined-3,\.setOptionCombined-4\.setOptionCombined-4\)[\s\S]*?\.modeOptionButtons \.optionBtn\{[\s\S]*?min-height:132px!important;[\s\S]*?height:132px!important/);
  assert.match(html,/html\[data-layout\] body\[data-step="mode"\][\s\S]*?:is\(\.setOptionCombined-3\.setOptionCombined-3,\.setOptionCombined-4\.setOptionCombined-4\)[\s\S]*?\.modeOptionButtons \.modeMainLabel\{[\s\S]*?font-size:clamp\(43px,4\.8vw,48px\)!important/);
  assert.match(html,/html\[data-layout\] body\[data-step="mode"\][\s\S]*?:is\(\.setOptionCombined-3\.setOptionCombined-3,\.setOptionCombined-4\.setOptionCombined-4\)[\s\S]*?\.setCrustCard\{[\s\S]*?min-height:112px!important/);
});

test('half-and-half guidance is modal-only and keeps eligibility logic unchanged',()=>{
  assert.doesNotMatch(html,/<aside class="halfGuideNotice">/);
  assert.doesNotMatch(html,/body\[data-step="mode"\] \.halfGuideNotice/);
  assert.match(html,/if\(state\.modal==='halfGuide'\)return `<div class="backdrop"><div class="modal halfGuideModal" role="dialog" aria-modal="true" aria-labelledby="halfGuideTitle">/);
  for(const key of ['halfGuideTitle','halfGuideBase','halfGuideUnavailable','halfGuideUnavailableItems','halfGuideJohns']){
    assert.ok(html.includes(`ui.mode.${key}`),key);
  }
  assert.match(html,/\.halfGuideModal\{[\s\S]*?width:min\(680px,100%\)!important;[\s\S]*?font-size:clamp\(18px,2\.1vw,24px\)!important/);
  assert.match(html,/autofocus onclick="confirmHalfGuide\(\)"/);
  assert.match(html,/function halfFirstEligible\(id\)\{return !\['P004','P007','P008','P011'\]\.includes\(id\)\}/);
  assert.match(html,/function halfAllowed\(first,second\)\{/);
});
