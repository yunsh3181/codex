const assert=require('assert');
const fs=require('fs');
const path=require('path');
const test=require('node:test');
const vm=require('vm');

const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');
const dataMatch=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);
assert.ok(dataMatch,'embedded kiosk catalog exists');
const dataContext={window:{}};
vm.createContext(dataContext);
vm.runInContext(`window.KIOSK_DATA=${dataMatch[1]}`,dataContext);
const catalog=dataContext.window.KIOSK_DATA;

function sourceBetween(start,end){
 const from=html.indexOf(start),to=html.indexOf(end,from);
 assert.ok(from>=0&&to>from,`${start} source exists`);
 return html.slice(from,to);
}

test('croissant surcharge comes from the option catalog and is shared by live and cart pricing',()=>{
 const fee=sourceBetween('function pizzaOptionFee','function buildCartDisplayModel');
 const context={Number,CRUSTS:catalog.CRUSTS};
 vm.createContext(context);
 vm.runInContext(fee,context);
 assert.strictEqual(context.pizzaOptionFee('크루아상','오리지널','L'),6000);
 assert.strictEqual(context.pizzaOptionFee('오리지널','오리지널','L'),0);
 assert.match(html,/function crustFee\(\).*pizzaOptionFee\(state\.dough,state\.crust,state\.size\)/);
 assert.match(html,/const crustUnit=left\?pizzaOptionFee\(order\.dough,order\.crust,size\):0/);
 assert.match(html,/price:pricing\.total/,'cart snapshot stores the surcharge-inclusive total');
 assert.match(html,/totalAmount:finalTotal,total:finalTotal/,'payment and Firestore totals use the same cart total');
});

test('quantity multiplies the stored surcharge-inclusive line total',()=>{
 const croissant=catalog.CRUSTS.find(item=>item.name==='크루아상');
 assert.strictEqual(croissant.L*2,12000);
 assert.match(html,/total:storedUnit\*qty/);
 assert.match(html,/total:\(x\.price\|\|0\)\*\(x\.qty\|\|1\)/);
});

test('regular takeout renders guidance without a zero-valued discount row',()=>{
 const breakdown=sourceBetween('function cartPizzaPriceBreakdownHtml','function cartCategoryHtml');
 assert.match(breakdown,/pricing\.discount\?line/);
 assert.match(breakdown,/ui\.sizeScreen\.discountUnavailable/);
 assert.doesNotMatch(breakdown,/line\(t\('review\.benefitDiscount'[^\n]+pricing\.discount,'discount'\)\}\$\{line/);
 assert.match(html,/totals\.discount\?`<div class="line totalDiscount"/);
});

test('happy-hour boundaries use the injected instant in Asia\/Seoul',()=>{
 const source=sourceBetween('function seoulMinutes','function validHappyReserveTime');
 const context={Intl,Date,Number,String,SETTINGS:catalog.SETTINGS};
 vm.createContext(context);
 vm.runInContext(source,context);
 const atKst=(hour,minute)=>new Date(Date.UTC(2026,6,20,hour-9,minute));
 assert.strictEqual(context.happyHourPhase(atKst(15,59)),'before');
 assert.strictEqual(context.happyHourPhase(atKst(16,0)),'active');
 assert.strictEqual(context.happyHourPhase(atKst(19,59)),'active');
 assert.strictEqual(context.happyHourPhase(atKst(20,0)),'closed');
});

test('happy-hour recommendation is limited to eligible regular takeout and reuses promo transition',()=>{
 assert.match(html,/state\.orderType==='takeout'&&state\.promo==='takeout'&&state\.size==='R'&&state\.mode==='single'&&isHappyHourNow\(\)&&Number\(po\(state\.left\)\?\.R\)>0/);
 assert.match(html,/function changeToHappyHour\(\).*pickPromo\('happy'\)/);
 assert.match(html,/state\.happyRecommendationKey===happyRecommendationSignature\(\)/);
 assert.match(html,/function keepTakeoutRegular\(\).*state\.happyRecommendationKey=happyRecommendationSignature\(\)/);
 assert.match(html,/money\(SETTINGS\.HAPPY_PRICE\)/);
});
