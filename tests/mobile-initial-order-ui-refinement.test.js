const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const phone=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');

test('home promotion banners share the orange phone banner component',()=>{
  for(const name of ['happyPromo clickable','takeoutPromo clickable','beerAd'])assert.ok(html.includes(name));
  assert.match(phone,/\.heroPromoStrip \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(phone,/\.heroPromoStrip \.heroPromo \{[\s\S]*?height: 104px !important;[\s\S]*?background: #d86f00 !important/);
  assert.doesNotMatch(phone,/\.heroPromoStrip \.clickable \{\s*display: none !important/);
});

test('pickup timing cards expose distinct visual and non-color selection states',()=>{
  assert.match(html,/class="card timingChoice timingNow" aria-pressed=/);
  assert.match(html,/class="card timingChoice timingReserve" aria-pressed=/);
  assert.match(html,/class="timingChoiceCheck"/);
  assert.match(phone,/\.timingNow \{[\s\S]*?background: #fff0df/);
  assert.match(phone,/\.timingReserve \{[\s\S]*?background: #e8f5f9/);
  assert.match(phone,/\[aria-pressed="true"\][\s\S]*?\.timingChoiceCheck/);
});

test('five takeout benefits use an equal three-column phone grid',()=>{
  for(const id of ['set','upup','happy','takeout','normal'])assert.ok(html.includes(`{id:'${id}'`));
  assert.match(phone,/body\[data-step="promo"\] \.darkBenefitGrid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(phone,/body\[data-step="promo"\] \.darkBenefitCard \{[\s\S]*?min-height: 150px !important;[\s\S]*?height: 150px !important/);
  assert.doesNotMatch(phone,/^\s*@media/m);
});
