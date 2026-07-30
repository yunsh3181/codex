const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const catalog=JSON.parse(html.match(/window\.KIOSK_DATA = (\{[\s\S]*?\n\});\s*<\/script>/)[1]);

test('recommendation is enabled only for normal and takeout orders',()=>{
  assert.match(html,/!\['normal','takeout'\]\.includes\(state\.promo\|\|'normal'\)/);
  assert.match(html,/function maybePromptBetterBenefit\(\)\{[\s\S]*state\.modal='betterBenefit'/);
  assert.match(html,/if\(state\.set\|\|/);
});

test('candidate totals retain every paid component and use existing settings',()=>{
  const body=html.match(/function benefitCandidatePrice\(id\)\{([\s\S]*?)\n\}\nfunction comparableBenefitIds/)[1];
  for(const component of ['sideFee()','drinkFee()','topFee()','SETTINGS.HALF_EXTRA','crustFee()'])assert.ok(body.includes(component),component);
  assert.match(body,/SETTINGS\.PACK_DISCOUNT/);
  assert.match(body,/remainingFeeAfterSetInclusions\(n\)/);
  assert.doesNotMatch(body,/31120|28500|2620|33500|1200/);
});

test('set inclusions preserve non-included extras and calculate drink upgrades from menu data',()=>{
  assert.match(html,/state\.extraSides=decrementSelection\(state\.extraSides,item\.id\)/);
  assert.match(html,/state\.extraDrinks=decrementSelection\(state\.extraDrinks,plan\.drink\.from\)/);
  assert.match(html,/upgradeValue=Math\.max\(0,Number\(large\.price\|\|0\)-selectedSmall\.price\)/);
  assert.match(html,/if\(plan\.missingSides\)\{state\.step='side'/);
  assert.match(html,/if\(plan\.missingDrink\)\{state\.step='drink'/);
});

test('recommendations are sorted by real payment saving and suppressed per order signature',()=>{
  assert.match(html,/suggestions\.sort\(\(a,b\)=>b\.saving-a\.saving\)/);
  assert.match(html,/state\.benefitPromptedKeys\.includes\(key\)/);
  assert.match(html,/extraSides:state\.extraSides,extraDrinks:state\.extraDrinks/);
  assert.match(html,/function finishFinalAdd\(\)\{state\.finalAddMode=null;if\(maybePromptBetterBenefit\(\)\)return/);
});

test('application always requires a customer action',()=>{
  assert.match(html,/onclick="applySuggestedBenefit\('\$\{b\.id\}'\)"/);
  assert.match(html,/onclick="keepCurrentBenefit\(\)"/);
  assert.doesNotMatch(html,/maybePromptBetterBenefit\(\)[\s\S]{0,80}applySuggestedBenefit/);
});

test('example 1 derives 31,120 won versus 28,500 won and saves 2,620 won from catalog data',()=>{
  const pizza=catalog.PIZZAS.find(item=>item.id==='P001');
  const crust=catalog.CRUSTS.find(item=>item.name==='치즈롤');
  const product=pizza.F+crust.F;
  const takeout=Math.round(product*(1-catalog.SETTINGS.PACK_DISCOUNT/100));
  const upup=pizza.L;
  assert.deepEqual({takeout,upup,saving:takeout-upup},{takeout:31120,upup:28500,saving:2620});
  assert.match(html,/targetValue-currentValue/);
});

test('example 2 formula preserves catalog extras and separates the 700 won drink upgrade',()=>{
  const pizza=catalog.PIZZAS.find(item=>item.id==='P001');
  const side=catalog.SIDES.find(item=>item.id==='S007');
  const small=catalog.DRINKS.find(item=>item.id==='D001');
  const large=catalog.DRINKS.find(item=>item.id==='D002');
  const current=Math.round(pizza.L*(1-catalog.SETTINGS.PACK_DISCOUNT/100))+side.price+small.price;
  const setPrice=33000;
  assert.deepEqual(
    {current,setPrice,paymentSaving:current-setPrice,upgradeValue:large.price-small.price,totalValue:current-setPrice+large.price-small.price},
    {current:34500,setPrice:33000,paymentSaving:1500,upgradeValue:700,totalValue:2200}
  );
  const specificationSidePrice=8900;
  const specifiedCurrent=Math.round(pizza.L*.8)+specificationSidePrice+small.price;
  assert.deepEqual({specifiedCurrent,paymentSaving:specifiedCurrent-setPrice,totalValue:specifiedCurrent-setPrice+large.price-small.price},{specifiedCurrent:33500,paymentSaving:500,totalValue:1200});
});

test('UP & UP half-and-half keeps the full 1,000 won fee while takeout discounts it',()=>{
  const left=catalog.PIZZAS.find(item=>item.id==='P001');
  const right=catalog.PIZZAS.find(item=>item.id==='P003');
  const crust=catalog.CRUSTS.find(item=>item.name==='치즈롤');
  const half=catalog.SETTINGS.HALF_EXTRA;
  const normalProduct=(left.F+right.F)/2+crust.F+half;
  const takeout=Math.round(normalProduct*(1-catalog.SETTINGS.PACK_DISCOUNT/100));
  const upup=(left.L+right.L)/2+half;
  assert.deepEqual({half,takeout,upup,saving:takeout-upup},{half:1000,takeout:32320,upup:30000,saving:2320});
  assert.match(html,/halfFeeIncluded/);
});
