var SUPPORTED_LANGUAGES=['ko','en','ja','zh','vi','es'];
var DEFAULT_LANGUAGE='ko';
var LANGUAGE_STORAGE_KEY='pj_kiosk_language';
var I18N=window.PJ_I18N_LOCALES||{};
var LOGIC_LABEL_KEYS={
  orderType:{takeout:'orderType.takeout',dinein:'orderType.dinein'},
  promo:{normal:'promo.normal',takeout:'promo.takeout',happy:'promo.happy',upup:'promo.upup',set:'promo.set'},
  dough:{'오리지널':'dough.original','씬도우':'dough.thin','크루아상':'dough.croissant'},
  crust:{'오리지널':'crust.original','치즈롤':'crust.cheeseRoll','골드링':'crust.goldRing','씬':'crust.thin','씬도우':'crust.thin','크루아상':'crust.croissant'},
  size:{R:'size.R',L:'size.L',F:'size.F'},
  payment:{cash:'payment.cash',card:'payment.card',meal_ticket:'payment.meal_ticket',bizle:'payment.bizle'}
};
var MENU_I18N_IDS={
  topping:{T001:'t2',T002:'t1',T003:'t0',T005:'t6',T006:'t4',T007:'t3',T008:'t7',T009:'t8',T010:'t5',T011:'t15',T012:'t16',T013:'t9',T014:'t11',T015:'t14',T016:'t13',T017:'t10',T018:'t12'},
  side:{S003:'brownie',S004:'meatpasta',S005:'whitepasta',S006:'rosepasta',S007:'strips',S008:'wings',S009:'coleslaw',S010:'corn',S011:'cheesesticks',S012:'baconsticks',S013:'breadsticks'},
  drink:{D001:'coke-500',D002:'coke-125',D003:'coke-zero-500',D004:'coke-zero-15',D005:'sprite-500',D006:'sprite-15',D007:'sprite-zero-500',D008:'sprite-zero-15'}
};
var ENGLISH_MENU_NAMES_BY_ID={
  T004:'Cheddar Cheese',S001:'Barbecue Ribs Combo',S002:'Mega Chocolate Chip Cookie',
  D009:'Fresh Pickles',D010:'Garlic Dipping Sauce',D011:'Honey Mustard Sauce',D012:'Hot Sauce'
};
var warnedMissingI18nKeys=new Set();
function readInitialLanguage(){
 const params=new URLSearchParams(location.search);
 let saved='';
 try{saved=localStorage.getItem(LANGUAGE_STORAGE_KEY)||''}catch(e){}
 const requested=params.get('lang')||saved||DEFAULT_LANGUAGE;
 return SUPPORTED_LANGUAGES.includes(requested)?requested:DEFAULT_LANGUAGE;
}
var currentLanguage=readInitialLanguage();
function translationValue(lang,key){
 return key.split('.').reduce((obj,part)=>obj&&Object.prototype.hasOwnProperty.call(obj,part)?obj[part]:undefined,I18N[lang]);
}
function warnMissingI18nKey(lang,key){
 const id=lang+':'+key;
 if(warnedMissingI18nKeys.has(id))return;
 warnedMissingI18nKeys.add(id);
 console.warn('[i18n] missing translation key',key,'for language',lang);
}
function interpolate(template,vars={}){
 return String(template).replace(/\{(\w+)\}/g,(match,name)=>Object.prototype.hasOwnProperty.call(vars,name)?vars[name]:match);
}
function t(key,vars={}){
 let value=translationValue(currentLanguage,key);
 if(value===undefined){
  warnMissingI18nKey(currentLanguage,key);
  value=translationValue(DEFAULT_LANGUAGE,key);
 }
 if(value===undefined){
  warnMissingI18nKey(DEFAULT_LANGUAGE,key);
  value=key;
 }
 return interpolate(value,vars);
}
function label(group,value,fallback=value){
 const key=LOGIC_LABEL_KEYS[group]?.[value];
 return key?t(`labels.${key}`):fallback;
}

function menuTranslationValue(key,fallback=''){
 const lang=currentLanguage===DEFAULT_LANGUAGE?DEFAULT_LANGUAGE:'en';
 const primary=translationValue(lang,key);
 if(primary!==undefined)return primary;
 const selected=translationValue(currentLanguage,key);
 return selected!==undefined?selected:fallback;
}
function menuLabel(group,value,fallback=value){
 const key=LOGIC_LABEL_KEYS[group]?.[value];
 return key?menuTranslationValue(`labels.${key}`,fallback):fallback;
}

