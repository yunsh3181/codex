const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');

const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const handlerSource=html.match(/let mobileOrderSubmitting=false;[\s\S]*?\n}\ndocument\.addEventListener\('click'/)?.[0].replace(/\ndocument\.addEventListener\('click'[\s\S]*/,'');
assert.ok(handlerSource,'payment submission lock handler exists');

const button={disabled:false};
let calls=0;
let releaseFirst;
let mode='success';
const state={step:'payment'};
const context={
 state,
 document:{getElementById:id=>id==='paymentSubmitBtn'?button:null},
 complete:async()=>{
  calls++;
  if(calls===1)await new Promise(resolve=>{releaseFirst=resolve});
  if(mode==='failure')throw new Error('temporary Firestore failure');
  state.step='done';
 }
};
vm.createContext(context);
vm.runInContext(handlerSource,context);

(async()=>{
 const first=context.handlePaymentSubmit();
 const duplicate=context.handlePaymentSubmit();
 assert.strictEqual(calls,1,'double click starts only one order write');
 releaseFirst();
 await Promise.all([first,duplicate]);

 state.step='payment';
 await context.handlePaymentSubmit();
 assert.strictEqual(calls,2,'a second customer can submit after the successful order resets to home');

 state.step='payment';
 mode='failure';
 await assert.rejects(()=>context.handlePaymentSubmit(),/temporary Firestore failure/);
 mode='success';
 state.step='payment';
 await context.handlePaymentSubmit();
 assert.strictEqual(calls,4,'a rejected request releases the lock and can be retried');

 assert.ok(html.includes("const orderRef=db.collection('orders').doc();"),'Firestore uses an automatic unique document ID');
 assert.ok(html.includes("orderNo:displayOrderNo(),customerNumber:displayOrderNo()"),'display order number remains payload data, not the document ID');
 assert.ok(html.includes("if(errorBox)errorBox.textContent=error.message||t('ui.payment.saveFailed')"),'failure message remains visible');
 assert.ok(html.includes("if(button){button.disabled=false;button.textContent=t('ui.payment.submit')}"),'failure restores the submit button');
 assert.ok(html.includes("state.phone=''"),'reset is the only place that clears the phone number');
 console.log('phone submission lock, duplicate prevention, retry, and automatic document IDs passed');
})().catch(error=>{console.error(error);process.exitCode=1});
