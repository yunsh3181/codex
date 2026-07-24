const assert=require('assert');
const fs=require('fs');
const path=require('path');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const ko=fs.readFileSync(path.join(root,'i18n/ko.js'),'utf8');
const localeSources=Object.fromEntries(['ko','en','ja','zh','vi','es'].map(locale=>[locale,fs.readFileSync(path.join(root,`i18n/${locale}.js`),'utf8')]));

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
assert.match(html,/body\[data-step="party"\] \.partyStepBtn\{[\s\S]*?min-width:88px!important;[\s\S]*?font-size:72px!important/,'party stepper uses enlarged stable touch targets');
assert.match(html,/body\[data-step="party"\] \.partyStepBtn:active:not\(:disabled\)\{[\s\S]*?transform:none!important/,'party stepper does not scale during rapid touch');
assert.match(html,/body\[data-step="party"\] \.partyCountDisplay\{[\s\S]*?font-size:84px!important/,'party count is enlarged');
assert.match(html,/body\[data-step="party"\] \.partyNext\{[\s\S]*?min-height:106px!important;[\s\S]*?margin-top:32px!important;[\s\S]*?font-size:36px!important/,'party next CTA is enlarged and separated');
assert.match(html,/body\[data-step="area"\] \.areaCard\{[\s\S]*?min-height:360px!important;[\s\S]*?padding:34px 28px!important;[\s\S]*?gap:24px!important/,'area cards provide enlarged content and touch spacing');
assert.match(html,/body\[data-step="area"\] \.areaCard h2\{font-size:clamp\(31px,3\.6vw,38px\)!important/,'area names are enlarged');
assert.match(html,/body\[data-step="promo"\] \.darkBenefitCard\{[\s\S]*?min-height:330px!important;[\s\S]*?padding:38px 28px!important;[\s\S]*?gap:18px!important/,'dine-in order type cards are enlarged');
assert.match(html,/body:is\(\[data-step="party"\],\[data-step="area"\],\[data-step="promo"\]\) \.cartbar\{[\s\S]*?height:94px!important/,'dine-in fixed summary uses a unified enlarged height');
assert.match(html,/body:is\(\[data-step="party"\],\[data-step="area"\],\[data-step="promo"\]\) \.stage\{[\s\S]*?padding-bottom:calc\(94px \+ var\(--safe-bottom\) \+ 34px\)!important/,'content reserves the enlarged fixed summary');
const guidanceByLocale={
 ko:'모든 구역을 표시합니다. 현재 이용할 수 없는 구역은 선택 불가로 표시되며, 누르면 이용 사유를 확인할 수 있습니다.',
 en:'All areas are shown. Areas that are currently unavailable are marked as unavailable; tap them to see why.',
 ja:'すべてのエリアを表示します。現在利用できないエリアは選択不可として表示され、タップすると理由を確認できます。',
 zh:'显示所有区域。当前不可用的区域会标记为不可选择，点击可查看原因。',
 vi:'Tất cả khu vực đều được hiển thị. Khu vực hiện không khả dụng sẽ được đánh dấu là không thể chọn; chạm để xem lý do.',
 es:'Se muestran todas las zonas. Las que no están disponibles se marcan como no seleccionables; tócalas para conocer el motivo.'
};
for(const [locale,guidance] of Object.entries(guidanceByLocale))assert.ok(localeSources[locale].includes(`areaGuide:'${guidance}'`),`${locale} guidance describes availability without a color name`);
for(const [locale,pattern] of Object.entries({ko:/회색/,en:/gray|grey/i,ja:/グレー|灰色/,zh:/灰色/,vi:/màu xám/i,es:/gris/i}))assert.doesNotMatch(localeSources[locale].match(/seat:\{[^\n]+/)?.[0]||'',pattern,`${locale} seat guidance has no color wording`);
console.log('dine-in party label, fixed-footer spacing, and zone status UI passed');
