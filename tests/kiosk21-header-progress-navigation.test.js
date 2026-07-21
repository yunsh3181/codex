const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-kiosk21.css'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const compact=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,'');

test('kiosk header runtime scope and protected layouts remain intact',()=>{
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map(rule=>rule.trim()).filter(Boolean);
 rules.filter(rule=>!rule.startsWith('@media')).forEach(rule=>{
  assert.ok(rule.split('{')[0].includes('html[data-layout="kiosk21"]'));
 });
 assert.doesNotMatch(css,/html\[data-layout="(?:phone|tablet|default)"\]/);
});

test('kiosk header uses fixed token geometry and 960px safe-area content',()=>{
 assert.ok(compact.includes('--kiosk21-content-max:960px'));
 assert.ok(compact.includes('--kiosk21-header-height:108px'));
 assert.ok(compact.includes('height:calc(var(--kiosk21-header-height)+var(--safe-top))!important'));
 assert.ok(compact.includes('padding-right:calc(var(--kiosk21-page-padding)+var(--safe-right))!important'));
 assert.ok(compact.includes('padding-left:calc(var(--kiosk21-page-padding)+var(--safe-left))!important'));
 assert.ok(compact.includes('max-width:var(--kiosk21-content-max)!important'));
});

test('brand text truncates while navigation keeps 64px touch geometry',()=>{
 assert.match(compact,/:where\(\.brandName,\.storeName\)[^{]*\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
 assert.ok(compact.includes('--kiosk21-navigation-target:64px'));
 assert.ok(compact.includes('--kiosk21-navigation-gap:16px'));
 assert.match(compact,/min-width:var\(--kiosk21-navigation-target\)[^}]*min-height:var\(--kiosk21-navigation-target\)!important/);
 assert.match(compact,/:where\(\.headerActions,\.homeBtn,\.backBtn,\.langBtn,\.langTopBtn\)[^{]*\{[^}]*flex:00auto/);
 ['.homeBtn','.backBtn','.langBtn','.langTopBtn'].forEach(selector=>assert.ok(css.includes(selector)));
});

test('progress sits below the header and keeps long steps scrollable',()=>{
 assert.ok(compact.includes('--kiosk21-progress-height:76px'));
 assert.ok(compact.includes('top:calc(var(--kiosk21-header-height)+var(--safe-top))!important'));
 assert.ok(compact.includes('height:var(--kiosk21-progress-height)'));
 assert.match(compact,/overflow-x:auto[^}]*overflow-y:hidden/);
 assert.ok(compact.includes('scrollbar-width:none'));
 assert.match(compact,/:where\(\.progressStep,\.step,\.stepLabel,span\)[^{]*\{[^}]*flex:00auto[^}]*max-width:none[^}]*white-space:nowrap/);
 assert.match(html,/\.progress span\.done/);
 assert.match(html,/\.progress span\.on/);
});

test('stage offset combines header progress and safe top without duplicate padding',()=>{
 assert.ok(compact.includes('--kiosk21-stage-top-offset:calc(var(--kiosk21-header-height)+var(--kiosk21-progress-height)+var(--safe-top))'));
 assert.ok(compact.includes('scroll-padding-top:var(--kiosk21-stage-top-offset)'));
 assert.ok(compact.includes('scroll-margin-top:var(--kiosk21-stage-top-offset)'));
 assert.doesNotMatch(compact,/(?:^|[;{])padding-top:var\(--kiosk21-stage-top-offset\)/);
 assert.ok(compact.includes('overflow-x:hidden'));
});

test('header activation changes no behavior-bearing source',()=>{
 assert.match(html,/function shell\(c\)/);
 assert.match(html,/onclick="openLanguageSelect\(\)"/);
 assert.doesNotMatch(css,/(?:onclick|addEventListener|function\s+\w+)\s*[=(]/);
});
