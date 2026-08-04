'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const locales=Object.fromEntries(['ko','en','ja','zh','vi','es'].map(locale=>[locale,fs.readFileSync(path.join(root,'i18n',`${locale}.js`),'utf8')]));

test('meal-ticket styling is bound to the internal method id in every responsive customer flow',()=>{
 assert.match(html,/data-payment-method="\$\{method\}"/);
 assert.match(html,/body\[data-step="payment"\] \.paymentCard\[data-payment-method="meal_ticket"\][\s\S]*?\{[\s\S]*?background:#03C75A!important;[\s\S]*?color:#07150f!important/);
 assert.equal((html.match(/background:#03C75A!important/g)||[]).length,1);
 const luminance=hex=>{const rgb=hex.match(/[0-9a-f]{2}/gi).map(value=>parseInt(value,16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4);return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]};
 const contrast=(luminance('03C75A')+.05)/(luminance('07150f')+.05);
 assert.ok(contrast>=4.5,`meal-ticket text contrast ${contrast.toFixed(2)} meets WCAG AA`);
});

test('Korean payment guidance owns the exact particles while all six locales define the central values',()=>{
 for(const phrase of ['현금으로','신용카드로','식권대장으로','제로페이로'])assert.ok(locales.ko.includes(phrase));
 assert.doesNotMatch(locales.ko,/현금로|식권대장로/);
 for(const [locale,source] of Object.entries(locales))for(const method of ['cash','card','meal_ticket','bizle'])assert.match(source,new RegExp(`${method}:'`),`${locale} defines ${method}`);
 assert.match(html,/paymentGuidanceName\(state\.paymentMethod\)/);
 assert.match(html,/function paymentGuidanceName\(v\)\{const key=`done\.paymentMethodPhrase\.\$\{v\}`,translated=t\(key\);return translated===key\?paymentName\(v\):translated\}/);
});
