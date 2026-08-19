const { app, BrowserWindow } = require("electron");
const fs = require("node:fs"),
  os = require("node:os"),
  path = require("node:path");
const { exportAdminVisualSite } = require("./serve-admin-visual");
const {
  runElectronVerification,
} = require("./electron-verification-lifecycle");
const root = path.resolve(__dirname, ".."),
  report = process.env.ADMIN_SEAT_BIDIRECTIONAL_REPORT;
app.disableHardwareAcceleration();
app.commandLine.appendSwitch("headless");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function exportSeat(target) {
  for (const dir of ["seat", "tests/fixtures"])
    fs.mkdirSync(path.join(target, dir), { recursive: true });
  for (const file of [
    "admin.css",
    "admin-operations.js",
    "seats.css",
    "seats-mobile.css",
    "bottle-seat-policy.css",
    "bottle-seat-policy.js",
    "seat-layout.css",
    "seat-layout.js",
    "seats.js",
  ])
    fs.copyFileSync(path.join(root, file), path.join(target, file));
  fs.copyFileSync(
    path.join(root, "tests/fixtures/seat-layout-browser-runtime.js"),
    path.join(target, "tests/fixtures/seat-layout-browser-runtime.js"),
  );
  let html = fs.readFileSync(path.join(root, "seat/index.html"), "utf8");
  html = html
    .replace(/<script src="https:\/\/www\.gstatic\.com[^>]+><\/script>/g, "")
    .replace(
      /<script src="\.\.\/firebase-config\.js[^>]+><\/script>/,
      '<script src="../tests/fixtures/seat-layout-browser-runtime.js"></script>',
    );
  fs.writeFileSync(path.join(target, "seat/index.html"), html);
}
async function main(lifecycle) {
  lifecycle.expectReport(report);
  const site = fs.mkdtempSync(
    path.join(os.tmpdir(), "admin-seat-bidirectional-"),
  );
  exportAdminVisualSite(site);
  exportSeat(site);
  const dashboard = lifecycle.trackWindow(
      new BrowserWindow({
        show: true,
        width: 1440,
        height: 900,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: false,
          sandbox: false,
        },
      }),
    ),
    manager = lifecycle.trackWindow(
      new BrowserWindow({
        show: true,
        width: 1440,
        height: 900,
        webPreferences: {
          contextIsolation: false,
          nodeIntegration: false,
          sandbox: false,
        },
      }),
    );
  try {
    await Promise.all([
      dashboard.loadFile(path.join(site, "admin", "index.html")),
      manager.loadFile(path.join(site, "seat", "index.html")),
    ]);
    await Promise.all([
      dashboard.webContents.executeJavaScript(
        `new Promise(resolve=>{const done=()=>document.querySelectorAll('.seat-overview-card').length===13?resolve():setTimeout(done,20);done()})`,
      ),
      manager.webContents.executeJavaScript(
        `new Promise(resolve=>{const done=()=>document.querySelectorAll('.seat-slot').length===18?resolve():setTimeout(done,20);done()})`,
      ),
    ]);
    await Promise.all([
      dashboard.webContents.executeJavaScript("window.confirm=()=>true;true"),
      manager.webContents.executeJavaScript("window.confirm=()=>true;true"),
    ]);
    const id = "papa-2",
      steps = [],
      read = async () => ({
        dashboard: await dashboard.webContents.executeJavaScript(
          `document.querySelector('[data-seat-id="${id}"] .seat-overview-status').textContent.trim()`,
        ),
        manager: await manager.webContents.executeJavaScript(
          `document.querySelector('[data-layout-seat-id="${id}"] .simple-seat em').textContent.trim()`,
        ),
        dashboardTransactions: await dashboard.webContents.executeJavaScript(
          "PJAdminVisualFixture.transactionCalls",
        ),
        managerTransactions: await manager.webContents.executeJavaScript(
          "__seatLayoutFixture.seatTransactionCount",
        ),
        managerWrites: await manager.webContents.executeJavaScript(
          "__seatLayoutFixture.seatWriteCount",
        ),
      });
    const managerClick = async (label) => {
      await manager.webContents.executeJavaScript(
        `[...document.querySelectorAll('[data-layout-seat-id="${id}"] .admin-seat-action')].find(button=>button.textContent.trim()===${JSON.stringify(label)}).click()`,
      );
      await delay(80);
      const data = await manager.webContents.executeJavaScript(
        `({...__seatLayoutFixture.seatData['${id}']})`,
      );
      await dashboard.webContents.executeJavaScript(
        `PJAdminVisualFixture.setSeat('${id}',${JSON.stringify(data)})`,
      );
      await delay(50);
      steps.push(await read());
    };
    const dashboardClick = async (label) => {
      await dashboard.webContents.executeJavaScript(
        `[...document.querySelectorAll('[data-seat-id="${id}"] .admin-seat-action')].find(button=>button.textContent.trim()===${JSON.stringify(label)}).click()`,
      );
      await delay(80);
      const data = await dashboard.webContents.executeJavaScript(
        `PJAdminVisualFixture.seat('${id}')`,
      );
      await manager.webContents.executeJavaScript(
        `__seatLayoutFixture.setSeat('${id}',${JSON.stringify(data)})`,
      );
      await delay(50);
      steps.push(await read());
    };
    await managerClick("예약");
    await dashboardClick("사용");
    await managerClick("빈자리");
    await dashboardClick("예약");
    await dashboardClick("빈자리");
    const expired={status:'held',orderId:null,heldBy:'customer',heldAt:Date.now()-120000,heldUntil:Date.now()-90000};
    const held = await Promise.all([
      dashboard.webContents.executeJavaScript(
        `PJAdminVisualFixture.setSeat('${id}',${JSON.stringify(expired)});new Promise(resolve=>setTimeout(()=>resolve([...document.querySelectorAll('[data-seat-id="${id}"] .admin-seat-action')].map(button=>button.textContent.trim())),0))`,
      ),
      manager.webContents.executeJavaScript(
        `__seatLayoutFixture.setSeat('${id}',${JSON.stringify(expired)});new Promise(resolve=>setTimeout(()=>resolve([...document.querySelectorAll('[data-layout-seat-id="${id}"] .admin-seat-action')].map(button=>button.textContent.trim())),0))`,
      ),
    ]);
    await managerClick('강제 빈자리');
    await Promise.all([dashboard.webContents.executeJavaScript(`PJAdminVisualFixture.setSeat('${id}',${JSON.stringify(expired)})`),manager.webContents.executeJavaScript(`__seatLayoutFixture.setSeat('${id}',${JSON.stringify(expired)})`)]);await delay(50);
    await dashboardClick('강제 빈자리');
    fs.writeFileSync(
      report,
      JSON.stringify({
        steps,
        held,recoverySteps:steps.slice(-2),
        refreshes: 0,
        seatOrder: await manager.webContents.executeJavaScript(
          `[...document.querySelectorAll('[data-layout-seat-id]')].map(node=>node.dataset.layoutSeatId)`,
        ),
        layoutRevision: await manager.webContents.executeJavaScript(
          "PJSeatLayoutEditor.getState().revision",
        ),
      }),
    );
  } finally {
    fs.rmSync(site, { recursive: true, force: true });
  }
}
runElectronVerification({ app }, main);
