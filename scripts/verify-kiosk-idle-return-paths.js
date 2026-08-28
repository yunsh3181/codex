const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { runElectronVerification } = require('./electron-verification-lifecycle');

const root = path.resolve(__dirname, '..');
const screenshotDir = process.env.KIOSK_IDLE_RETURN_SCREENSHOT_DIR || path.join(root, 'artifacts', 'kiosk-idle-return-paths');
const reportPath = process.env.KIOSK_IDLE_RETURN_REPORT;
const userDataPath = process.env.ELECTRON_VERIFICATION_USER_DATA || path.join(app.getPath('temp'), `kiosk-idle-return-${process.pid}`);
fs.mkdirSync(screenshotDir, { recursive: true });
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const settle = window => window.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()`, true);
const metrics = `(()=>{const root=document.documentElement,body=document.body,main=document.getElementById('main'),image=document.querySelector('.kioskIdleSlide.isActive');return {step:state.step,language:PJ_I18N.currentLanguage(),htmlLang:root.lang,storedLanguage:localStorage.getItem(PJ_I18N.LANGUAGE_STORAGE_KEY),layout:root.dataset.layout,viewport:[innerWidth,innerHeight],horizontalOverflow:Math.max(root.scrollWidth,body.scrollWidth,main?.scrollWidth||0)-innerWidth,verticalOverflow:Math.max(root.scrollHeight,body.scrollHeight)-innerHeight,mainVerticalOverflow:Math.max(0,(main?.scrollHeight||0)-(main?.clientHeight||0)),activePromotion:document.querySelector('.kioskIdleFrame')?.dataset.activePromotion||null,imageFit:image?getComputedStyle(image).objectFit:null,startVisible:Boolean(document.querySelector('.kioskIdleStart')?.getBoundingClientRect().height),cartVisible:Boolean(document.querySelector('#cart .cartbar')),scrollIndicatorVisible:Boolean(document.querySelector('.kiosk-scroll-indicator:not([hidden])'))}})()`;

async function capture(window, name) {
  await settle(window);
  const result = await window.webContents.executeJavaScript(metrics, true);
  const shot = await window.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const image = nativeImage.createFromBuffer(Buffer.from(shot.data, 'base64'));
  const size = image.getSize();
  if (size.width !== 1080 || size.height !== 1920) throw new Error(`${name}: ${size.width}x${size.height}`);
  fs.writeFileSync(path.join(screenshotDir, `${name}-1080x1920.png`), image.toPNG());
  return result;
}

runElectronVerification({ app }, async lifecycle => {
  if (reportPath) lifecycle.expectReport(reportPath);
  const window = lifecycle.trackWindow(new BrowserWindow({ show: false, frame: false, useContentSize: true, webPreferences: { contextIsolation: true, offscreen: true, sandbox: true } }));
  window.setContentSize(1080, 1920);
  lifecycle.attachDebugger();
  const consoleMessages = [];
  window.webContents.on('console-message', (_event, level, message) => { if (level >= 2) consoleMessages.push(message); });
  await window.loadFile(path.join(root, 'index.html'));
  await settle(window);

  const report = {};
  report.initial = await capture(window, '01-initial-idle');
  const baselineConsoleCount = consoleMessages.length;
  await window.webContents.executeJavaScript(`startOrderFromIdle()`, true);
  report.orderStart = await capture(window, '02-order-start-home');

  await window.webContents.executeJavaScript(`(()=>{PJ_I18N.setLanguage('en',{persist:true});state.orderType='takeout';state.orderTiming='now';state.step='pizzaOptions';render();armOrderIdleTimer();orderIdleDeadline=orderIdleNow()+10000;scheduleOrderIdleCountdown(orderIdleGeneration)})()`, true);
  report.warning = await capture(window, '03-inactivity-warning');
  await window.webContents.executeJavaScript(`expireOrderIdle(orderIdleGeneration,true)`, true);
  report.expired = await capture(window, '04-automatic-expiry-idle');

  await window.webContents.executeJavaScript(`(async()=>{PJ_I18N.setLanguage('ja',{persist:true});state.orderType='takeout';state.step='pizzaOptions';render();await endCustomerSessionToStart()})()`, true);
  report.manualHome = await capture(window, '05-manual-home-idle');
  await window.webContents.executeJavaScript(`(async()=>{PJ_I18N.setLanguage('es',{persist:true});state.step='done';state.firebaseOrderId='completed-order';state.paymentMethod='card';render();await endCustomerSessionToStart()})()`, true);
  report.completed = await capture(window, '06-completed-order-idle');

  await window.webContents.executeJavaScript(`(()=>{idlePromotionIndex=1;applyIdlePromotionEligibility(new Date('2026-08-05T07:00:00Z'))})()`, true);
  report.happyHour = await capture(window, '07-happy-hour-idle');
  await window.webContents.executeJavaScript(`(()=>{idlePromotionIndex=0;applyIdlePromotionEligibility(new Date('2026-08-05T06:59:59Z'))})()`, true);
  report.setMenu = await capture(window, '08-set-menu-idle');

  report.takeoutAccompaniment = await window.webContents.executeJavaScript(`(async()=>{
    await startOrderFromIdle();
    startTakeout();
    chooseTakeoutTiming('now');
    pickPromo('normal');
    setStandardPizzaOption('size','L');
    setStandardPizzaOption('dough','오리지널');
    setStandardPizzaOption('crust','오리지널');
    confirmStandardPizzaOptions();
    selectPizzaMode('single');
    pickPizza('P001');
    skipTopping();
    skipSide();
    const before={cartItems:JSON.stringify(state.cartItems),left:state.left,size:state.size,dough:state.dough,crust:state.crust,promo:state.promo,orderType:state.orderType};
    let resets=0;const canonicalReset=reset;reset=(...args)=>{resets++;return canonicalReset(...args)};
    skipDrink();
    const accompaniment={step:state.step,resets,idleScreens:document.querySelectorAll('.kioskIdleScreen').length,cartVisible:Boolean(document.querySelector('#cart .cartbar')),cartItems:JSON.stringify(state.cartItems),left:state.left,size:state.size,dough:state.dough,crust:state.crust,promo:state.promo,orderType:state.orderType};
    state.benefitPromptedKeys=[benefitRecommendationSignature()];state.finalUpsellPrompted=true;
    finishAccompaniment();
    const review={step:state.step,resets,idleScreens:document.querySelectorAll('.kioskIdleScreen').length,cartItems:state.cartItems.length};
    reset=canonicalReset;
    return {before,accompaniment,review}
  })()`, true);

  report.validStepRecovery = await window.webContents.executeJavaScript(`(()=>{
    const canonicalReset=reset,results={};let resets=0;reset=(...args)=>{resets++;return canonicalReset(...args)};
    for(const step of ['accompaniment','reserve','setChoice','party','area','table','done']){
      Object.assign(state,{step,orderType:step==='accompaniment'?'takeout':null,selectedTables:[],firebaseOrderId:null,paymentMethod:'card'});
      const before=resets;render();results[step]={step:state.step,resets:resets-before}
    }
    reset=canonicalReset;return results
  })()`, true);

  report.unknownStepRecovery = await window.webContents.executeJavaScript(`(()=>{
    const canonicalReset=reset,results={};let resets=0;reset=(...args)=>{resets++;return canonicalReset(...args)};
    Object.assign(state,{step:'corrupt-step',selectedTables:[],firebaseOrderId:null});render();results.unprotected={step:state.step,resets};
    for(const protection of ['mobileOrderSubmitting','seatOrderCommitStarted','firebaseOrderId']){
      canonicalReset('home',{skipRelease:true});state.step='corrupt-step';resets=0;
      if(protection==='mobileOrderSubmitting')mobileOrderSubmitting=true;
      if(protection==='seatOrderCommitStarted')seatOrderCommitStarted=true;
      if(protection==='firebaseOrderId')state.firebaseOrderId='saved-order';
      render();results[protection]={step:state.step,resets};
      mobileOrderSubmitting=false;seatOrderCommitStarted=false;state.firebaseOrderId=null
    }
    reset=canonicalReset;canonicalReset('idle',{skipRelease:true});render();return results
  })()`, true);
  report.consoleMessages = consoleMessages.slice(baselineConsoleCount).filter(message => !/Kiosk idle promotion failed to load/.test(message));

  const takeout = report.takeoutAccompaniment;
  if (takeout.accompaniment.step !== 'accompaniment' || takeout.accompaniment.resets !== 0 || takeout.accompaniment.idleScreens !== 0) throw new Error(`accompaniment route reset unexpectedly: ${JSON.stringify(takeout)}`);
  for (const key of ['cartItems','left','size','dough','crust','promo','orderType']) if (takeout.accompaniment[key] !== takeout.before[key]) throw new Error(`accompaniment lost ${key}`);
  if (!takeout.accompaniment.cartVisible || takeout.review.step !== 'review' || takeout.review.resets !== 0 || takeout.review.cartItems !== 1) throw new Error(`takeout review route failed: ${JSON.stringify(takeout)}`);
  for (const [step,result] of Object.entries(report.validStepRecovery)) if (result.step !== step || result.resets !== 0) throw new Error(`valid step recovery reset ${step}: ${JSON.stringify(result)}`);
  if (report.unknownStepRecovery.unprotected.step !== 'idle' || report.unknownStepRecovery.unprotected.resets !== 1) throw new Error(`unknown step did not reset safely: ${JSON.stringify(report.unknownStepRecovery)}`);
  for (const protection of ['mobileOrderSubmitting','seatOrderCommitStarted','firebaseOrderId']) if (report.unknownStepRecovery[protection].resets !== 0) throw new Error(`protected unknown step reset: ${protection}`);
  for(const key of ['expired','manualHome','completed']){
    const result=report[key];
    if(result.step!=='idle'||result.language!=='ko'||result.htmlLang!=='ko'||result.storedLanguage!=='ko')throw new Error(`${key} did not return to Korean promotions: ${JSON.stringify(result)}`)
  }

  if (reportPath) await lifecycle.writeReportAtomically(reportPath, report);
  return report;
});
