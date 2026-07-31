const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'styles/device-kiosk21.css'),'utf8');
const compact=css.replace(/\s+/g,'');

test('progress exposes completed/current buttons and locks future groups',()=>{
  assert.match(html,/class="progressStep \$\{status\}/);
  assert.match(html,/navigateProgress\('\$\{g\.id\}'\)/);
  assert.match(html,/disabled aria-disabled="true"/);
  assert.match(html,/if\(order\.indexOf\(group\)>order\.indexOf\(current\)\)return/);
  assert.doesNotMatch(html,/function navigateProgress[\s\S]{0,900}reset\(/);
  assert.ok(compact.includes('.progressStep{display:inline-flex'));
  assert.ok(compact.includes('min-height:56px'));
  assert.ok(compact.includes('font-size:20px'));
});

test('kiosk header and progress backgrounds are full width',()=>{
  assert.match(css,/html\[data-layout="kiosk21"\] :where\(\.head, \.c-header\)[\s\S]*?max-width: none !important/);
  assert.match(css,/html\[data-layout="kiosk21"\] :where\(\.progress, \.c-progress\)[\s\S]*?max-width: none !important/);
});

test('home uses exact 1.15 card multiplier and overflow-safe promos',()=>{
  assert.ok(compact.includes('min-height:clamp(253px,18.975vh,365.7px)!important'));
  assert.ok(compact.includes('height:clamp(253px,18.975vh,365.7px)!important'));
  assert.ok(compact.includes('aspect-ratio:4/3!important'));
  assert.ok(compact.includes('.heroPromoStrip{grid-auto-rows:auto!important;align-items:stretch!important'));
  assert.match(html,/device-kiosk21\.css\?v=order-review-single-screen-v17/);
  assert.doesNotMatch(css,/html\[data-layout="kiosk21"\][^{]*\.heroPromo[^{]*\{[^}]*aspect-ratio:\s*1\s*\/\s*1/);
});

test('topping continuation remains the single fixed selection footer',()=>{
  const topping=html.match(/if\(state\.step==='topping'\)[\s\S]*?if\(state\.step==='side'\)/)?.[0]||'';
  assert.match(topping,/selectionFooter\('finishTopping\(\)'/);
  assert.equal((topping.match(/finishTopping\(\)/g)||[]).length,1);
  assert.match(css,/body:is\([\s\S]*?\[data-step="topping"\][\s\S]*?:where\(\.cartbar/);
});

test('reservation controls and selected value are kiosk-sized',()=>{
  assert.match(html,/class="reserveCards"/);
  assert.match(html,/class="reserveSelection"/);
  assert.ok(compact.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
  assert.ok(compact.includes('.reserveCard>b{display:block'));
  assert.ok(compact.includes('font-size:30px'));
  assert.ok(compact.includes('.reserveSelectionb{color:#d71920;font-size:48px'));
});

const displaySource=html.slice(html.indexOf('function cartCatalogLines'),html.indexOf('function changeCartQty'));
const catalog={
  PIZZAS:[{id:'P1',name:'존스',L:29500},{id:'P2',name:'식스',L:27500},{id:'P3',name:'수퍼 파파스',L:28500}],
  CRUSTS:[{name:'오리지널',L:0},{name:'치즈롤',L:4000}],
  TOPPINGS:[{id:'T1',name:'양파',price:{L:1500}}],
  SIDES:[{id:'S1',name:'치킨',price:9900},{id:'S2',name:'코울슬로',price:2500}],
  DRINKS:[{id:'D1',name:'제로콜라',price:2500},{id:'D2',name:'콜라',price:1800}],
  SAUCES:[{id:'A1',name:'피클',price:600}],
  SETTINGS:{HALF_EXTRA:1000}
};
function displayModel(order){
  const input=structuredClone(order);
  const context={
    ...catalog,
    order:input,
    po:id=>catalog.PIZZAS.find(item=>item.id===id),
    optionDisplayName:item=>item.name,
    cartPizzaNames:x=>x.mode==='half'?'존스 / 식스':'존스',
    customerDoughLabel:value=>value==='오리지널'?'클래식':value,
    customerSizeLabel:value=>({R:'레귤러',L:'라지',F:'패밀리사이즈'}[value]||value),
    customerCrustLabel:value=>value,
    setOrderName:value=>`${value}인 세트`,
    benefitName:value=>value,
    t:key=>key
  };
  vm.runInNewContext(`${displaySource};result=buildCartDisplayModel(order)`,context);
  return {model:structuredClone(context.result),input};
}
function baseOrder(overrides={}){
  return {promo:'normal',set:null,size:'L',mode:'half',pizzaLeft:'P1',pizzaRight:'P2',crust:'치즈롤',toppings:{T1:1},sides:{S1:1},drinks:{D1:1,A1:1},includedSides:{},includedDrinks:{},discount:0,normalPrice:48000,price:48000,qty:1,...overrides};
}

test('standard cart breakdown is used only when every component equals stored price',()=>{
  const order=baseOrder();
  const before=structuredClone(order),{model,input}=displayModel(order);
  assert.equal(model.mode,'standard');
  assert.equal(model.componentTotal,48000);
  assert.equal(model.total,48000);
  assert.equal(model.categories.pizza.find(row=>row.id==='pizza').amount,null);
  assert.deepEqual(model.meta,{dough:'클래식',size:'라지',crust:'치즈롤',composition:'cart.halfPizza'});
  assert.equal(model.categories.toppings.find(row=>row.id==='T1').amount,1500);
  assert.equal(model.categories.toppings.find(row=>row.id==='T1').qty,1);
  assert.deepEqual(input,before);
});

test('set cart consolidates included and paid side and drink categories',()=>{
  const {model}=displayModel(baseOrder({promo:'set',set:2,price:35000,normalPrice:35000,includedSides:{S2:1},sides:{S1:1},includedDrinks:{D2:1},drinks:{D1:1,A1:1}}));
  assert.equal(model.mode,'promotion-safe');
  assert.equal(model.total,35000);
  assert.deepEqual(model.categories.sides.map(row=>[row.id,row.included]),[['S2',true],['S1',false]]);
  assert.deepEqual(model.categories.drinks.map(row=>[row.id,row.included]),[['D2',true],['D1',false]]);
  assert.equal(model.categories.sides[0].amount,0);
  assert.equal(model.categories.sides[1].added,false);
  assert.deepEqual(model.categories.accompaniment.map(row=>row.id),['A1']);
  assert.equal(model.categories.drinks.some(row=>row.id==='A1'),false);
  assert.equal(model.categories.accompaniment.some(row=>row.id==='D1'),false);
});

test('promotions never expose contradictory catalog pizza prices',()=>{
  for(const [promo,price,discount] of [['upup',29500,6000],['takeout',38400,9600],['happy',17100,14000]]){
    const {model}=displayModel(baseOrder({promo,price,normalPrice:price+discount,discount}));
    assert.equal(model.mode,'promotion-safe',promo);
    assert.equal(model.total,price,promo);
    assert.ok(model.categories.pizza.every(row=>row.amount===null),promo);
    assert.ok(model.categories.toppings.every(row=>row.amount!==null),promo);
    assert.ok(model.categories.pizza.every(row=>row.included===false),promo);
    assert.ok(model.benefit,promo);
  }
});

test('takeout half pizza exposes the exact component and payment breakdown',()=>{
  const {model}=displayModel(baseOrder({
    promo:'takeout',
    pizzaLeft:'P3',
    pizzaRight:'P2',
    toppings:{},
    sides:{S1:1},
    drinks:{D1:1,A1:1},
    normalPrice:46000,
    price:39400,
    discount:6600,
    discountLabel:'포장 20% 할인'
  }));
  assert.deepEqual(model.priceBreakdown,{
    kind:'pizza',
    size:'라지',
    crust:'치즈롤',
    base:28000,
    crustFee:4000,
    halfFee:1000,
    toppingFee:0,
    normal:33000,
    discount:6600,
    final:26400,
    benefit:'포장 20% 할인'
  });
  assert.equal(model.priceBreakdown.final+model.categories.sides[0].amount+model.categories.drinks[0].amount+model.categories.accompaniment[0].amount,model.total);
});

test('whole, normal, UP & UP, happy hour, and set use stored discounts without duplicate extras',()=>{
  const whole=displayModel(baseOrder({mode:'single',pizzaRight:null,crust:'오리지널',toppings:{},sides:{},drinks:{},normalPrice:29500,price:29500})).model.priceBreakdown;
  assert.equal(whole.base,29500);
  assert.equal(whole.halfFee,0);
  assert.equal(whole.discount,0);
  for(const [promo,normal,price,discount] of [['upup',35000,29500,5500],['happy',29500,15000,14500]]){
    const pricing=displayModel(baseOrder({promo,mode:'single',pizzaRight:null,crust:'오리지널',toppings:{},sides:{},drinks:{},normalPrice:normal,price,discount})).model.priceBreakdown;
    assert.equal(pricing.discount,discount,promo);
    assert.equal(pricing.final,pricing.normal-discount,promo);
  }
  const set=displayModel(baseOrder({promo:'set',set:2,normalPrice:42000,price:35000,discount:7000,includedSides:{S2:1},includedDrinks:{D2:1}})).model.priceBreakdown;
  assert.deepEqual(set,{kind:'set',normal:29000,discount:7000,final:22000,benefit:'set'});
});

test('order quantity and option quantity are multiplied exactly once',()=>{
  const unit=baseOrder({toppings:{T1:2},price:49500,normalPrice:49500,qty:2});
  const {model}=displayModel(unit);
  assert.equal(model.mode,'standard');
  assert.equal(model.total,99000);
  assert.equal(model.componentTotal,99000);
  assert.equal(model.categories.pizza.find(row=>row.id==='pizza').amount,null);
  assert.equal(model.categories.toppings.find(row=>row.id==='T1').qty,4);
  assert.equal(model.categories.toppings.find(row=>row.id==='T1').amount,6000);
  assert.equal(model.categories.sides[0].amount,19800);
  assert.equal(model.categories.drinks[0].amount,5000);
  assert.equal(model.categories.accompaniment[0].amount,1200);
});

test('cart renderer emits each consolidated category at most once',()=>{
  assert.match(html,/function buildCartDisplayModel\(order\)/);
  assert.match(html,/function cartOrderDetailHtml\(model\)/);
  assert.equal((html.match(/cartCategoryHtml\(sideTitle/g)||[]).length,1);
  assert.equal((html.match(/cartCategoryHtml\(drinkTitle/g)||[]).length,1);
  assert.equal((html.match(/cartCategoryHtml\(t\('ui\.drinkScreen\.accompanimentTitle'\)/g)||[]).length,1);
  assert.match(html,/cartCategoryHtml\(sideTitle,model\.categories\.sides,true\)/);
  assert.match(html,/cartCategoryHtml\(drinkTitle,model\.categories\.drinks,true\)/);
  assert.match(html,/cartCategoryHtml\(t\('ui\.drinkScreen\.accompanimentTitle'\),model\.categories\.accompaniment,true\)/);
  assert.match(html,/function reviewOrderCard\(order,index\)\{const model=buildCartDisplayModel\(order\)/);
  assert.match(html,/function allReviewOrders\(\)\{return \(state\.cartItems\|\|\[\]\)\.map/);
  assert.doesNotMatch(html,/function cartItemHtml\(/);
  assert.match(html,/money\(model\.total\)/);
  assert.doesNotMatch(html,/if\s*\(name\s*===\s*["']치즈롤["']\)/);
});

test('pizza detail order and labels use dedicated review translations',()=>{
  const detail=html.slice(html.indexOf('function cartPizzaMetaHtml'),html.indexOf('function changeCartQty'));
  const pizzaCategory=detail.indexOf('function cartPizzaCategoryHtml');
  const heading=detail.indexOf("<h2>${t('ui.summary.pizza')}</h2>");
  const meta=detail.indexOf('cartPizzaMetaHtml(model.meta)');
  const pizzaTopping=detail.indexOf("t('review.pizzaToppingLabel')");
  assert.ok(pizzaCategory>=0&&heading>pizzaCategory&&meta>heading&&pizzaTopping>meta);
  for(const key of ['review.doughTypeLabel','review.sizeLabel','review.crustTypeLabel','review.compositionLabel','review.pizzaToppingLabel','review.toppingAddTitle']){
    assert.ok(detail.includes(`t('${key}')`),key);
  }
  assert.doesNotMatch(detail,/ui\.pizzaOptions\.composition/);
  assert.match(detail,/\$\{row\.name\}×\$\{row\.qty\}/);
  const pizzaMarkup=detail.slice(detail.indexOf('function cartPizzaCategoryHtml'),detail.indexOf('function cartCategoryHtml'));
  assert.doesNotMatch(pizzaMarkup,/cartItemPrice|cartMoney|row\.amount/);
});

test('live kiosk cart detail typography applies to cart and final review',()=>{
  assert.match(css,/body\[data-step="review"\] \.cartCategory h2[\s\S]*?font-size: 26px/);
  assert.match(css,/body\[data-step="review"\] :where\([\s\S]*?\.cartBaseRow[\s\S]*?font-size: 24px/);
  assert.match(css,/body\[data-step="review"\] \.cartDetailRow[\s\S]*?font-size: 20px/);
  assert.match(css,/body\[data-step="review"\] \.cartOrderTotal[\s\S]*?font-size: 28px/);
});
