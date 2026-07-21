const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const phoneCss = fs.readFileSync(path.join(root, 'styles/device-phone.css'), 'utf8');
const compact = value => value.replace(/\s+/g, '');
const compactHtml = compact(html);
const compactPhone = compact(phoneCss);

test('removed legacy declarations have identical phone device replacements', () => {
  const replacements = [
    ':where(.grid,.c-grid,.grid.two,.grid.four,.crustGrid,.crustTextGrid,.setCrustGrid,.halfPreview){min-width:0;max-width:100%;gap:7px!important;',
    ':where(.card,.c-card){min-width:0;max-width:100%;border-radius:16px!important;padding:8px!important;',
    ':where(.card,.c-card):hover:not(:disabled){transform:none;',
    ':where(.card,.c-card):where(h2,h3){overflow-wrap:anywhere;word-break:keep-all;',
    '.crustPic{height:92px!important;margin:2px06px!important;border-radius:10px;',
    ':where(.optionBtn,.c-selection-control){min-height:42px;padding:10px5px;',
    '.setCrustImage{height:72px;',
  ];
  replacements.forEach(rule => assert.ok(compactPhone.includes(rule), rule));
});

test('consolidated declarations no longer remain in legacy phone queries', () => {
  assert.ok(!compactHtml.includes('.card:hover:not(:disabled){transform:none}'));
  assert.ok(!compactHtml.includes('.crustPic{height:92px!important;margin:2px06px!important;border-radius:10px}'));
  assert.ok(!compactHtml.includes('.optionBtn{padding:10px5px;min-height:42px;font-size:13px}'));
  assert.ok(!compactHtml.includes('.setCrustImage{height:72px}'));
});

test('legacy media queries, state selectors, and uncertain declarations remain', () => {
  assert.match(html, /@media\(max-width:560px\)/);
  for (const selector of [
    '.card.active', '.optionBtn.active', '.paymentCard.active', '.tableCard.selected',
    '.next:disabled', '.darkSetCard.best',
  ]) assert.ok(html.includes(selector), selector);
  for (const declaration of [
    '.head{height:58px;padding:0 10px}',
    'grid-template-columns:repeat(2,minmax(0,1fr))!important',
    '.modal,.upsellModal,.finalUpsellModal,.benefitHelperModal',
    'body[data-step="payment"] .paymentCard.active',
  ]) assert.ok(html.includes(declaration), declaration);
});
