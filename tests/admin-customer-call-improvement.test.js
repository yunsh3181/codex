const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const source=fs.readFileSync(path.join(__dirname,'..','admin.js'),'utf8');
const digitSource=source.match(/const KOREAN_DIGIT_SPEECH[\s\S]*?\n}/)?.[0];
assert.ok(digitSource,'Korean digit speech formatter exists');
const digitContext={String,Object,spokenOrderNumber:value=>String(value).replace(/^[PD](?=\d)/,'')};
vm.createContext(digitContext);
vm.runInContext(digitSource,digitContext);
for(const [input,expected] of [['9999','구, 구, 구, 구'],['4324','사, 삼, 이, 사'],['1020','일, 공, 이, 공'],['0071','공, 공, 칠, 일'],['7','칠'],['12345','일, 이, 삼, 사, 오'],['P4324','사, 삼, 이, 사'],['invalid','']]){
 assert.strictEqual(digitContext.spokenKoreanOrderNumber(input),expected);
}

let voices=[];
let voicesChanged;
const voiceSource=source.match(/const ADMIN_KOREAN_VOICE_PRIORITY[\s\S]*?addEventListener\?\.\('voiceschanged',[^\n]*/)?.[0];
assert.ok(voiceSource,'admin voice priority and late-load listener exist');
const voiceContext={String,window:{speechSynthesis:{getVoices:()=>voices,addEventListener(event,handler){if(event==='voiceschanged')voicesChanged=handler}}}};
vm.createContext(voiceContext);
vm.runInContext(voiceSource,voiceContext);
assert.strictEqual(voiceContext.selectAdminKoreanVoice(),null,'empty voice list safely falls back');
voices=[{name:'Default English',lang:'en-US',default:true},{name:'Generic Korean',lang:'ko-KR',localService:true},{name:'Microsoft SunHi Online (Natural) - Korean (Korea)',lang:'ko-KR',localService:false}];
voicesChanged();
assert.match(voiceContext.selectAdminKoreanVoice().name,/Microsoft SunHi/,'preferred clear Windows Korean voice wins explicit priority');
voices=[{name:'Default English',lang:'en-US',default:true},{name:'Local Korean',lang:'ko-KR',localService:true}];
assert.strictEqual(voiceContext.selectAdminKoreanVoice().name,'Local Korean','another local ko-KR voice is the next fallback');
voices=[{name:'Broad Korean',lang:'ko',localService:true},{name:'Default English',lang:'en-US',default:true}];
assert.strictEqual(voiceContext.selectAdminKoreanVoice().name,'Broad Korean','generic ko voice is accepted');
voices=[{name:'Default English',lang:'en-US',default:true}];
assert.strictEqual(voiceContext.selectAdminKoreanVoice().name,'Default English','browser default is the final safe fallback');

console.log('admin Korean digit speech and voice fallback checks passed');
