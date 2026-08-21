const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8');
const localeFiles=['ko','en','ja','zh','vi','es'].map(language=>fs.readFileSync(path.join(root,'i18n',`${language}.js`),'utf8'));

test('Korean annex and room guidance matches the approved copy',()=>{
 for(const copy of [
  '파파존스 옆 파파보틀 좌석 공간입니다.',
  '별관 내부 단체 좌석입니다.',
  '평일 오전 11시부터 오후 2시까지만 이용할 수 있습니다.',
  '현재 운영시간이 아닙니다. 평일 오전 11시부터 오후 2시까지만 이용할 수 있습니다.',
  '주말과 공휴일에는 이용할 수 없습니다. 평일 오전 11시부터 오후 2시까지만 운영합니다.',
  '평일 11:00~14:00 운영',
  '이용 불가'
 ])assert.ok(source.includes(copy),`missing approved copy: ${copy}`);
});

test('all six languages include complete bottle-seat guidance',()=>{
 const bottleCopySource=source.slice(source.indexOf('const BOTTLE_COPY='),source.indexOf('\n};',source.indexOf('const BOTTLE_COPY='))+3);
 for(const locale of localeFiles){
  assert.match(locale,/PapaBottle|파파보틀|別館|附楼|nhà phụ|Anexo|Annex/);
  assert.match(locale,/11:00/);
  assert.match(locale,/14:00|오후 2시|午後2時|下午2点/);
 }
 for(const key of ['annexBase','roomBase','operating','outside','weekendHoliday','short','unavailable','conflict']){
  assert.equal((bottleCopySource.match(new RegExp(`${key}:`,'g'))||[]).length,6,`${key} must exist in six languages`);
 }
});

test('bottle-seat UI contains no alcohol condition or confirmation branch',()=>{
 const ui=[source,...localeFiles,fs.readFileSync(path.join(root,'i18n','ui.js'),'utf8')].join('\n');
 assert.doesNotMatch(ui,/주류|술|alcohol(?:ic)?|liquor|酒類|アルコール|点酒|đồ uống có cồn/i);
 assert.doesNotMatch(source,/alcoholOnly|alcoholConfirm|data-alcohol-label/);
});

test('customer UI delegates availability to the central bottle policy',()=>{
 assert.match(source,/if\(area==='annex'\|\|area==='room'\)\{const availability=bottleAvailability\(\)/);
 assert.match(source,/if\(bottlePolicy\.isBottleSeat\(id\)&&!bottleAvailability\(\)\.available\)/);
 assert.doesNotMatch(source,/area==='annex'.*minutes|area==='room'.*minutes/);
});
