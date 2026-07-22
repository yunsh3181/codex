const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ko=fs.readFileSync(path.join(root,'i18n/ko.js'),'utf8');

assert.ok(!html.includes('<div class="partyPeopleIcon">${uiIcon("users")}</div>'),'party icon is removed');
assert.ok(html.includes('<div class="partyCountLabel">${t(\'party.label\')}</div>'),'party label replaces the icon');
assert.ok(ko.includes("label:'인원'"),'party label is explicit Korean copy');
assert.ok(html.includes('padding-bottom:calc(var(--order-summary-height) + var(--safe-bottom) + 28px)'),'party content reserves the measured fixed summary height');
assert.ok(html.includes("content:'\\C120\\D0DD\\20\\AC00\\B2A5'")&&html.includes("content:'\\C120\\D0DD\\20\\BD88\\AC00'"),'zone status is communicated with visible text');
assert.ok(html.includes('background:#e8f7ec!important')&&html.includes('border-color:#1f7a3a!important'),'enabled zones use green');
assert.ok(html.includes('background:#fde7e7!important')&&html.includes('border-color:#c62828!important'),'disabled zones use red');
assert.ok(html.includes('background:#fff4d6!important')&&html.includes('border-color:#c77b00!important'),'selected zone is distinct from enabled green');
for(const protectedToken of ['function requiredTableCount()','function partyAreaRule(area)','function handleAreaClick(id)','const SEAT_IDLE_MS=30000'])assert.ok(html.includes(protectedToken),`${protectedToken} remains intact`);
assert.ok(html.includes("if(!area.enabled){alert(areaPolicyMessage(area));return;}"),'disabled-zone reason alert remains intact');
console.log('dine-in party label, fixed-footer spacing, and zone status UI passed');