function optionKey(prefix,value){
 const slug=String(value||'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toLowerCase();
 return `${prefix}.${slug}`;
}
function doughName(value){const key=LOGIC_LABEL_KEYS.dough?.[value];return key?menuTranslationValue(`labels.${key}`,value):menuTranslationValue(optionKey('dough.name',value),value)}
function doughDesc(value){return t(optionKey('dough.desc',value),{value})}
function sizeName(value){return t(optionKey('size.name',value),{value})}
function sizeDesc(value){return t(optionKey('size.desc',value),{value})}
function crustName(value){const key=LOGIC_LABEL_KEYS.crust?.[value];return key?menuTranslationValue(`labels.${key}`,value):menuTranslationValue(optionKey('crust.name',value),value)}
function crustDesc(value){return t(optionKey('crust.desc',value),{value})}
function crustSizeLabel(value){return t(optionKey('crust.sizeLabel',value),{value})}
function menuOptionId(item){return item&&item.i18nId?item.i18nId:item&&item.id?String(item.id):''}
function translatedMenuName(section,item){
 const id=menuOptionId(item);if(!id)return item&&item.name?item.name:'';
 if(currentLanguage===DEFAULT_LANGUAGE)return item&&item.name?item.name:menuTranslationValue(`${section}.${id}.name`,id);
 const i18nId=MENU_I18N_IDS[section]?.[id]||id;
 const key=`${section}.${i18nId}.name`;
 return translationValue('en',key)??ENGLISH_MENU_NAMES_BY_ID[id]??translationValue(currentLanguage,key)??(item&&item.name?item.name:id);
}
function toppingName(item){return translatedMenuName('topping',item)}
function toppingDesc(item){return t(`topping.${menuOptionId(item)}.desc`)}
function toppingCategory(item){return t(`topping.${menuOptionId(item)}.category`)}
function toppingPriceLabel(item,price){return t('topping.priceLabel',{price:price==null?'':price})}
function sideName(item){return translatedMenuName('side',item)}
function sideDesc(item){return t(`side.${menuOptionId(item)}.desc`)}
function sideCategory(item){return t(`side.${menuOptionId(item)}.category`)}
function sidePriceLabel(item,price){return t('side.priceLabel',{price:price==null?'':price})}
function drinkName(item){return translatedMenuName('drink',item)}
function drinkDesc(item){return t(`drink.${menuOptionId(item)}.desc`)}
function drinkCategory(item){return t(`drink.${menuOptionId(item)}.category`)}
function drinkPriceLabel(item,price){return t('drink.priceLabel',{price:price==null?'':price})}
function drinkGroupName(item){return t(`drink.group.${item&&item.brand?item.brand:'other'}`)}
function currentLanguageCode(){return currentLanguage}
function drinkVariant(item){return t(`drink.${menuOptionId(item)}.variant`)}
function pizzaName(item){return translatedMenuName('pizza',item)}
function menuItemName(item){
 const id=menuOptionId(item);if(!id)return item&&item.name?item.name:'';
 if(currentLanguage===DEFAULT_LANGUAGE)return item&&item.name?item.name:id;
 if(ENGLISH_MENU_NAMES_BY_ID[id])return ENGLISH_MENU_NAMES_BY_ID[id];
 if(/^P\d+$/i.test(id))return pizzaName(item);
 if(/^T\d+$/i.test(id))return toppingName(item);
 if(/^S\d+$/i.test(id))return sideName(item);
 if(/^D\d+$/i.test(id))return drinkName(item);
 return item&&item.name?item.name:id;
}
function setLanguage(lang,opts={}){
 currentLanguage=SUPPORTED_LANGUAGES.includes(lang)?lang:DEFAULT_LANGUAGE;
 if(opts.persist){try{localStorage.setItem(LANGUAGE_STORAGE_KEY,currentLanguage)}catch(e){}}
 document.documentElement.lang=t('meta.htmlLang');
 document.title=t('meta.title');
}
setLanguage(currentLanguage);
window.PJ_I18N={SUPPORTED_LANGUAGES,DEFAULT_LANGUAGE,LANGUAGE_STORAGE_KEY,I18N,LOGIC_LABEL_KEYS,MENU_I18N_IDS,ENGLISH_MENU_NAMES_BY_ID,readInitialLanguage,translationValue,interpolate,t,label,menuTranslationValue,menuLabel,setLanguage,optionKey,doughName,doughDesc,sizeName,sizeDesc,crustName,crustDesc,crustSizeLabel,toppingName,toppingDesc,toppingCategory,toppingPriceLabel,sideName,sideDesc,sideCategory,sidePriceLabel,drinkName,drinkDesc,drinkCategory,drinkPriceLabel,drinkGroupName,drinkVariant,pizzaName,menuItemName,currentLanguage:currentLanguageCode};
