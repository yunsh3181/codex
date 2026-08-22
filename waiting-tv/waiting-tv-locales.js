(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.PJWaitingTvLocale=api;
})(typeof window!=='undefined'?window:globalThis,function(){
 const supportedLanguages=Object.freeze(['ko','en','ja','zh','vi','es']);
 const supportedLanguageSet=new Set(supportedLanguages);
 const locales=Object.freeze({
  ko:Object.freeze({cooking:'조리중',ready:'조리완료',reservationCooking:'조리중 (예약)',reservationReady:'조리완료 (예약)',countdown:'조리완료까지 {time}',soon:'곧 준비됩니다',scheduledPickup:'예약 {time}',cookingGuidance:'주문이 준비되고 있습니다.',readyGuidance:'카운터로 와주시기 바랍니다.'}),
  en:Object.freeze({cooking:'Preparing',ready:'Ready for pickup',reservationCooking:'Preparing (Scheduled)',reservationReady:'Ready for pickup (Scheduled)',countdown:'Ready in {time}',soon:'Ready shortly',scheduledPickup:'Scheduled pickup {time}',cookingGuidance:'Your order is being prepared.',readyGuidance:'Please come to the counter to collect your order.'}),
  ja:Object.freeze({cooking:'調理中',ready:'お受け取りできます',reservationCooking:'調理中（予約）',reservationReady:'お受け取りできます（予約）',countdown:'完成まで {time}',soon:'まもなく完成します',scheduledPickup:'予約受取 {time}',cookingGuidance:'ご注文を準備しています。',readyGuidance:'カウンターまでお越しください。'}),
  zh:Object.freeze({cooking:'制作中',ready:'可取餐',reservationCooking:'制作中（预约）',reservationReady:'可取餐（预约）',countdown:'距离完成 {time}',soon:'即将完成',scheduledPickup:'预约取餐 {time}',cookingGuidance:'您的订单正在制作中。',readyGuidance:'请到柜台取餐。'}),
  vi:Object.freeze({cooking:'Đang chuẩn bị',ready:'Sẵn sàng nhận món',reservationCooking:'Đang chuẩn bị (Đặt trước)',reservationReady:'Sẵn sàng nhận món (Đặt trước)',countdown:'Còn {time}',soon:'Sắp sẵn sàng',scheduledPickup:'Nhận món lúc {time}',cookingGuidance:'Đơn hàng của bạn đang được chuẩn bị.',readyGuidance:'Vui lòng đến quầy để nhận món.'}),
  es:Object.freeze({cooking:'Preparando',ready:'Listo para recoger',reservationCooking:'Preparando (Reserva)',reservationReady:'Listo para recoger (Reserva)',countdown:'Listo en {time}',soon:'Listo en breve',scheduledPickup:'Recogida reservada {time}',cookingGuidance:'Estamos preparando su pedido.',readyGuidance:'Acérquese al mostrador para recoger su pedido.'})
 });
 function normalizeLanguage(value){
  const normalized=typeof value==='string'?value.trim().toLowerCase():'';
  return supportedLanguageSet.has(normalized)?normalized:'ko';
 }
 function format(language,key,values={}){
  const normalized=normalizeLanguage(language),template=locales[normalized][key]??locales.ko[key]??'';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g,(match,name)=>Object.prototype.hasOwnProperty.call(values,name)?String(values[name]):match);
 }
 return Object.freeze({supportedLanguages,locales,normalizeLanguage,format});
});
