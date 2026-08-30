const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { exportAdminVisualSite } = require('./serve-admin-visual');
const { runElectronVerification } = require('./electron-verification-lifecycle');

const root = path.resolve(__dirname, '..');
const output = process.env.ADMIN_QUANTITY_SCREENSHOT_DIR || path.join(root, 'artifacts', 'order-review-cart-quantity-visibility');
const reportPath = process.env.ADMIN_QUANTITY_REPORT || path.join(os.tmpdir(), `admin-order-quantity-${process.pid}.json`);
const userDataPath = process.env.ELECTRON_VERIFICATION_USER_DATA || path.join(os.tmpdir(), `admin-order-quantity-profile-${process.pid}`);
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const waitFor = (window, expression) => window.webContents.executeJavaScript(`new Promise((resolve,reject)=>{const end=Date.now()+8000;function check(){if(${expression})return requestAnimationFrame(()=>requestAnimationFrame(resolve));if(Date.now()>end)return reject(new Error('admin quantity fixture timeout'));setTimeout(check,20)}check()})`, true);
const capture = async (window, name) => {
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(output, name), nativeImage.createFromBuffer(image.toPNG()).toPNG());
};

runElectronVerification({ app }, async lifecycle => {
  lifecycle.expectReport(reportPath);
  const visualRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'admin-order-quantity-site-'));
  exportAdminVisualSite(visualRoot);
  const window = lifecycle.trackWindow(new BrowserWindow({
    show: false,
    frame: false,
    width: 1440,
    height: 900,
    useContentSize: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  }));
  try {
    await window.loadFile(path.join(visualRoot, 'admin', 'index.html'));
    await waitFor(window, `document.querySelectorAll('.central-order-row').length===15`);
    await window.webContents.executeJavaScript(`(()=>{PJAdminVisualFixture.add({id:'quantity-visibility-fixture',adminDisplaySequence:22,status:'completed',orderType:'takeout',source:'mobile',customerNumber:'2022',orderNo:'2022',createdAtClient:'2026-08-29T11:33:00.000Z',normalAmount:128400,totalAmount:101000,total:101000,payment:{method:'card',methodName:'신용카드'},items:[{pizzaLeft:'P001',pizzaRight:'P002',pizzaName:'페퍼로니 / 수퍼 파파스',size:'F',dough:'오리지널',crust:'오리지널',set:4,promo:'set',qty:2,total:101000,normalTotal:128400,discountAmount:27400,includedSides:{S008:{quantity:1},S012:{quantity:1}},sides:{},includedDrinks:{D002:{quantity:1}},drinks:{D006:{name:'스프라이트 1.5L',quantity:1,total:2500}}}]});render()})()`, true);
    await waitFor(window, `document.querySelector('[data-order-id="quantity-visibility-fixture"]')`);
    await window.webContents.executeJavaScript(`document.querySelector('[data-order-id="quantity-visibility-fixture"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true,detail:2}))`, true);
    await waitFor(window, `!document.getElementById('orderDetailModal').hidden`);
    const result = await window.webContents.executeJavaScript(`(()=>{const text=document.getElementById('orderDetailModal').textContent.replace(/\s+/g,' ').trim(),line=name=>[...document.querySelectorAll('.detail-menu-line')].find(element=>element.textContent.includes(name))?.textContent.replace(/\s+/g,' ').trim()||'';return{viewport:[innerWidth,innerHeight],pizza:document.querySelector('.detail-menu-line.pizza')?.textContent.replace(/\s+/g,' ').trim()||'',includedSideA:line('파파스 윙'),includedSideB:line('베이컨 치즈 스틱'),includedDrink:line('코카-콜라 1.25L'),extraDrink:line('스프라이트 1.5L'),payment:text.includes('101,000원'),horizontalOverflow:Math.max(0,document.documentElement.scrollWidth-document.documentElement.clientWidth)}})()`, true);
    await capture(window, 'admin-set-4-quantity-2-detail.png');
    await capture(window, 'admin-extra-sprite-quantity-1-detail.png');
    await lifecycle.writeReportAtomically(reportPath, result);
  } finally {
    fs.rmSync(visualRoot, { recursive: true, force: true });
  }
});
