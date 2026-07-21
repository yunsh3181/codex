const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const css=fs.readFileSync(path.join(root,'styles/device-tablet.css'),'utf8');
const compact=css.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,'');

test('tablet header and progress activation stays runtime scoped',()=>{
 const rules=css.replace(/\/\*[\s\S]*?\*\//g,'').split('}').map(rule=>rule.trim()).filter(Boolean);
 rules.filter(rule=>!rule.startsWith('@media')).forEach(rule=>{
  assert.ok(rule.split('{')[0].includes('html[data-layout="tablet"]'));
 });
 assert.doesNotMatch(css,/html\[data-layout="phone"\]/);
 assert.match(css,/html\[data-layout="tablet"\][\s\S]*:where\(\.head, \.c-header\)/);
 assert.match(css,/html\[data-layout="tablet"\][\s\S]*:where\(\.progress, \.c-progress\)/);
});

test('header and progress share tablet width, padding, and safe-area geometry',()=>{
 assert.ok(compact.includes('--tablet-content-max:880px'));
 assert.ok(compact.includes('--tablet-page-padding:24px'));
 assert.ok(compact.includes('--tablet-header-height:80px'));
 assert.ok(compact.includes('--tablet-progress-height:56px'));
 assert.ok((compact.match(/max-width:var\(--tablet-content-max\)!important/g)||[]).length>=1);
 assert.ok((compact.match(/padding-right:calc\(var\(--tablet-page-padding\)\+var\(--safe-right\)\)!important/g)||[]).length>=3);
 assert.ok((compact.match(/padding-left:calc\(var\(--tablet-page-padding\)\+var\(--safe-left\)\)!important/g)||[]).length>=3);
 ['--safe-top','--safe-right','--safe-left'].forEach(token=>assert.ok(css.includes(`var(${token})`)));
});

test('tablet header protects long store names and navigation touch targets',()=>{
 assert.match(compact,/:where\(\.brandName,\.storeName\)[^{]*\{[^}]*overflow:hidden[^}]*text-overflow:ellipsis[^}]*white-space:nowrap/);
 assert.ok(css.includes('.langTopBtn'));
 assert.match(compact,/min-width:var\(--touch-target-min\)[^}]*min-height:var\(--touch-target-min\)!important/);
 assert.match(compact,/max-width:min\(42vw,260px\)/);
});

test('tablet progress preserves state selectors and touch overflow',()=>{
 assert.match(compact,/overflow-x:auto/);
 assert.match(compact,/overflow-y:hidden/);
 assert.match(compact,/-webkit-overflow-scrolling:touch/);
 assert.match(compact,/overscroll-behavior-inline:contain/);
 assert.match(compact,/scrollbar-width:thin/);
 assert.match(compact,/:where\(\.progressStep,\.step,\.stepLabel,span\)[^{]*\{[^}]*flex:00auto[^}]*white-space:nowrap/);
 const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
 assert.match(html,/\.progress span\.done/);
 assert.match(html,/\.progress span\.on/);
 assert.match(html,/n<i\?'done':n===i\?'on':''/);
});

test('stage offset follows the tablet header and progress without component changes',()=>{
 assert.ok(compact.includes('--tablet-stage-top-offset:calc(var(--tablet-header-height)+var(--tablet-progress-height)+var(--safe-top))'));
 assert.ok(compact.includes('scroll-margin-top:var(--tablet-stage-top-offset)'));
 assert.doesNotMatch(css,/\.cartbar|\.selectionFooter|\.modal|\.checkout/);
 assert.ok(compact.includes('overflow-x:hidden'));
});
