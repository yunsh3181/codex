const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ko=fs.readFileSync(path.join(root,'i18n/ko.js'),'utf8');

assert.ok(html.includes('class="heroPromo takeoutPromo clickable" role="button" tabindex="0" onclick="startTakeoutDiscountBanner()"'),'takeout banner keeps its click target and navigation handler');
for(const token of ['takeoutSizeNote','takeoutDiscountRate','takeoutOrderNow'])assert.ok(html.includes(token),`${token} is rendered`);
assert.ok(ko.includes("takeoutSizeNote:'라지사이즈 이상'"),'large-size qualifier matches the operating copy');
assert.ok(ko.includes("takeoutDiscountRate:'20% 할인'"),'discount rate is independently emphasized');
assert.ok(html.includes('--home-accent-yellow:var(--v10-yellow,#f7cf2b)'),'home emphasis reuses the established dark-yellow token');
assert.ok(html.includes('font-size:34px!important'),'discount is the largest desktop banner text');
assert.ok(html.includes('align-items:center!important')&&html.includes('justify-content:center!important'),'banner content is centered on both axes');
assert.ok(html.includes('align-items:stretch!important')&&html.includes('height:100%!important'),'dine-in and takeout presentation stays balanced');
assert.ok(html.includes('@media(max-width:560px)'),'phone-specific sizing remains responsive');
console.log('home order-type cards and takeout banner presentation passed');
