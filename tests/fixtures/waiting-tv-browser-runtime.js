(function(){
 const subscriptions={},rows={publicOrderDisplays:[],manualCustomerCalls:[]};
 try{rows.publicOrderDisplays=JSON.parse(sessionStorage.getItem('pjTvFixtureInitial')||'[]')}catch(error){}
 const snapshot=name=>({docs:rows[name].map(item=>({id:item.id,data:()=>({...item,updatedAt:{toMillis:()=>item.updatedAt}})})),metadata:{fromCache:false}});
 const emit=name=>subscriptions[name]?.(snapshot(name));
 window.db={collection:name=>({onSnapshot(options,next){subscriptions[name]=typeof options==='function'?options:next;queueMicrotask(()=>emit(name));return()=>{delete subscriptions[name]}}})};
 window.__tvFixture={emitPublic(value){rows.publicOrderDisplays=value.map(item=>({...item}));emit('publicOrderDisplays')},emitManual(value){rows.manualCustomerCalls=value.map(item=>({...item}));emit('manualCustomerCalls')},setInitial(value){sessionStorage.setItem('pjTvFixtureInitial',JSON.stringify(value))},clearInitial(){sessionStorage.removeItem('pjTvFixtureInitial')}};
 let hidden=false;Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden});window.__tvFixture.setHidden=value=>{hidden=Boolean(value);document.dispatchEvent(new Event('visibilitychange'))};
 const NativeAudioContext=window.AudioContext||window.webkitAudioContext;
 const audio={contexts:0,resumeCalls:0,oscillatorStarts:0,failResume:false,states:[]};
 if(NativeAudioContext){window.AudioContext=class extends NativeAudioContext{constructor(){super();audio.contexts++;audio.states.push(this.state)}async resume(){audio.resumeCalls++;if(audio.failResume)throw new Error('fixture resume blocked');const result=await super.resume();audio.states.push(this.state);return result}createOscillator(){const oscillator=super.createOscillator(),start=oscillator.start.bind(oscillator);oscillator.start=(...args)=>{audio.oscillatorStarts++;return start(...args)};return oscillator}}}
 window.__tvAudioFixture=audio;
})();
