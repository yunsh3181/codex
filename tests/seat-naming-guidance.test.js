const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const locales=['ko','en','ja','zh','vi','es'];
const seatIds=['papa-2','papa-bar4','annex-1','annex-2','annex-3','annex-4','room-1','room-2','room-3','outdoor-1','outdoor-2','outdoor-3','outdoor-4'];
const nameKeys=['papaCouple','papaBar','annex1','annex2','annex3','annex4','room1','room2','room3','outdoor1','outdoor2','outdoor3','outdoor4'];
const locationKeys=['papaCouple','papaBar','annex1','annex2','annex3','annex4','room1','room2','room3','outdoor'];

function loadLocale(locale){
 const context={window:{PJ_I18N_LOCALES:{}}};
 vm.runInNewContext(read(`i18n/${locale}.js`),context,{filename:`i18n/${locale}.js`});
 return context.window.PJ_I18N_LOCALES[locale]
}

test('seat IDs stay stable and configured capacities match the physical layout',()=>{
 const html=read('index.html');
 const block=html.slice(html.indexOf('const DINING_TABLES='),html.indexOf('let mobileSeatDocs='));
 for(const id of seatIds)assert.match(block,new RegExp(`id:'${id.replace('-','\\-')}'`),id);
 for(const id of ['annex-1','annex-4'])assert.match(block,new RegExp(`id:'${id}'.{0,100}seats:2`),id);
 for(const id of ['annex-2','annex-3','outdoor-1','outdoor-2','outdoor-3','outdoor-4'])assert.match(block,new RegExp(`id:'${id}'.{0,100}seats:5`),id);
 for(const id of ['room-1','room-2','room-3'])assert.match(block,new RegExp(`id:'${id}'.{0,100}seats:4`),id)
});

test('all six locales provide seat names, area guidance, locations, and updated rules',()=>{
 for(const locale of locales){
  const value=loadLocale(locale),seat=value.seat;
  for(const key of nameKeys)assert.equal(typeof seat.name[key],'string',`${locale}.seat.name.${key}`);
  for(const key of ['papa','annex','room','outdoor'])assert.equal(typeof seat.areaLocation[key],'string',`${locale}.seat.areaLocation.${key}`);
  for(const key of locationKeys)assert.equal(typeof seat.location[key],'string',`${locale}.seat.location.${key}`);
  for(const key of ['twoOrLess','fourOrLess','five','roomOrOutdoor','outdoorOnly'])assert.match(seat.rule[key],/\{count\}/,`${locale}.seat.rule.${key}`);
  assert.ok(!/ROOM|보틀존|보틀룸/.test(value.party.roomAvailable),`${locale} party label`)
 }
 const ko=loadLocale('ko');
 assert.deepEqual(JSON.parse(JSON.stringify(ko.seat.name)),{papaCouple:'파파존 커플석',papaBar:'파파존 바테이블석',annex1:'별관1',annex2:'별관2',annex3:'별관3',annex4:'별관4',room1:'단체석1',room2:'단체석2',room3:'단체석3',outdoor1:'야외석1',outdoor2:'야외석2',outdoor3:'야외석3',outdoor4:'야외석4'});
 assert.equal(ko.seat.areaLocation.papa,'파파존스 내부 좌석입니다.');
 assert.equal(ko.seat.areaLocation.annex,'파파존스 옆 파파보틀 좌석 공간입니다.');
 assert.equal(ko.seat.areaLocation.room,'별관 내부 단체 좌석입니다.');
 assert.equal(ko.seat.location.annex4,'와인 장식장 바로 옆에 위치한 2인 좌석입니다.')
});

test('administrator output normalizes legacy labels without data migration',()=>{
 const source=read('admin.js'),start=source.indexOf('function normalizeLegacySeatLabel'),end=source.indexOf('function orderSeatIds',start);
 assert.ok(start>=0&&end>start);
 const context={};vm.runInNewContext(`${source.slice(start,end)};this.normalizeLegacySeatLabel=normalizeLegacySeatLabel`,context);
 const expected=new Map([['보틀존','별관'],['보틀석','별관'],['파파보틀','별관'],['별관석','별관'],['PapaBottle','별관'],['보틀룸','별관 단체석'],['ROOM','별관 단체석'],['룸1','단체석1'],['ROOM 2','단체석2'],['보틀존 3','별관3'],['annex-4','별관4']]);
 for(const [legacy,next] of expected)assert.equal(context.normalizeLegacySeatLabel(legacy),next,legacy);
 assert.match(source,/ADMIN_SEAT_NAMES\[w\.seatId\]\|\|normalizeLegacySeatLabel\(w\.seatName\)/)
});

test('seat manager uses the new display name in cards and reservation prompts',()=>{
 const source=read('seats.js');
 for(const [id,name] of [['annex-1','별관1'],['annex-2','별관2'],['annex-3','별관3'],['annex-4','별관4'],['room-1','단체석1'],['room-2','단체석2'],['room-3','단체석3']])assert.match(source,new RegExp(`id:'${id}'.{0,120}displayName:'${name}'`),id);
 assert.match(source,/prompt\(`\$\{s\.displayName\} 예약자명`/);
 assert.doesNotMatch(source,/prompt\(`\$\{s\.name\} 예약자명`/)
});

test('changed browser assets use fresh cache keys and unrelated admin assets remain stable',()=>{
 const kiosk=read('index.html'),admin=read('admin/index.html'),seat=read('seat/index.html');
 for(const locale of locales){const key=locale==='ko'?'happy-hour-visibility-v1':'foreign-name-limit-v1';assert.equal((kiosk.match(new RegExp(`i18n/${locale}\\.js\\?v=${key}`,'g'))||[]).length,1,locale)}
 assert.equal((kiosk.match(/foreign-order-followup-v1/g)||[]).length,0);
 assert.equal((kiosk.match(/seat-capacity-policy\.js\?v=3/g)||[]).length,1);
 assert.equal((admin.match(/admin\.js\?v=49\.1\.1/g)||[]).length,1);
 assert.equal((admin.match(/admin-operations\.js\?v=49\.1\.0/g)||[]).length,1);
 assert.equal((admin.match(/admin\.css\?v=49\.0\.2/g)||[]).length,1);
 assert.equal((seat.match(/seats\.js\?v=48\.0\.2/g)||[]).length,1)
});
