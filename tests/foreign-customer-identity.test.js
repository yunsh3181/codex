const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const identity=require('../customer-identity');

const html=fs.readFileSync('index.html','utf8');
const admin=fs.readFileSync('admin.js','utf8');
const operations=fs.readFileSync('admin-operations.js','utf8');
const tv=fs.readFileSync('waiting-tv/waiting-tv.js','utf8');
const rules=fs.readFileSync('firestore.rules','utf8');

test('six languages select the required identity and on-screen keyboard',()=>{
 assert.deepEqual(identity.identityFor({language:'ko',phoneLast4:'1111'}),{customerIdentityType:'phone_last4',phoneLast4:'1111'});
 for(const language of ['en','ja','zh','vi','es']){
  assert.deepEqual(identity.identityFor({language,name:'  Alex  '}),{customerIdentityType:'name',customerDisplayName:'Alex'});
  assert.ok(identity.keyboardRows(language).flat().join('').length>20,`${language} keyboard is populated`);
 }
 assert.match(identity.keyboardRows('ja').join(''),/[あア]/);
 assert.match(identity.keyboardRows('es').join(''),/[ÑÁ]/);
 assert.match(identity.keyboardRows('vi').join(''),/[ĐĂ]/);
 assert.match(identity.keyboardRows('zh').join(''),/[A-Z]/);
});

test('name sanitization is grapheme-aware and rejects unsafe or invalid input',()=>{
 assert.deepEqual(identity.validateDisplayName('  <script>alert(1)</script> Ana\u0000  María  '),{valid:true,value:'Ana María',length:9});
 assert.equal(identity.validateDisplayName('   ').valid,false);
 assert.equal(identity.validateDisplayName('😀'.repeat(20)).valid,true);
 assert.equal(identity.validateDisplayName('😀'.repeat(21)).valid,false);
 assert.equal(identity.identityFor({language:'en',name:'<script>x</script>'}),null);
});

test('DOM payload rules admin TV and TTS use one production identity path',()=>{
 assert.ok(html.includes('readonly inputmode="none" autocomplete="off"'));
 assert.ok(html.includes('customerIdentityType:\'phone_last4\'')&&html.includes('customerDisplayName'));
 assert.ok(rules.includes("customerIdentityType == 'name'")&&rules.includes('validPublicDisplayIdentity(orderId)'));
 assert.ok(operations.includes('...displayIdentity(order)'));
 assert.ok(admin.includes('safeCustomerCallName(order.customerDisplayName)'));
 assert.ok(admin.includes('order.customerDisplayName,order.customerIdentityType'));
 assert.ok(tv.includes('function waitingCustomerLabel(item)'));
 assert.ok(tv.includes('enqueueCompletionSound()'));
 assert.ok(!tv.includes('forEach(row=>enqueueReadyOrder(row.orderNumber))'),'customer monitor never performs TTS');
});

test('all locale bundles contain the complete name screen copy',()=>{
 for(const locale of ['ko','en','ja','zh','vi','es']){
  const source=fs.readFileSync(`i18n/${locale}.js`,'utf8');
  for(const key of ['title','subtitle','label','keyboard','space','clear','confirm','invalid','ready'])assert.match(source,new RegExp(`${key}:'`),`${locale}.${key}`);
 }
});
