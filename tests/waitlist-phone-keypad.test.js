const test=require('node:test');
const assert=require('node:assert/strict');
const keypad=require('../waitlist-phone-keypad');

test('waitlist keypad accepts only a Korean 010 mobile number',()=>{
 assert.equal(keypad.valid('01012345678'),true);
 for(const value of ['','0101234567','01112345678','010-1234-567','010123456789'])assert.equal(keypad.valid(value),false,value);
 assert.equal(keypad.digits('010-12a34-5678'),'01012345678');
 assert.equal(keypad.append('0101234567','8'),'01012345678');
 assert.equal(keypad.append('01012345678','9'),'01012345678');
 assert.equal(keypad.backspace('01012345678'),'0101234567');
 assert.equal(keypad.format('01012345678'),'010-1234-5678');
});

test('waitlist payload preserves the existing privacy-safe schema',()=>{
 const timestamp={server:true};
 assert.deepEqual(keypad.payload({seatId:'annex-2',seatName:'2번 테이블',partySize:3,phone:'01012345678',createdAt:timestamp,createdAtClient:'2026-08-19T00:00:00.000Z'}),{
  seatId:'annex-2',seatName:'2번 테이블',partySize:3,phoneLast4:'5678',phoneMasked:'010-****-5678',status:'waiting',createdAt:timestamp,createdAtClient:'2026-08-19T00:00:00.000Z'
 });
 assert.equal(keypad.payload({seatId:'annex-2',partySize:3,phone:'0101234'}),null);
});
