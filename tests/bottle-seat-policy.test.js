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

test('unsupported years fail closed while ordinary seats remain outside policy',()=>{
 assert.equal(policy.getBottleSeatAvailability(seoul('2031-01-02T12:00:00')).reason,'unsupported-year');
 assert.equal(policy.isBottleSeat('outdoor-1'),false);
 assert.deepEqual(policy.holidayCounts(),{2026:20,2027:20,2028:16,2029:18,2030:18});
});
