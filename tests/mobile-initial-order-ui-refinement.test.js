const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const phone=fs.readFileSync(path.join(root,'styles/device-phone.css'),'utf8');

test('home promotion banners share the orange phone banner component',()=>{
  for(const name of ['happyPromo clickable','takeoutPromo clickable','beerAd'])assert.ok(html.includes(name));
  const strip=html.match(/<div class="heroPromoStrip">([\s\S]*?)<\/div>\s*\$\{startScreenVersionHTML\(\)\}/)?.[1]||'';
  assert.equal((strip.match(/class="heroPromo /g)||[]).length,3);
  assert.equal((strip.match(/startHappyHourBanner\(\)/g)||[]).length,1);
  assert.equal((strip.match(/startTakeoutDiscountBanner\(\)/g)||[]).length,1);
  assert.match(phone,/\.heroPromoStrip \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(phone,/\.heroPromoStrip \.heroPromo \{[\s\S]*?height: 104px !important;[\s\S]*?background: #d86f00 !important/);
  assert.match(phone,/\.heroPromoStrip \.heroPromo \.happyHours,[\s\S]*?\.heroPromo \.takeoutDiscount,[\s\S]*?\.heroPromo\.beerAd strong \{[\s\S]*?color: #111111 !important/);
  assert.doesNotMatch(phone,/\.heroPromoStrip \.clickable \{\s*display: none !important/);
});

test('pickup timing cards expose distinct visual and non-color selection states',()=>{
  assert.match(html,/class="card timingChoice timingNow" aria-pressed=/);
  assert.match(html,/class="card timingChoice timingReserve" aria-pressed=/);
  assert.match(html,/class="timingChoiceCheck"/);
  assert.match(phone,/\.timingNow \{[\s\S]*?background: #087348/);
  assert.match(phone,/\.timingReserve \{[\s\S]*?background: #c8102e/);
  assert.match(phone,/\.timingChoice :where\(h2, p\) \{[\s\S]*?color: #ffffff/);
  assert.match(phone,/\[aria-pressed="true"\][\s\S]*?\.timingChoiceCheck/);
});

test('five takeout benefits use an equal three-column phone grid',()=>{
  for(const id of ['set','upup','happy','takeout','normal'])assert.ok(html.includes(`{id:'${id}'`));
  assert.match(phone,/body\[data-step="promo"\] \.darkBenefitGrid \{[\s\S]*?grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(phone,/body\[data-step="promo"\] \.darkBenefitCard \{[\s\S]*?min-height: 150px !important;[\s\S]*?height: 150px !important/);
  assert.doesNotMatch(phone,/^\s*@media/m);
});
