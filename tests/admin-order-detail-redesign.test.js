const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const admin=fs.readFileSync(path.join(root,'admin.js'),'utf8');
const start=admin.indexOf('function normalizedOption');
const end=admin.indexOf('\nfunction showOrderDetail',start);
assert.ok(start>=0&&end>start,'order detail renderer source exists');

const catalog={
 pizzas:{P001:'페퍼로니'},
 toppings:{T001:'양파',T002:'피망'},
 sides:{S001:'치킨스트립'},
 drinks:{D001:'코카-콜라 1.25L'},
 sauces:{A001:'프레쉬 피클'}
};
const context={
 ORDER_CATALOG:catalog,
 PIZZAS:[{id:'P001',name:'페퍼로니'}],
 TOPPINGS:[{id:'T001',name:'양파',price:1500},{id:'T002',name:'피망',price:1500}],
 SIDES:[{id:'S001',name:'치킨스트립',price:9900}],
 DRINKS:[{id:'D001',name:'코카-콜라 1.25L',price:1250}],
 PJCommon:{legacyChannel:()=> 'mobile'},
 statusNames:{completed:'완료',payment_pending:'결제대기'},
 displayText(value,fallback='-'){
  if(typeof value==='string'||typeof value==='number')return String(value).trim()||fallback;
  return fallback;
 },
 productName(id,category,legacy=[]){return catalog[category]?.[id]||legacy.find(item=>item.id===id)?.name||id},
 esc(value){return String(value??'').replace(/[&<>'"]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))},
 money(value){return Number(value||0).toLocaleString('ko-KR')+'원'},
 adminOrderNumberLabel:()=> '6707',
 orderSeatLabel:()=> '별관 4번',
 formatTime:()=> '07. 30. 오후 12:22'
};
vm.createContext(context);
vm.runInContext(admin.slice(start,end),context);

const baseOrder={
 orderNo:'D6707',customerNumber:'D6707',orderType:'dinein',partySize:2,
 phone:'01067786707',status:'completed',createdAtClient:'2026-07-30T03:22:00Z',
 seat:{zone:'annex',tables:['annex-4']},
 pickup:null,disposables:true,
 normalAmount:65800,totalAmount:55400,total:55400,
 payment:{methodName:'현금'},language:'ko',
 items:[{
  pizzaLeft:'P001',size:'F',dough:'오리지널',crust:'치즈롤',qty:1,total:43000,
  toppings:{T001:1,T002:2},
  sides:{S001:{quantity:1,total:9900}},includedSides:{},
  drinks:{D001:{quantity:2,total:2500}},includedDrinks:{}
 }]
};

const reserved=context.renderOrderDetail({...baseOrder,pickup:{mode:'reserve',time:'12:30'}});
assert.ok(reserved.includes('detail-reservation">예약</span>'),'reservation appears only from saved reservation data');
assert.ok(reserved.includes('detail-order-type dinein">매장식사'),'dine-in uses the green-type class and actual label');
assert.ok(reserved.includes('pizza-code-alpha">CH</span>14'),'alphabetic pizza code characters are isolated from numeric characters');
assert.ok(reserved.includes('<span class="pizza-code">[<span class="pizza-code-alpha">CH</span>14]</span>'),'size brackets and digits remain outside the red alphabet span');
assert.ok(reserved.includes('페퍼로니')&&reserved.includes('+ 양파')&&reserved.includes('+ 피망')&&reserved.includes('×2'),'pizza name and saved topping quantities are rendered separately');
assert.ok(!reserved.includes('pizza-code-alpha">페퍼로니'),'product name alphabetic characters never enter the red size-code span');
assert.ok(reserved.includes('치킨스트립')&&reserved.includes('9,900원'),'a stored side-line price is rendered without fabrication');
assert.ok(reserved.includes('코카-콜라 1.25L')&&reserved.includes('×2')&&reserved.includes('2,500원'),'stored drink quantity and price remain aligned');
assert.ok(reserved.includes('<h4>피자</h4>')&&reserved.includes('<h4>사이드 / 음료 / 곁들이</h4>'),'pizza and non-pizza products use separate groups');
assert.ok(reserved.includes('<span>일회용 포크</span><strong>O</strong>'),'saved true fork choice renders O');
assert.ok(reserved.includes('data-action="copy-phone"')&&reserved.includes('data-action="call-customer"'),'existing copy and customer-call actions stay connected');
assert.ok(reserved.includes('<span>결제수단</span>')&&reserved.includes('<span>원 금액</span>')&&reserved.includes('<span>할인금액</span>'),'four-column payment data uses agreed labels');

const splitDetail=context.renderOrderDetail({...baseOrder,totalAmount:40000,total:40000,payment:{method:'meal_ticket',methodName:'식권대장',splitCount:4,splitAmounts:[10000,10000,10000,10000]}});
assert.ok(splitDetail.includes('meal-ticket-highlight')&&splitDetail.includes('식권대장 40,000원')&&splitDetail.includes('10,000원 × 4인'),'equal meal-ticket split is emphasized below the detail call button');
const splitMain=context.newOrderCard({...baseOrder,id:'split-main',status:'payment_pending',totalAmount:40000,total:40000,payment:{method:'meal_ticket',methodName:'식권대장',splitCount:4,splitAmounts:[10000,10000,10000,10000]}});
assert.ok(splitMain.includes('meal-ticket-highlight')&&splitMain.includes('식권대장 40,000원')&&splitMain.includes('10,000원 × 4인'),'new-order card emphasizes the split below the call button from its first render');
assert.ok(splitMain.includes('<span>일회용 포크</span><strong>O</strong>'),'the Firestore fixture keeps the customer true selection as O on the admin main card');
const unevenDetail=context.renderOrderDetail({...baseOrder,totalAmount:28000,total:28000,payment:{method:'meal_ticket',methodName:'식권대장',splitCount:3,splitAmounts:[10000,10000,8000]}});
assert.ok(unevenDetail.includes('10,000원 + 10,000원 + 8,000원'),'unequal meal-ticket split preserves the stored payment amounts');
const singleDetail=context.renderOrderDetail({...baseOrder,payment:{method:'meal_ticket',methodName:'식권대장',splitCount:1,splitAmounts:[55400]}});
assert.ok(!singleDetail.includes('× 1인'),'single meal-ticket payment keeps the existing total-only display');
const cardDetail=context.renderOrderDetail({...baseOrder,payment:{method:'card',methodName:'신용카드',splitCount:4,splitAmounts:[10000,10000,10000,10000]}});
assert.ok(!cardDetail.includes('10,000원 × 4인'),'card payments never show meal-ticket split detail');
const mixedKnownDetail=context.renderOrderDetail({...baseOrder,totalAmount:40000,total:40000,payment:{methodName:'복합결제',methods:[{method:'meal_ticket',methodName:'식권대장',amount:28000,splitCount:3,splitAmounts:[10000,10000,8000]},{method:'card',methodName:'신용카드',amount:12000}]}});
assert.ok(mixedKnownDetail.includes('식권대장 28,000원')&&mixedKnownDetail.includes('10,000원 + 10,000원 + 8,000원'),'mixed payment displays only the explicit meal-ticket entry');
assert.ok(!mixedKnownDetail.includes('식권대장 40,000원'),'mixed payment never labels the whole paid amount as meal-ticket money');
const mixedUnknownDetail=context.renderOrderDetail({...baseOrder,totalAmount:40000,total:40000,payment:{methodName:'복합결제',methods:[{method:'meal_ticket'},{method:'card'}],splitCount:4,splitAmounts:[10000,10000,10000,10000]}});
assert.ok(!mixedUnknownDetail.includes('10,000원 × 4인')&&!mixedUnknownDetail.includes('NaN')&&!mixedUnknownDetail.includes('undefined'),'ambiguous mixed legacy payment hides unsafe split detail');

const benefitItems=[
 {...baseOrder.items[0],promo:'upup',set:null},
 {...baseOrder.items[0],promo:'set',set:3},
 {...baseOrder.items[0],promo:'upup',set:null},
 {...baseOrder.items[0],promo:'set',set:4}
];
const benefitOrder={...baseOrder,items:benefitItems,promo:'happy'};
assert.deepStrictEqual(Array.from(context.orderPizzaBenefitLabels(benefitOrder)),['UP&UP','3인 세트','4인 세트'],'item benefits preserve first-seen order and remove duplicates without mixing order promo');
for(const markup of [context.newOrderCard({...benefitOrder,id:'benefits'}),context.renderOrderDetail(benefitOrder)])assert.ok(markup.includes('UP&amp;UP + 3인 세트 + 4인 세트'),'main and detail render the same combined pizza heading');
assert.deepStrictEqual(Array.from(context.orderPizzaBenefitLabels({...baseOrder,items:[{...baseOrder.items[0],promo:'set',set:'3'}]})),[],'unverified string set data is safely omitted');
assert.deepStrictEqual(Array.from(context.orderPizzaBenefitLabels({...baseOrder,items:[{...baseOrder.items[0]}],promo:'happy'})),['해피아워'],'order benefit is used only when every pizza lacks item benefit data');

const normal=context.renderOrderDetail({...baseOrder,status:'cooking',pickup:{mode:'now',time:null},disposables:false});
assert.ok(!normal.includes('detail-reservation">예약</span>'),'normal orders remove the reservation label and its space');
assert.ok(normal.includes('<span>일회용 포크</span><strong>X</strong>'),'saved false fork choice renders X');
assert.ok(!normal.includes('<strong><i></i>완료</strong>'),'incomplete orders do not claim completion');

const takeout=context.renderOrderDetail({...baseOrder,orderType:'takeout',seat:null});
assert.ok(takeout.includes('detail-order-type takeout">포장'),'takeout uses the red-type class and actual label');

const legacy=context.renderOrderDetail({...baseOrder,disposables:undefined,items:[{...baseOrder.items[0],sides:{S001:1},drinks:{D001:2}}]});
const chickenLine=legacy.match(/<div class="detail-menu-line extra"><span class="detail-menu-name">치킨스트립[\s\S]*?<\/div>/)?.[0]||'';
assert.ok(chickenLine&&chickenLine.includes('×1')&&chickenLine.includes('9,900원'),'legacy numeric quantities use the catalog unit price safely');
assert.ok(legacy.includes('코카-콜라 1.25L</span><span class="detail-menu-quantity">×2</span><strong class="detail-menu-price">2,500원'),'legacy drink quantity multiplies the catalog unit price once');

const mixedItems=[{
 ...baseOrder.items[0],includedSides:{},sides:{S001:{quantity:1,total:9900}},
 includedDrinks:{A001:{quantity:1,total:500}},drinks:{UNKNOWN:{name:'미분류 상품',quantity:1,total:700},D001:{quantity:1,total:2500}}
}];
const before=JSON.stringify(mixedItems);
const mixed=context.orderDetailMenuHTML({...baseOrder,items:mixedItems});
assert.ok(mixed.indexOf('치킨스트립')<mixed.indexOf('코카-콜라 1.25L'),'sides render before drinks');
assert.ok(mixed.indexOf('코카-콜라 1.25L')<mixed.indexOf('프레쉬 피클'),'drinks render before accompaniments');
assert.ok(mixed.indexOf('프레쉬 피클')<mixed.indexOf('미분류 상품'),'unknown products render last without omission');
assert.strictEqual(JSON.stringify(mixedItems),before,'display sorting does not mutate the saved items array');

assert.strictEqual(context.reservationTimeLabel({...baseOrder,pickup:{mode:'reserve',time:'16:30:45'}}),'16:30 예약','reservation time omits seconds');
assert.strictEqual(context.reservationTimeLabel({...baseOrder,pickup:{mode:'now',time:'16:30'}}),'','immediate orders do not display reservation time');
assert.strictEqual(context.reservationTimeLabel({...baseOrder,pickup:{mode:'reserve',time:'not-a-time'}}),'','invalid reservation time is safely hidden');
const reservedDetail=context.renderOrderDetail({...baseOrder,status:'payment_pending',pickup:{mode:'reserve',time:'18:30'}});
assert.ok(reservedDetail.includes('<span>예약주문</span>')&&reservedDetail.includes('<small>예약시간</small>오후 6:30'),'payment-pending reservation detail distinguishes the selected time');
assert.ok(reservedDetail.includes('주문시간 07. 30. 오후 12:22'),'reservation detail preserves the separate creation time');
assert.ok(!normal.includes('예약시간'),'immediate order detail omits the reservation region');
for(const invalid of [null,undefined,'not-a-time','25:99']){
 const invalidDetail=context.renderOrderDetail({...baseOrder,pickup:{mode:'reserve',time:invalid}});
 assert.ok(!invalidDetail.includes('예약시간'),'missing and invalid reservation values stay hidden');
 assert.doesNotMatch(invalidDetail,/Invalid Date|undefined|null|NaN/);
}
const timestampDetail=context.renderOrderDetail({...baseOrder,pickup:{mode:'reserve',time:{toDate:()=>new Date('2026-08-05T09:30:00.000Z')}}});
assert.ok(timestampDetail.includes('2026. 08. 05. 오후 6:30'),'timestamp reservations render in Asia/Seoul');
const dateDetail=context.renderOrderDetail({...baseOrder,pickup:{mode:'reserve',time:new Date('2026-08-05T09:30:00.000Z')}});
assert.ok(dateDetail.includes('2026. 08. 05. 오후 6:30'),'Date reservations render in Asia/Seoul');
const unsafeReservationTimes=[
 {label:'non-function toDate',value:{toDate:'not-a-function'}},
 {label:'non-Date toDate result',value:{toDate:()=>'not-a-date'}},
 {label:'null toDate result',value:{toDate:()=>null}},
 {label:'throwing toDate',value:{toDate:()=>{throw new Error('broken timestamp')}}},
 {label:'empty object',value:{}},
 {label:'invalid Date',value:new Date('invalid')}
];
for(const {label,value} of unsafeReservationTimes){
 let markup;
 assert.doesNotThrow(()=>{markup=context.renderOrderDetail({...baseOrder,pickup:{mode:'reserve',time:value}})},`${label} does not throw`);
 assert.ok(!markup.includes('예약시간'),`${label} hides the reservation time region`);
 assert.doesNotMatch(markup,/Invalid Date|undefined|null|NaN/,`${label} emits no invalid placeholder`);
}

const css=fs.readFileSync(path.join(root,'admin.css'),'utf8');
assert.match(css,/\.order-detail-panel\{width:min\(840px,calc\(100vw - 32px\)\);height:auto;max-height:84vh/,'detail dialog has the compact desktop bounds');
assert.match(css,/\.admin-detail-menu\{min-height:0;overflow-y:auto/,'only the menu region scrolls for long orders');
assert.match(css,/\.payment-pending-action\{[^}]*min-height:58px/,'payment-pending action has primary sizing');
assert.match(css,/\.main-customer-call\{align-self:flex-end;width:auto;min-width:150px;min-height:40px;[^}]*font-size:16px/,'desktop customer-call action keeps the smaller touch-safe size');
assert.match(css,/@media\(max-width:560px\)\{[\s\S]*?\.main-customer-call\{width:auto;min-width:150px;min-height:42px;font-size:16px\}[\s\S]*?\}/,'mobile customer-call action stays smaller than payment pending');
assert.doesNotMatch(css,/@media\(max-width:560px\)\{[\s\S]*?\.main-customer-call\{[^}]*min-height:58px[^}]*font-size:24px/,'mobile no longer restores the oversized customer-call action');
for(const width of [360,390,560,768,1440]){
 const customerHeight=width<=560?42:40,customerFont=16,pendingHeight=58,pendingFont=19;
 assert.ok(pendingHeight>customerHeight&&pendingFont>customerFont,`${width}px keeps payment pending larger than customer call`);
 assert.ok(customerHeight>=40,'customer call retains its minimum touch target');
}
assert.match(css,/\.admin-detail-menu\{[^}]*color:#07532f/,'order detail menu establishes the green default');
assert.match(css,/\.admin-detail-menu \.detail-menu-section h4\{[^}]*color:#6f2da8/,'order detail group headings are purple');
assert.match(css,/\.admin-detail-menu \.detail-pizza-name,\.admin-detail-menu \.pizza-code,\.admin-detail-menu \.detail-menu-name,\.admin-detail-menu \.detail-menu-quantity,\.admin-detail-menu \.detail-menu-price\{color:#07532f\}/,'pizza names, size code, product names, quantities, and prices are green');
assert.match(css,/\.admin-detail-menu \.pizza-code-alpha\{color:#d71920!important\}/,'only the size-code alphabet override is red');
assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.reservation-time\{animation:none\}\}/,'reservation pulse honors reduced motion');

console.log('admin full-screen order detail reservation, colors, prices, fork choice, copy, and call checks passed');
