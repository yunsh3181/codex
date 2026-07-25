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

test('home uses exact 1.15 card multiplier and rectangular promos',()=>{
  assert.ok(compact.includes('min-height:clamp(253px,18.975vh,365.7px)!important'));
  assert.ok(compact.includes('height:clamp(253px,18.975vh,365.7px)!important'));
  assert.ok(compact.includes('aspect-ratio:16/9!important'));
  assert.ok(compact.includes('.heroPromoStrip{grid-auto-rows:auto!important;align-items:start!important'));
  assert.match(html,/device-kiosk21\.css\?v=live-cart-banner-20260725/);
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

const displaySource=html.slice(html.indexOf('function cartCatalogLines'),html.indexOf('function cartItemHtml'));
const catalog={
  PIZZAS:[{id:'P1',name:'존스',L:29500},{id:'P2',name:'식스',L:27500}],
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
  assert.equal(model.categories.pizza.find(row=>row.id==='pizza').amount,28500);
  assert.equal(model.categories.pizza.find(row=>row.id==='crust').amount,4000);
  assert.equal(model.categories.pizza.find(row=>row.id==='crust').added,true);
  assert.equal(model.categories.pizza.find(row=>row.id==='half').amount,1000);
  assert.equal(model.categories.pizza.find(row=>row.id==='T1').amount,1500);
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
    assert.ok(model.categories.pizza.every(row=>row.included===false),promo);
    assert.ok(model.benefit,promo);
  }
});

test('order quantity and option quantity are multiplied exactly once',()=>{
  const unit=baseOrder({toppings:{T1:2},price:49500,normalPrice:49500,qty:2});
  const {model}=displayModel(unit);
  assert.equal(model.mode,'standard');
  assert.equal(model.total,99000);
  assert.equal(model.componentTotal,99000);
  assert.equal(model.categories.pizza.find(row=>row.id==='pizza').amount,57000);
  assert.equal(model.categories.pizza.find(row=>row.id==='crust').amount,8000);
  assert.equal(model.categories.pizza.find(row=>row.id==='T1').qty,2);
  assert.equal(model.categories.pizza.find(row=>row.id==='T1').amount,6000);
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
  assert.match(html,/function cartItemHtml\(x,i\)\{[\s\S]*?cartOrderDetailHtml\(model\)/);
  assert.match(html,/if\(currentHasItems\(\)\)arr\.push\(\{\.\.\.orderSnapshot\(\),__current:false\}\)/);
  assert.match(html,/money\(model\.total\)/);
  assert.doesNotMatch(html,/if\s*\(name\s*===\s*["']치즈롤["']\)/);
});

test('live kiosk cart detail typography applies to cart and final review',()=>{
  assert.match(css,/body:is\(\[data-step="cartReview"\], \[data-step="review"\]\) \.cartCategory h2[\s\S]*?font-size: 26px/);
  assert.match(css,/body:is\(\[data-step="cartReview"\], \[data-step="review"\]\) :where\([\s\S]*?\.cartBaseRow[\s\S]*?font-size: 24px/);
  assert.match(css,/body:is\(\[data-step="cartReview"\], \[data-step="review"\]\) \.cartDetailRow[\s\S]*?font-size: 20px/);
  assert.match(css,/body:is\(\[data-step="cartReview"\], \[data-step="review"\]\) \.cartOrderTotal[\s\S]*?font-size: 28px/);
});
