const test=require('node:test');
const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const i18n=fs.readFileSync(path.join(root,'i18n/ui.js'),'utf8');

test('pizza option guidance reuses the established kiosk yellow with readable disabled copy',()=>{
  assert.match(html,/--v10-yellow:#f7cf2b/);
  assert.match(html,/\.optionReason,\.optionPrice\{[^}]*color:var\(--v10-yellow,#f7cf2b\)!important/);
  assert.match(html,/\.optionSetup \.optionBtn:disabled\{[^}]*opacity:1!important;[^}]*background:#555b57!important;[^}]*color:#fff!important/);
  assert.doesNotMatch(html,/\.optionReason[^}]*color:(?:var\(--r\)|#7b1118|#d71920)/);
});

test('all six languages provide option surcharge and deferred-price copy',()=>{
  for(const language of ['ko','en','ja','zh','vi','es']){
    const block=i18n.match(new RegExp(`\\n  ${language}:\\{([\\s\\S]*?)(?=\\n  (?:ko|en|ja|zh|vi|es):\\{|\\n\\};)`))?.[1]||'';
    assert.match(block,/priceAfterPizza:/,`${language} deferred-price text`);
    assert.match(block,/extraCharge:/,`${language} surcharge text`);
  }
});

test('option price display reads existing price sources without changing checkout functions',()=>{
  assert.match(html,/function standardOptionPriceText\(kind,value\)\{[\s\S]*?value==='크루아상'[\s\S]*?CRUSTS\.find\(c=>c\.name==='크루아상'\)\?\.\[state\.size\][\s\S]*?CRUSTS\.find\(c=>c\.name===value\)\?\.\[state\.size\]/);
  assert.match(html,/function crustFee\(\)\{if\(state\.promo==='upup'\)return 0;if\(state\.dough==='크루아상'\)return CRUSTS\.find\(c=>c\.name==='크루아상'\)\?\.\[state\.size\]\|\|0;return CRUSTS\.find/);
});
