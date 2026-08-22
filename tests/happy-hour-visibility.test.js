const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/home-promo-visibility.css'),'utf8');
const locales=['ko','en','ja','zh','vi','es'];

test('Happy Hour eligibility is accessible DOM text with a high-contrast non-animated badge',()=>{
 assert.match(html,/class="happyTakeoutOnly" role="note">\$\{t\('home\.happyHourTakeoutOnly'\)\}<\/span>/);
 assert.match(html,/class="happyDineInExclusion">\$\{t\('home\.happyHourDineInExclusion'\)\}<\/p>/);
 assert.match(css,/\.happyTakeoutOnly \{[\s\S]*?min-height: clamp\(44px,[\s\S]*?border: 2px solid #ffffff;[\s\S]*?background: #c8102e;[\s\S]*?color: #ffffff !important;[\s\S]*?font-size: clamp\(20px,/);
 assert.doesNotMatch(css,/animation|blink/i);
 assert.doesNotMatch(html,/aria-label="[^\n]*happyHourTakeoutOnly/);
});

test('both promo cards use explicit DOM hierarchy without changing offer policy',()=>{
 const strip=html.match(/<div class="heroPromoStrip">([\s\S]*?)<\/div>\s*\$\{startScreenVersionHTML\(\)\}/)?.[1]||'';
 assert.equal((strip.match(/class="heroPromo /g)||[]).length,2);
 for(const className of ['happyBenefit','happySize','happyPrice','happyHours','happyTakeoutOnly','takeoutDiscount','takeoutSizeNote'])assert.match(strip,new RegExp(`class="${className}"`));
 assert.match(strip,/16:00~20:00/);
 assert.doesNotMatch(strip,/Heineken|beerAd|하이네켄/i);
 assert.match(css,/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
 assert.match(css,/font-size: clamp\(34px, 4\.2vw, 52px\)/);
 assert.match(css,/@media \(max-width: 700px\)[\s\S]*?font-size: clamp\(28px, 8\.2vw, 34px\)/);
});

test('six locales state takeout-only eligibility, dine-in exclusion and home voice guidance',()=>{
 for(const lang of locales){
  const source=fs.readFileSync(path.join(root,'i18n',`${lang}.js`),'utf8');
  for(const key of ['happyHourSize','happyHourPrice','happyHourTakeoutOnly','happyHourDineInExclusion'])assert.match(source,new RegExp(`${key}:'[^']+'`),`${lang}/${key}`);
  assert.match(source,/voice=\{[^\n]*home:'[^']+'/s,`${lang}/voice.home`);
 }
});

test('one cache-key generation covers changed CSS and all changed locales',()=>{
 assert.equal((html.match(/home-promo-visibility\.css\?v=happy-hour-visibility-v1/g)||[]).length,1);
 assert.equal((html.match(/i18n\/(?:ko|en|ja|zh|vi|es)\.js\?v=happy-hour-visibility-v1/g)||[]).length,6);
 assert.equal((html.match(/seat-capacity-guidance-v1/g)||[]).length,0);
 const keys=[...html.matchAll(/(?:home-promo-visibility\.css|i18n\/(?:ko|en|ja|zh|vi|es)\.js)\?v=([^"']+)/g)].map(match=>match[1]);
 assert.deepEqual([...new Set(keys)],['happy-hour-visibility-v1']);
});
