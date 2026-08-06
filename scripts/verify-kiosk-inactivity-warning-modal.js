const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { runElectronVerification } = require('./electron-verification-lifecycle');

const root = path.resolve(__dirname, '..');
const reportPath = process.env.KIOSK_INACTIVITY_MODAL_REPORT;
const screenshotDir = process.env.KIOSK_INACTIVITY_MODAL_SCREENSHOT_DIR || path.join(root, 'artifacts', 'kiosk-inactivity-countdown-warning');
const userDataPath = process.env.ELECTRON_VERIFICATION_USER_DATA || path.join(app.getPath('temp'), `inactivity-modal-${process.pid}`);
fs.mkdirSync(userDataPath, { recursive: true });
fs.mkdirSync(screenshotDir, { recursive: true });
app.setPath('userData', userDataPath);
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const waitForLayout = window => window.webContents.executeJavaScript(`(async()=>{await document.fonts.ready;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))})()`, true);
const capture = async (window, name) => {
  await waitForLayout(window);
  const screenshot = await window.webContents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  const image = nativeImage.createFromBuffer(Buffer.from(screenshot.data, 'base64'));
  const size = image.getSize();
  if (size.width !== 1080 || size.height !== 1920) throw new Error(`${name}: ${size.width}x${size.height}`);
  fs.writeFileSync(path.join(screenshotDir, `${name}-1080x1920.png`), image.toPNG());
};
const fixture = (modal, step = 'pizzaOptions') => `(()=>{
  stopOrderIdleTimers();
  Object.assign(state,{step:${JSON.stringify(step)},orderType:'takeout',orderTiming:'now',promo:'normal',size:'L',mode:'half',dough:'오리지널',crust:'오리지널',left:'P001',right:null,toppingChoice:'add',toppings:{T001:1},extraSides:{S009:1},selectedTables:[],firebaseOrderId:null,modal:${JSON.stringify(modal)}});
  render();
  const original=document.querySelector('#modal .backdrop');
  original.dataset.warningFixture='preserved';
  const focusTarget=original.querySelector('button');focusTarget.focus();
  window.__warningOriginalModal=original;window.__warningOriginalFocus=focusTarget;
  armOrderIdleTimer();orderIdleDeadline=orderIdleNow()+10000;scheduleOrderIdleCountdown(orderIdleGeneration);
})()`;
const measure = `(()=>({
  warningHosts:document.querySelectorAll('#inactivityWarningHost').length,
  warningVisible:Boolean(document.querySelector('#inactivityWarningHost .inactivityWarningBackdrop')),
  modalVisible:Boolean(document.querySelector('#modal .backdrop')),
  modalMarker:document.querySelector('#modal .backdrop')?.dataset.warningFixture||null,
  sameModal:document.querySelector('#modal .backdrop')===window.__warningOriginalModal,
  stateModal:state.modal,
  step:state.step,
  size:state.size,
  topping:state.toppings.T001||0,
  focusRestored:document.activeElement===window.__warningOriginalFocus,
  generation:orderIdleGeneration,
  deadline:orderIdleDeadline
}))()`;

runElectronVerification({ app }, async lifecycle => {
  const window = lifecycle.trackWindow(new BrowserWindow({ show: false, frame: false, useContentSize: true, webPreferences: { contextIsolation: true, offscreen: true, sandbox: true } }));
  window.setContentSize(1080, 1920);
  lifecycle.attachDebugger();
  await window.loadFile(path.join(root, 'index.html'));
  await waitForLayout(window);

  await window.webContents.executeJavaScript(fixture('halfGuide'), true);
  const overPizzaOptions = await window.webContents.executeJavaScript(measure, true);
  await capture(window, 'existing-modal-with-warning');
  const backdropIsolation = await window.webContents.executeJavaScript(`(()=>{
    let backgroundClicks=0,modalClicks=0;
    document.getElementById('main').addEventListener('click',()=>backgroundClicks++);
    window.__warningOriginalModal.addEventListener('click',()=>modalClicks++);
    const before={generation:orderIdleGeneration,deadline:orderIdleDeadline};
    document.querySelector('.inactivityWarningBackdrop').dispatchEvent(new MouseEvent('click',{bubbles:true}));
    return {backgroundClicks,modalClicks,generationUnchanged:before.generation===orderIdleGeneration,deadlineUnchanged:before.deadline===orderIdleDeadline,warningVisible:orderIdleWarningOpen}
  })()`, true);
  await window.webContents.executeJavaScript(`document.querySelector('.inactivityContinue').click()`, true);
  const continuedPizzaOptions = await window.webContents.executeJavaScript(measure, true);
  await capture(window, 'existing-modal-restored-after-continue');

  const otherModals = [];
  for (const modal of ['toppingLimitEach', 'setSideUpsell']) {
    await window.webContents.executeJavaScript(fixture(modal, modal === 'toppingLimitEach' ? 'topping' : 'side'), true);
    await window.webContents.executeJavaScript(`document.querySelector('.inactivityContinue').click()`, true);
    otherModals.push({ modal, ...(await window.webContents.executeJavaScript(measure, true)) });
  }

  await window.webContents.executeJavaScript(fixture('toppingLimitTotal', 'topping'), true);
  window.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  window.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await waitForLayout(window);
  const escapedModal = await window.webContents.executeJavaScript(measure, true);

  await window.webContents.executeJavaScript(fixture('halfGuide'), true);
  const homeReset = await window.webContents.executeJavaScript(`(async()=>{
    let releases=0;releaseSeats=async()=>{releases++};state.selectedTables=['held-1'];
    document.querySelector('.inactivityHome').click();await Promise.resolve();await Promise.resolve();
    return {releases,step:state.step,stateModal:state.modal,warningVisible:orderIdleWarningOpen}
  })()`, true);

  await window.webContents.executeJavaScript(fixture('setSideUpsell', 'side'), true);
  const automaticAndStale = await window.webContents.executeJavaScript(`(async()=>{
    let releases=0,resets=0;releaseSeats=async()=>{releases++};const originalReset=reset;reset=(...args)=>{resets++;return originalReset(...args)};
    state.selectedTables=['held-1'];const generation=orderIdleGeneration;orderIdleDeadline=orderIdleNow();
    await Promise.all([expireOrderIdle(generation),expireOrderIdle(generation)]);
    await expireOrderIdle(generation);
    return {releases,resets,step:state.step,warningVisible:orderIdleWarningOpen}
  })()`, true);

  const report = { overPizzaOptions, continuedPizzaOptions, backdropIsolation, otherModals, escapedModal, homeReset, automaticAndStale };
  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
});
