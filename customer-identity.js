(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.PJCustomerIdentity=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const FOREIGN_LANGUAGES=new Set(['en','ja','zh','vi','es']);
 const MAX_DISPLAY_NAME_LENGTH=10;
 const CONTROL=/[\u0000-\u001f\u007f-\u009f]/gu;
 const TAGS=/<[^>]*>/gu;
 const SCRIPT=/<script\b[^>]*>[\s\S]*?<\/script\s*>/giu;
 const graphemes=value=>typeof Intl!=='undefined'&&Intl.Segmenter
  ?Array.from(new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(value),part=>part.segment)
  :Array.from(value);
 function normalizeLanguage(value){const language=String(value||'').trim().toLowerCase().replace(/_/g,'-');return ({ko:'ko','ko-kr':'ko',en:'en','en-us':'en',es:'es','es-es':'es',ja:'ja','ja-jp':'ja',zh:'zh','zh-cn':'zh','zh-hans':'zh','zh-hans-cn':'zh',vi:'vi','vi-vn':'vi'})[language]||'ko'}
 function sanitizeDisplayName(value){return String(value??'').replace(SCRIPT,'').replace(TAGS,'').replace(CONTROL,'').replace(/\s+/gu,' ').trim()}
 function validateDisplayName(value){const valueSanitized=sanitizeDisplayName(value),length=graphemes(valueSanitized).length;return {valid:length>=1&&length<=MAX_DISPLAY_NAME_LENGTH,value:valueSanitized,length}}
 function identityFor({language,name,phoneLast4}){const normalized=normalizeLanguage(language);if(!FOREIGN_LANGUAGES.has(normalized))return {customerIdentityType:'phone_last4',phoneLast4:String(phoneLast4||'')};const checked=validateDisplayName(name);return checked.valid?{customerIdentityType:'name',customerDisplayName:checked.value}:null}
 const KEYBOARDS={
  en:['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'],
  zh:['QWERTYUIOP','ASDFGHJKL','ZXCVBNM'],
  es:['QWERTYUIOP','ASDFGHJKLÑ','ZXCVBNMÁÉÍÓÚÜ'],
  vi:['QWERTYUIOPĂÂÊÔƠƯ','ASDFGHJKLĐ','ZXCVBNMÁÀẢÃẠÉÈẺẼẸÍÌỈĨỊÓÒỎÕỌÚÙỦŨỤÝỲỶỸỴ'],
  ja:['あいうえおかきくけこ','さしすせそたちつてと','なにぬねのはひふへほ','まみむめもやゆよらりるれろ','わをんアイウエオカキクケコ']
 };
 function keyboardRows(language){return KEYBOARDS[normalizeLanguage(language)]||KEYBOARDS.en}
 return {FOREIGN_LANGUAGES,MAX_DISPLAY_NAME_LENGTH,normalizeLanguage,sanitizeDisplayName,validateDisplayName,identityFor,keyboardRows,graphemes};
});
