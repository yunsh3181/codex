(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.PJ_BOTTLE_SEAT_POLICY=api})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const TIME_ZONE='Asia/Seoul',SUPPORTED_START_YEAR=2026,SUPPORTED_END_YEAR=2030;
 const BOTTLE_SEAT_IDS=Object.freeze(['annex-1','annex-2','annex-3','annex-4','room-1','room-2','room-3']);
 const BOTTLE_ROOM_IDS=Object.freeze(['room-1','room-2','room-3']);
 const BOTTLE_SEAT_ID_SET=new Set(BOTTLE_SEAT_IDS),BOTTLE_ROOM_ID_SET=new Set(BOTTLE_ROOM_IDS);
 const DATA_METADATA=Object.freeze({supportedStartYear:SUPPORTED_START_YEAR,supportedEndYear:SUPPORTED_END_YEAR,source:'우주항공청 관보 월력요항 및 한국천문연구원 달력자료',sourceUrl:'https://astro.kasi.re.kr/life/post/almanac',lastVerified:'2026-08-03',temporaryHolidayOverrides:'HOLIDAY_OVERRIDES'});
 const HOLIDAYS=Object.freeze({
  2026:['01-01','02-16','02-17','02-18','03-01','03-02','05-05','05-24','05-25','06-03','06-06','08-15','08-17','09-24','09-25','09-26','10-03','10-05','10-09','12-25'],
  2027:['01-01','02-06','02-07','02-08','02-09','03-01','05-05','05-13','06-06','08-15','08-16','09-14','09-15','09-16','10-03','10-04','10-09','10-11','12-25','12-27'],
  2028:['01-01','01-26','01-27','01-28','03-01','04-12','05-02','05-05','06-06','08-15','10-02','10-03','10-04','10-05','10-09','12-25'],
  2029:['01-01','02-12','02-13','02-14','03-01','05-05','05-07','05-20','05-21','06-06','08-15','09-21','09-22','09-23','09-24','10-03','10-09','12-25'],
  2030:['01-01','02-02','02-03','02-04','02-05','03-01','05-05','05-06','05-09','06-05','06-06','08-15','09-11','09-12','09-13','10-03','10-09','12-25']
 });
 // 정부가 별도로 지정하는 임시공휴일은 이 목록에 YYYY-MM-DD로 추가한다.
 const HOLIDAY_OVERRIDES=Object.freeze([]);
 const warnedYears=new Set();
 function getSeoulDateParts(value=new Date()){
  const date=value instanceof Date?value:new Date(value);if(Number.isNaN(date.getTime()))return null;
  const raw=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  return {year:Number(raw.year),month:Number(raw.month),day:Number(raw.day),weekday:{Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[raw.weekday],hour:Number(raw.hour),minute:Number(raw.minute),second:Number(raw.second)}
 }
 function getSeoulDateKey(value=new Date()){const p=getSeoulDateParts(value);return p?`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`:null}
 function isBottleSeat(id){return BOTTLE_SEAT_ID_SET.has(String(id||''))}
 function isBottleRoom(id){return BOTTLE_ROOM_ID_SET.has(String(id||''))}
 function holidayForKey(key){if(!key)return false;const [year,md]=[Number(key.slice(0,4)),key.slice(5)];return Boolean(HOLIDAYS[year]?.includes(md)||HOLIDAY_OVERRIDES.includes(key))}
 function getKoreanHolidayInfo(value=new Date()){const p=getSeoulDateParts(value),key=getSeoulDateKey(value);if(!p)return {isHoliday:false,supported:false,key:null,reason:'invalid-date'};const supported=p.year>=SUPPORTED_START_YEAR&&p.year<=SUPPORTED_END_YEAR;if(!supported)return {isHoliday:false,supported:false,key,reason:'unsupported-year'};return {isHoliday:holidayForKey(key),supported:true,key,reason:holidayForKey(key)?'public-holiday':null}}
 function isKoreanPublicHoliday(value=new Date()){return getKoreanHolidayInfo(value).isHoliday}
 function isWeekendInSeoul(value=new Date()){const p=getSeoulDateParts(value);return p? p.weekday===0||p.weekday===6:true}
 function getBottleSeatAvailability(value=new Date()){
  const p=getSeoulDateParts(value);if(!p)return {available:false,reason:'invalid-date',supported:false};
  const holiday=getKoreanHolidayInfo(value);if(!holiday.supported){if(!warnedYears.has(p.year)){warnedYears.add(p.year);console.warn(`[bottle-seat-policy] ${p.year}년 공휴일 데이터 갱신 필요`)}return {available:false,reason:'unsupported-year',supported:false}}
  if(holiday.isHoliday)return {available:false,reason:'holiday',supported:true,holiday};
  if(p.weekday===0||p.weekday===6)return {available:false,reason:'weekend',supported:true};
  const seconds=p.hour*3600+p.minute*60+p.second;if(seconds<11*3600)return {available:false,reason:'before-open',supported:true};if(seconds>=14*3600)return {available:false,reason:'after-close',supported:true};
  return {available:true,reason:'open',supported:true}
 }
 function isBottleSeatOperatingTime(value=new Date()){return getBottleSeatAvailability(value).available}
 function millisecondsUntilNextBoundary(value=new Date()){
  const date=value instanceof Date?value:new Date(value),p=getSeoulDateParts(date);if(!p)return 60000;
  const seconds=p.hour*3600+p.minute*60+p.second,target=seconds<39600?39600:seconds<50400?50400:86400;
  return Math.max(1,(target-seconds)*1000-date.getMilliseconds()+25)
 }
 function holidayCounts(){return Object.fromEntries(Object.entries(HOLIDAYS).map(([year,days])=>[year,new Set(days).size]))}
 return {TIME_ZONE,SUPPORTED_START_YEAR,SUPPORTED_END_YEAR,BOTTLE_SEAT_IDS,BOTTLE_ROOM_IDS,DATA_METADATA,HOLIDAYS,HOLIDAY_OVERRIDES,isBottleSeat,isBottleRoom,getSeoulDateParts,getSeoulDateKey,isWeekendInSeoul,getKoreanHolidayInfo,isKoreanPublicHoliday,getBottleSeatAvailability,isBottleSeatOperatingTime,millisecondsUntilNextBoundary,holidayCounts}
});
