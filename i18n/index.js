var SUPPORTED_LANGUAGES=['ko','en','ja','zh','vi'];
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

function optionKey(prefix,value){
 const slug=String(value||'').replace(/[^A-Za-z0-9]+/g,'_').replace(/^_+|_+$/g,'').toLowerCase();
 return `${prefix}.${slug}`;
}
function doughName(value){return t(optionKey('dough.name',value),{value})}
function doughDesc(value){return t(optionKey('dough.desc',value),{value})}
function sizeName(value){return t(optionKey('size.name',value),{value})}
function sizeDesc(value){return t(optionKey('size.desc',value),{value})}
function crustName(value){return t(optionKey('crust.name',value),{value})}
function crustDesc(value){return t(optionKey('crust.desc',value),{value})}
function crustSizeLabel(value){return t(optionKey('crust.sizeLabel',value),{value})}
function menuOptionId(item){return item&&item.i18nId?item.i18nId:item&&item.id?String(item.id):''}
function toppingName(item){const id=menuOptionId(item);const v=t(`topping.${id}.name`);return v===`topping.${id}.name`?(item&&item.name?item.name:id):v}
function toppingDesc(item){return t(`topping.${menuOptionId(item)}.desc`)}
function toppingCategory(item){return t(`topping.${menuOptionId(item)}.category`)}
function toppingPriceLabel(item,price){return t('topping.priceLabel',{price:price==null?'':price})}
function sideName(item){const id=menuOptionId(item);const v=t(`side.${id}.name`);return v===`side.${id}.name`?(item&&item.name?item.name:id):v}
function sideDesc(item){return t(`side.${menuOptionId(item)}.desc`)}
function sideCategory(item){return t(`side.${menuOptionId(item)}.category`)}
function sidePriceLabel(item,price){return t('side.priceLabel',{price:price==null?'':price})}
function drinkName(item){const id=menuOptionId(item);const v=t(`drink.${id}.name`);return v===`drink.${id}.name`?(item&&item.name?item.name:id):v}
function drinkDesc(item){return t(`drink.${menuOptionId(item)}.desc`)}
function drinkCategory(item){return t(`drink.${menuOptionId(item)}.category`)}
function drinkPriceLabel(item,price){return t('drink.priceLabel',{price:price==null?'':price})}
function drinkGroupName(item){return t(`drink.group.${item&&item.brand?item.brand:'other'}`)}
function currentLanguageCode(){return currentLanguage}
function drinkVariant(item){return t(`drink.${menuOptionId(item)}.variant`)}
function pizzaName(item){const id=menuOptionId(item);const translated=id?t(`pizza.${id}.name`):'';return translated&&translated!==`pizza.${id}.name`?translated:(item&&item.name?item.name:id)}
function setLanguage(lang,opts={}){
 currentLanguage=SUPPORTED_LANGUAGES.includes(lang)?lang:DEFAULT_LANGUAGE;
 if(opts.persist){try{localStorage.setItem(LANGUAGE_STORAGE_KEY,currentLanguage)}catch(e){}}
 document.documentElement.lang=t('meta.htmlLang');
 document.title=t('meta.title');
}
setLanguage(currentLanguage);
window.PJ_I18N={SUPPORTED_LANGUAGES,DEFAULT_LANGUAGE,LANGUAGE_STORAGE_KEY,I18N,LOGIC_LABEL_KEYS,readInitialLanguage,translationValue,interpolate,t,label,setLanguage,optionKey,doughName,doughDesc,sizeName,sizeDesc,crustName,crustDesc,crustSizeLabel,toppingName,toppingDesc,toppingCategory,toppingPriceLabel,sideName,sideDesc,sideCategory,sidePriceLabel,drinkName,drinkDesc,drinkCategory,drinkPriceLabel,drinkGroupName,drinkVariant,pizzaName,currentLanguage:currentLanguageCode};
