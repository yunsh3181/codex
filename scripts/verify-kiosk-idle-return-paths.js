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
const metrics = `(()=>{const root=document.documentElement,body=document.body,main=document.getElementById('main'),image=document.querySelector('.kioskIdleSlide.isActive');return {step:state.step,layout:root.dataset.layout,viewport:[innerWidth,innerHeight],horizontalOverflow:Math.max(root.scrollWidth,body.scrollWidth,main?.scrollWidth||0)-innerWidth,verticalOverflow:Math.max(root.scrollHeight,body.scrollHeight)-innerHeight,mainVerticalOverflow:Math.max(0,(main?.scrollHeight||0)-(main?.clientHeight||0)),activePromotion:document.querySelector('.kioskIdleFrame')?.dataset.activePromotion||null,imageFit:image?getComputedStyle(image).objectFit:null,startVisible:Boolean(document.querySelector('.kioskIdleStart')?.getBoundingClientRect().height),cartVisible:Boolean(document.querySelector('#cart .cartbar')),scrollIndicatorVisible:Boolean(document.querySelector('.kiosk-scroll-indicator:not([hidden])'))}})()`;

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

  await window.webContents.executeJavaScript(`(()=>{state.orderType='takeout';state.orderTiming='now';state.step='pizzaOptions';render();armOrderIdleTimer();orderIdleDeadline=orderIdleNow()+10000;scheduleOrderIdleCountdown(orderIdleGeneration)})()`, true);
  report.warning = await capture(window, '03-inactivity-warning');
  await window.webContents.executeJavaScript(`expireOrderIdle(orderIdleGeneration,true)`, true);
  report.expired = await capture(window, '04-automatic-expiry-idle');

  await window.webContents.executeJavaScript(`(()=>{state.orderType='takeout';state.step='pizzaOptions';render();reset();render()})()`, true);
  report.manualHome = await capture(window, '05-manual-home-idle');
  await window.webContents.executeJavaScript(`(()=>{state.step='done';state.firebaseOrderId='completed-order';state.paymentMethod='card';render();reset();render()})()`, true);
  report.completed = await capture(window, '06-completed-order-idle');

  await window.webContents.executeJavaScript(`(()=>{idlePromotionIndex=1;applyIdlePromotionEligibility(new Date('2026-08-05T07:00:00Z'))})()`, true);
  report.happyHour = await capture(window, '07-happy-hour-idle');
  await window.webContents.executeJavaScript(`(()=>{idlePromotionIndex=0;applyIdlePromotionEligibility(new Date('2026-08-05T06:59:59Z'))})()`, true);
  report.setMenu = await capture(window, '08-set-menu-idle');
  report.consoleMessages = consoleMessages.slice(baselineConsoleCount).filter(message => !/Kiosk idle promotion failed to load/.test(message));

  if (reportPath) fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  return report;
});
