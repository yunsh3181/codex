(function(global){
 const synth=global.speechSynthesis;
 const KOREAN_LANG=/^ko(?:[-_]KR)?$/i;
 const KO_KR_LANG=/^ko[-_]KR$/i;
 const FEMALE_NAME=/(?:female|여성|sunhi|heami|yuna|sora|seoyeon|유나|서연)/i;
 const settings=Object.freeze({lang:'ko-KR',rate:.92,pitch:1.05,volume:1});
 let preferredKoreanVoice=null;

 function getPreferredKoreanVoice(){
  const voices=synth?.getVoices?.()||[];
  preferredKoreanVoice=
   voices.find(voice=>KOREAN_LANG.test(voice.lang||'')&&/sunhi/i.test(voice.name||''))||
   voices.find(voice=>KOREAN_LANG.test(voice.lang||'')&&/heami/i.test(voice.name||''))||
   voices.find(voice=>KO_KR_LANG.test(voice.lang||'')&&/microsoft/i.test(`${voice.name||''} ${voice.voiceURI||''}`)&&FEMALE_NAME.test(`${voice.name||''} ${voice.voiceURI||''}`))||
   voices.find(voice=>KO_KR_LANG.test(voice.lang||'')&&FEMALE_NAME.test(`${voice.name||''} ${voice.voiceURI||''}`))||
   voices.find(voice=>KO_KR_LANG.test(voice.lang||''))||
   voices.find(voice=>/^ko/i.test(voice.lang||''))||
   null;
  return preferredKoreanVoice;
 }

 function getVoiceForLanguage(lang){
  if(KOREAN_LANG.test(lang||''))return getPreferredKoreanVoice();
  const prefix=String(lang||'').split(/[-_]/)[0].toLowerCase();
  return (synth?.getVoices?.()||[]).find(voice=>String(voice.lang||'').toLowerCase().startsWith(prefix))||null;
 }

 function createSpeechUtterance(text,options={}){
  const lang=options.lang||settings.lang;
  const utterance=new global.SpeechSynthesisUtterance(text);
  utterance.lang=lang;
  utterance.rate=settings.rate;
  utterance.pitch=settings.pitch;
  utterance.volume=settings.volume;
  const voice=getVoiceForLanguage(lang);
  if(voice)utterance.voice=voice;
  console.info('[Speech]',voice?.name||'browser default');
  return utterance;
 }

 getPreferredKoreanVoice();
 synth?.addEventListener?.('voiceschanged',getPreferredKoreanVoice);
 global.PJSpeech={settings,getPreferredKoreanVoice,createSpeechUtterance};
})(window);
