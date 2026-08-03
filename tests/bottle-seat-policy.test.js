const test=require('node:test');
const assert=require('node:assert/strict');
const policy=require('../bottle-seat-policy');

const seoul=(value)=>new Date(`${value}+09:00`);

test('stable bottle IDs do not infer from display names',()=>{
 assert.deepEqual(policy.BOTTLE_SEAT_IDS,['annex-1','annex-2','annex-3','annex-4','room-1','room-2','room-3']);
 assert.equal(policy.isBottleRoom('room-2'),true);
 assert.equal(policy.isBottleSeat('보틀룸'),false);
 assert.equal(policy.isBottleSeat('papa-2'),false);
});

test('weekday lunch boundaries use Asia/Seoul and an exclusive 14:00 close',()=>{
 for(const [time,available] of [['2026-08-03T10:59:59',false],['2026-08-03T11:00:00',true],['2026-08-07T13:59:59',true],['2026-08-07T14:00:00',false]])assert.equal(policy.isBottleSeatOperatingTime(seoul(time)),available,time);
 assert.equal(policy.getSeoulDateKey(new Date('2026-08-02T15:00:00Z')),'2026-08-03');
 assert.equal(policy.getBottleSeatAvailability(new Date('invalid')).reason,'invalid-date');
});

test('weekends and public holidays are closed all day',()=>{
 for(const value of ['2026-08-08T12:00:00','2026-08-09T12:00:00','2026-01-01T12:00:00','2026-02-16T12:00:00','2026-02-17T12:00:00','2026-02-18T12:00:00','2026-03-02T12:00:00','2026-05-25T12:00:00','2026-06-03T12:00:00','2026-09-25T12:00:00'])assert.equal(policy.isBottleSeatOperatingTime(seoul(value)),false,value);
 assert.equal(policy.getBottleSeatAvailability(seoul('2026-01-01T12:00:00')).reason,'holiday');
});

test('2026-2030 holiday sets cover labour day, constitutional day, lunar holidays, elections and substitutes',()=>{
 const cases={
  2026:{labour:['05-01'],labourSubstitute:[],lunar:['02-16','02-17','02-18','09-24','09-25','09-26'],buddha:'05-24',substitutes:['03-02','05-25','08-17','10-05'],election:'06-03',christmas:'12-25',weekday:'08-04',weekend:'08-08'},
  2027:{labour:['05-01'],labourSubstitute:['05-03'],lunar:['02-06','02-07','02-08','02-09','09-14','09-15','09-16'],buddha:'05-13',substitutes:['02-09','05-03','07-19','08-16','10-04','10-11','12-27'],election:null,christmas:'12-25',weekday:'08-03',weekend:'08-07'},
  2028:{labour:['05-01'],labourSubstitute:[],lunar:['01-26','01-27','01-28','10-02','10-03','10-04','10-05'],buddha:'05-02',substitutes:['10-05'],election:'04-12',christmas:'12-25',weekday:'08-01',weekend:'08-05'},
  2029:{labour:['05-01'],labourSubstitute:[],lunar:['02-12','02-13','02-14','09-21','09-22','09-23','09-24'],buddha:'05-20',substitutes:['05-07','05-21','09-24'],election:null,christmas:'12-25',weekday:'08-01',weekend:'08-04'},
  2030:{labour:['05-01'],labourSubstitute:[],lunar:['02-02','02-03','02-04','02-05','09-11','09-12','09-13'],buddha:'05-09',substitutes:['02-05','05-06'],election:'06-05',christmas:'12-25',weekday:'08-01',weekend:'08-03'}
 };
 for(const [year,data] of Object.entries(cases)){
  for(const md of [...data.labour,...data.labourSubstitute,...data.lunar,data.buddha,...data.substitutes,data.christmas,'07-17'])assert.equal(policy.isKoreanPublicHoliday(seoul(`${year}-${md}T12:00:00`)),true,`${year}-${md}`);
  if(data.election)assert.equal(policy.isKoreanPublicHoliday(seoul(`${year}-${data.election}T12:00:00`)),true,`${year} election`);
  assert.equal(policy.isBottleSeatOperatingTime(seoul(`${year}-${data.weekday}T12:00:00`)),true,`${year} ordinary weekday`);
  assert.equal(policy.isBottleSeatOperatingTime(seoul(`${year}-${data.weekend}T12:00:00`)),false,`${year} weekend`);
 }
 assert.equal(policy.isKoreanPublicHoliday(seoul('2027-05-03T12:00:00')),true);
 assert.equal(policy.isKoreanPublicHoliday(seoul('2028-05-01T12:00:00')),true);
});

test('metadata distinguishes official almanacs from provisional calendar calculations',()=>{
 assert.equal(policy.DATA_METADATA.lastVerified,'2026-08-03');
 assert.deepEqual(Object.fromEntries(Object.entries(policy.YEAR_SOURCES).map(([year,value])=>[year,value.sourceType])),{2026:'official',2027:'official',2028:'provisional',2029:'provisional',2030:'provisional'});
 assert.match(policy.DATA_METADATA.overrideProcedure,/HOLIDAY_OVERRIDES/);
});

test('unsupported years fail closed while ordinary seats remain outside policy',()=>{
 assert.equal(policy.getBottleSeatAvailability(seoul('2031-01-02T12:00:00')).reason,'unsupported-year');
 assert.equal(policy.isBottleSeat('outdoor-1'),false);
 assert.deepEqual(policy.holidayCounts(),{2026:22,2027:24,2028:18,2029:20,2030:20});
});
