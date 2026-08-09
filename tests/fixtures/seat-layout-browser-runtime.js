(()=>{
 const seatData={'papa-2':{status:'empty'},'papa-bar4':{status:'occupied',orderNo:'1032',partySize:4},'outdoor-1':{status:'held',orderNo:'1027'},'outdoor-2':{status:'empty'},'outdoor-3':{status:'reserved',reservationPartySize:3},'outdoor-4':{status:'empty'},'annex-1':{status:'occupied',orderNo:'1021'},'annex-2':{status:'reserved',reservationPartySize:2},'annex-3':{status:'held',orderNo:'1019'},'annex-4':{status:'empty'},'room-1':{status:'empty'},'room-2':{status:'occupied',orderNo:'1016'},'room-3':{status:'empty'}};
 const saved=()=>{try{return JSON.parse(sessionStorage.getItem('seatLayoutFixture')||'null')}catch{return null}};
 let layoutListener=null,writeCount=0;
 const snapshot=records=>({docs:Object.entries(records).map(([id,data])=>({id,data:()=>data})),forEach(callback){Object.entries(records).forEach(([id,data])=>callback({id,data:()=>data}))}});
 const layoutSnapshot=()=>{const data=saved();return {exists:Boolean(data),data:()=>data}};
 const layoutRef={onSnapshot(success){layoutListener=success;success(layoutSnapshot());return()=>{layoutListener=null}}};
 const db={collection(name){return {doc(id){if(name==='adminSettings')return layoutRef;return {id,set:async()=>{}}},onSnapshot(success){success(name==='seats'?snapshot(seatData):snapshot({}));return()=>{};}}},async runTransaction(callback){return callback({get:async()=>layoutSnapshot(),set(ref,data){writeCount+=1;const stored={...data,updatedAt:{seconds:Math.floor(Date.now()/1000)}};sessionStorage.setItem('seatLayoutFixture',JSON.stringify(stored));queueMicrotask(()=>layoutListener?.(layoutSnapshot()))}})}};
 window.db=db;window.firebase={auth(){return {currentUser:{uid:'fixture-admin'},onAuthStateChanged(callback){callback({uid:'fixture-admin',getIdTokenResult:async()=>({claims:{admin:true}})});return()=>{}},signOut:async()=>{}}},firestore:{FieldValue:{serverTimestamp:()=>({fixtureTimestamp:true})},Timestamp:{fromDate:date=>date}}};
 window.__seatLayoutFixture={db,seatData,get writeCount(){return writeCount},clear(){sessionStorage.removeItem('seatLayoutFixture')}};
})();
