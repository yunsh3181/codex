const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');

test('zone cards apply review closed full available priority and expose waitlist only for full',()=>{
 assert.match(html,/const status=needsReview\?'review':a\.partyEnabled&&!policy\.allowed\?'closed':a\.partyEnabled&&policy\.allowed&&full\?'full'/);
 assert.match(html,/a\.status==='full'.*areaWaitlistBtn.*openZoneWaitlist/);
 assert.match(html,/a\.status==='closed'.*copy\.closed/);
 assert.match(html,/a\.status==='review'.*copy\.review/);
 assert.match(html,/if\(area\.status==='full'\|\|area\.status==='review'\)\{kioskPageVoice\?\.announce\('full'\);return\}/);
 assert.match(html,/if\(area\.status==='closed'\)\{kioskPageVoice\?\.announce\('closed'\);return\}/);
 assert.doesNotMatch(html,/joinZoneWaitlist/);
});

test('waitlist modal blocks the operating-system keyboard and uses the production helper',()=>{
 assert.match(html,/waitlist-phone-keypad\.js\?v=1/);
 assert.match(html,/id="waitlistPhoneDisplay"[^>]*inputmode="none"[^>]*readonly/);
 assert.match(html,/waitlistPhoneKeypad\.payload/);
 assert.match(html,/if\(zoneWaitlistSubmitting\|\|state\.modal==='zoneWaitlist'\)return/);
 assert.match(html,/event\.key==='Escape'&&state\.modal==='zoneWaitlist'/);
 assert.match(html,/requestAnimationFrame\(\(\)=>\{const target=.*target\?\.focus/);
});

test('six locales include typed full, closed, keypad and validation copy',()=>{
 for(const locale of ['ko','en','ja','zh','vi','es']){
  const source=fs.readFileSync(path.join(root,'i18n',`${locale}.js`),'utf8');
  for(const key of ['twoFull','fourFull','closed','phoneGuide','phoneLabel','keypadLabel','clear','backspace','cancel','register','submitting','phoneInvalid','registerFailed'])assert.match(source,new RegExp(`${key}:'[^']+'`),`${locale}.${key}`);
 }
});
