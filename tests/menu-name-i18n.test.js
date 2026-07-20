const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const languages=['ko','en','ja','zh','vi','es'];
const context={
  window:{},location:{search:''},URLSearchParams,console,
  localStorage:{getItem(){return null},setItem(){}},
  document:{documentElement:{lang:''},title:''}
};
vm.createContext(context);
for(const language of languages){
  const file=path.join(root,'i18n',`${language}.js`);
  vm.runInContext(fs.readFileSync(file,'utf8'),context,{filename:file});
}
const indexFile=path.join(root,'i18n','index.js');
vm.runInContext(fs.readFileSync(indexFile,'utf8'),context,{filename:indexFile});

const i18n=context.window.PJ_I18N;
const locales=context.window.PJ_I18N_LOCALES;
const flatten=(object,prefix='',result={})=>{
  for(const [key,value] of Object.entries(object)){
    const fullKey=prefix?`${prefix}.${key}`:key;
    if(value&&typeof value==='object')flatten(value,fullKey,result);
    else result[fullKey]=value;
  }
  return result;
};
const placeholders=value=>[...String(value).matchAll(/\{(\w+)\}/g)].map(match=>match[1]).sort();
const korean=flatten(locales.ko);

for(const language of languages){
  const locale=flatten(locales[language]);
  assert.deepStrictEqual(Object.keys(locale).sort(),Object.keys(korean).sort(),`${language} translation keys`);
  for(const key of Object.keys(korean)){
    assert.deepStrictEqual(placeholders(locale[key]),placeholders(korean[key]),`${language} placeholders at ${key}`);
  }
}

const items={
  p001:{id:'P001',name:'수퍼 파파스'},
  p004:{id:'P004',name:'스파이시 치킨랜치'},
  t001:{id:'T001',name:'2블랜드 치즈'},
  t004:{id:'T004',name:'체다치즈'},
  s001:{id:'S001',name:'바베큐립 콤보'},
  s008:{id:'S008',name:'파파스 윙'},
  d001:{id:'D001',name:'코카-콜라 500ml'},
  d009:{id:'D009',name:'프레쉬 피클'}
};
const englishPizzaNames={
  P001:"Super Papa's",P002:"John's Favorite",P003:'All Meat',P004:'Spicy Chicken Ranch',
  P005:'Irish Potato',P006:'Chicken BBQ',P007:'Ham Mushroom Six Cheese',
  P008:'Premium Grilled Bulgogi',P009:'Six Cheese',P010:'Spicy Italian',
  P011:'THIN Shrimp Alfredo',P012:'Margherita',P013:'Pepperoni',P014:'Hawaiian',P015:'Garden Special'
};

i18n.setLanguage('ko');
assert.strictEqual(i18n.pizzaName(items.p001),'수퍼 파파스');
assert.strictEqual(i18n.toppingName(items.t001),'2블랜드 치즈');
assert.strictEqual(i18n.sideName(items.s008),'파파스 윙');
assert.strictEqual(i18n.menuItemName(items.d001),'코카-콜라 500ml');
assert.strictEqual(i18n.crustName('치즈롤'),'치즈롤');

for(const language of languages.filter(language=>language!=='ko')){
  i18n.setLanguage(language);
  assert.strictEqual(i18n.t('language.title'),locales[language].language.title,`${language} UI language`);
  assert.strictEqual(i18n.pizzaName(items.p001),"Super Papa's",`${language} P001`);
  assert.strictEqual(i18n.pizzaName(items.p004),'Spicy Chicken Ranch',`${language} P004`);
  assert.strictEqual(i18n.toppingName(items.t001),'2 Blend Cheese',`${language} T001`);
  assert.strictEqual(i18n.toppingName(items.t004),'Cheddar Cheese',`${language} T004 fallback`);
  assert.strictEqual(i18n.sideName(items.s008),"Papa's Wings",`${language} S008`);
  assert.strictEqual(i18n.menuItemName(items.s001),'Barbecue Ribs Combo',`${language} S001 fallback`);
  assert.strictEqual(i18n.drinkName(items.d001),'Coca-Cola',`${language} D001`);
  assert.strictEqual(i18n.menuItemName(items.d009),'Fresh Pickles',`${language} D009 fallback`);
  assert.strictEqual(i18n.doughName('오리지널'),'Original',`${language} original dough`);
  assert.strictEqual(i18n.doughName('씬도우'),'Thin Crust',`${language} thin dough`);
  assert.strictEqual(i18n.crustName('크루아상'),'Croissant',`${language} croissant`);
  assert.strictEqual(i18n.crustName('치즈롤'),'Cheese Roll',`${language} cheese roll`);
  assert.strictEqual(i18n.crustName('골드링'),'Gold Ring',`${language} gold ring`);
  for(const [id,name] of Object.entries(englishPizzaNames)){
    assert.strictEqual(i18n.pizzaName({id,name:'한국어 원본'}),name,`${language} ${id}`);
  }
}

i18n.setLanguage('es');
assert.strictEqual(i18n.pizzaName(items.p001),"Super Papa's");
i18n.setLanguage('ko');
assert.strictEqual(i18n.pizzaName(items.p001),'수퍼 파파스','language switching must update rendered names');

const banned=[/Papa Wings/,/Hand-tossed dough/,/Thin crust/,/’/];
for(const language of languages.filter(language=>language!=='ko')){
  const source=fs.readFileSync(path.join(root,'i18n',`${language}.js`),'utf8');
  for(const pattern of banned)assert.ok(!pattern.test(source),`${language} contains ${pattern}`);
}

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dataMatch=html.match(/window\.KIOSK_DATA\s*=\s*(\{[\s\S]*?\n\});/);
assert.ok(dataMatch,'embedded kiosk data');
const dataContext={window:{}};
vm.createContext(dataContext);
vm.runInContext(`window.KIOSK_DATA=${dataMatch[1]}`,dataContext);
const data=dataContext.window.KIOSK_DATA;
const customerItems=[...data.PIZZAS,...data.TOPPINGS,...data.SIDES,...data.DRINKS,...data.SAUCES];
i18n.setLanguage('ko');
for(const item of customerItems)assert.strictEqual(i18n.menuItemName(item),item.name,`ko raw name ${item.id}`);
for(const language of languages.filter(language=>language!=='ko')){
  i18n.setLanguage(language);
  for(const item of customerItems){
    const name=i18n.menuItemName(item);
    assert.ok(name&&!/[가-힣]/.test(name),`${language} English menu name ${item.id}: ${name}`);
  }
}

const inlineScripts=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(match=>match[1]);
inlineScripts.forEach((source,index)=>assert.doesNotThrow(()=>new Function(source),`inline script ${index+1} syntax`));
for(const pattern of [/<h3>\$\{p\.name\}<\/h3>/,/\$\{po\(state\.left\)\.name\}/,/\$\{po\(state\.right\)\.name\}/,/<h3>\$\{t\.name\}<\/h3>/]){
  assert.ok(!pattern.test(html),`direct customer menu-name rendering remains: ${pattern}`);
}

console.log(`menu-name i18n: ${Object.keys(korean).length} keys × ${languages.length} languages; rendering helpers and inline scripts passed`);
