const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const locale=require('../waiting-tv/waiting-tv-locales.js');
const production=fs.readFileSync(path.join(root,'waiting-tv','waiting-tv.js'),'utf8');
const html=fs.readFileSync(path.join(root,'waiting-tv','index.html'),'utf8');
const expected={
 ko:{cooking:'조리중',ready:'조리완료',reservationCooking:'조리중 (예약)',reservationReady:'조리완료 (예약)',countdown:'조리완료까지 12:34',scheduledPickup:'예약 19:30',cookingGuidance:'주문이 준비되고 있습니다.',readyGuidance:'카운터로 와주시기 바랍니다.'},
 en:{cooking:'Preparing',ready:'Ready for pickup',reservationCooking:'Preparing (Scheduled)',reservationReady:'Ready for pickup (Scheduled)',countdown:'Ready in 12:34',scheduledPickup:'Scheduled pickup 19:30',cookingGuidance:'Your order is being prepared.',readyGuidance:'Please come to the counter to collect your order.'},
 ja:{cooking:'調理中',ready:'お受け取りできます',reservationCooking:'調理中（予約）',reservationReady:'お受け取りできます（予約）',countdown:'完成まで 12:34',scheduledPickup:'予約受取 19:30',cookingGuidance:'ご注文を準備しています。',readyGuidance:'カウンターまでお越しください。'},
 zh:{cooking:'制作中',ready:'可取餐',reservationCooking:'制作中（预约）',reservationReady:'可取餐（预约）',countdown:'距离完成 12:34',scheduledPickup:'预约取餐 19:30',cookingGuidance:'您的订单正在制作中。',readyGuidance:'请到柜台取餐。'},
 vi:{cooking:'Đang chuẩn bị',ready:'Sẵn sàng nhận món',reservationCooking:'Đang chuẩn bị (Đặt trước)',reservationReady:'Sẵn sàng nhận món (Đặt trước)',countdown:'Còn 12:34',scheduledPickup:'Nhận món lúc 19:30',cookingGuidance:'Đơn hàng của bạn đang được chuẩn bị.',readyGuidance:'Vui lòng đến quầy để nhận món.'},
 es:{cooking:'Preparando',ready:'Listo para recoger',reservationCooking:'Preparando (Reserva)',reservationReady:'Listo para recoger (Reserva)',countdown:'Listo en 12:34',scheduledPickup:'Recogida reservada 19:30',cookingGuidance:'Estamos preparando su pedido.',readyGuidance:'Acérquese al mostrador para recoger su pedido.'}
};

test('waiting-TV locale formatter has the complete exact six-language card copy',()=>{
 assert.deepEqual(locale.supportedLanguages,['ko','en','ja','zh','vi','es']);
 for(const language of locale.supportedLanguages){
  for(const [key,value] of Object.entries(expected[language])){
   const values=key==='countdown'?{time:'12:34'}:key==='scheduledPickup'?{time:'19:30'}:undefined;
   assert.equal(locale.format(language,key,values),value,`${language}.${key}`);
  }
 }
});

test('missing, damaged, empty, and unsupported order languages fail safely to Korean',()=>{
 for(const language of [undefined,null,'','   ','fr','en-US',{},42]){
  assert.equal(locale.normalizeLanguage(language),'ko',String(language));
  assert.equal(locale.format(language,'ready'),'조리완료',String(language));
 }
 assert.equal(locale.normalizeLanguage(' ES '),'es');
});

test('production waiting-TV renderer uses each order language without schema or write changes',()=>{
 assert.match(production,/function waitingOrderLanguage\(item\)\{return PJWaitingTvLocale\.normalizeLanguage\(item\?\.language\)\}/);
 assert.match(production,/waitingOrderText\(item,reservation\?/);
 assert.match(production,/node\.lang=waitingOrderLanguage\(item\);node\.dataset\.language=node\.lang/);
 assert.doesNotMatch(production,/collection\([^)]*\)\.(?:add|set|update)|\.doc\([^)]*\)\.(?:set|update|delete)/);
 assert.equal((html.match(/waiting-tv-locales\.js\?v=1/g)||[]).length,1);
 assert.ok(html.indexOf('waiting-tv-locales.js?v=1')<html.indexOf('waiting-tv.js?v=10'));
});
