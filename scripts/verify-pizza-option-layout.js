const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runElectronVerification } = require('./electron-verification-lifecycle');

const root = path.resolve(__dirname, '..');
const captureScreenshots = process.argv.includes('--screenshots');
const beforeShaArg = process.argv.find(argument => argument.startsWith('--before-sha='));
const beforeSha = beforeShaArg ? beforeShaArg.slice('--before-sha='.length) : null;
const reportPath = process.env.PIZZA_OPTION_REPORT || null;
const screenshotDir = process.env.PIZZA_OPTION_SCREENSHOT_DIR || path.join(root, 'artifacts');
const promo = process.env.PIZZA_OPTION_PROMO || 'normal';
if (!['normal', 'takeout'].includes(promo)) throw new Error(`Unsupported promo: ${promo}`);
if (captureScreenshots) fs.mkdirSync(screenshotDir, { recursive: true });
const userDataPath = process.env.ELECTRON_VERIFICATION_USER_DATA || path.join(app.getPath('temp'), `pizza-option-layout-${process.pid}`);
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);
const viewports = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1080x1920', width: 1080, height: 1920 },
];
const locales = ['ko', 'en', 'ja', 'zh', 'vi', 'es'];

app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const waitForLayout = window => window.webContents.executeJavaScript(`(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})()`, true);
const fixtureScript = locale => `
  (() => {
    window.__pizzaOptionConsoleMessages = [];
    if (!window.__pizzaOptionConsoleCaptureInstalled) {
      window.__pizzaOptionConsoleCaptureInstalled = true;
      for (const level of ['warn', 'error']) {
        const original = console[level].bind(console);
        console[level] = (...args) => {
          window.__pizzaOptionConsoleMessages.push({ level, text: args.map(String).join(' ') });
          original(...args);
        };
      }
      addEventListener('error', event => {
        window.__pizzaOptionConsoleMessages.push({ level: 'error', text: String(event.message) });
      });
      addEventListener('unhandledrejection', event => {
        window.__pizzaOptionConsoleMessages.push({ level: 'error', text: String(event.reason) });
      });
    }
    window.PJ_I18N.setLanguage(${JSON.stringify(locale)});
    Object.assign(state, {
      step: 'pizzaOptions',
      promo: ${JSON.stringify(promo)},
      set: null,
      size: 'L',
      dough: '오리지널',
      crust: '오리지널',
      left: null,
      right: null,
    });
    render();
    window.scrollTo(0, 0);
    document.getAnimations().forEach(animation => animation.finish());
  })()
`;
const measureScript = `
  (() => {
    const root = document.documentElement;
    const headings = [...document.querySelectorAll('.optionSection > h2')];
    const reasons = [...document.querySelectorAll('.optionReason')];
    const badges = [...document.querySelectorAll('.optionSelectedBadge')];
    const setupRect = document.querySelector('.optionSetup').getBoundingClientRect();
    const cartbarRect = document.querySelector('.cartbar').getBoundingClientRect();
    const clipped = [...document.querySelectorAll(
      '.optionSection h2, .optionBtn, .optionReason, .optionPrice, .optionSelectedBadge'
    )].filter(element =>
      element.scrollWidth > element.clientWidth + 1 ||
      element.scrollHeight > element.clientHeight + 1
    );
    return {
      viewport: { width: innerWidth, height: innerHeight },
      locale: window.PJ_I18N.currentLanguage(),
      headingColors: headings.map(element => getComputedStyle(element).color),
      guidanceFontSizes: reasons.map(element => parseFloat(getComputedStyle(element).fontSize)),
      optionCardHeights: [...document.querySelectorAll('.optionSection .optionBtn')]
        .map(element => element.getBoundingClientRect().height),
      optionFontSizes: [...document.querySelectorAll('.optionSection .optionBtn')]
        .map(element => parseFloat(getComputedStyle(element).fontSize)),
      headingFontSizes: headings.map(element => parseFloat(getComputedStyle(element).fontSize)),
      priceFontSizes: [...document.querySelectorAll('.optionPrice')]
        .map(element => parseFloat(getComputedStyle(element).fontSize)),
      badgeCount: badges.length,
      activeCount: document.querySelectorAll('.optionSection .optionBtn.active').length,
      disabledBadgeCount: document.querySelectorAll('.optionBtn:disabled .optionSelectedBadge').length,
      badgeTexts: badges.map(element => element.textContent.trim()),
      activeLabels: [...document.querySelectorAll('.optionSection .optionBtn.active')]
        .map(element => element.textContent.replace(
          element.querySelector('.optionSelectedBadge')?.textContent || '',
          ''
        ).trim()),
      clipped: clipped.map(element => ({
        text: element.textContent.trim(),
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
      scroll: { width: root.scrollWidth, height: root.scrollHeight },
      geometry: [...document.querySelector('.stage').children].map(element => ({
        className: element.className,
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
        height: element.getBoundingClientRect().height,
      })),
      fits: root.scrollWidth <= innerWidth && root.scrollHeight <= innerHeight,
      contentOverlapPx: Math.max(0, setupRect.bottom - cartbarRect.top),
      layout: root.dataset.layout,
      consoleMessages: [...(window.__pizzaOptionConsoleMessages || [])],
    };
  })()
`;
const captureExact = async (window, viewport, prefix) => {
  await waitForLayout(window);
  const screenshot = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const image = nativeImage.createFromBuffer(Buffer.from(screenshot.data, 'base64'));
  const size = image.getSize();
  if (size.width !== viewport.width || size.height !== viewport.height) {
    throw new Error(
      `${prefix}/${viewport.name}: raw screenshot ${size.width}x${size.height} ` +
      `does not match viewport ${viewport.width}x${viewport.height}`
    );
  }
  fs.writeFileSync(
    path.join(screenshotDir, `pizza-option-${prefix}-${viewport.name}.png`),
    image.toPNG()
  );
};

runElectronVerification({ app }, async lifecycle => {
  const window = lifecycle.trackWindow(new BrowserWindow({
    show: false,
    frame: false,
    skipTaskbar: true,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      offscreen: true,
      sandbox: true,
    },
  }));
  const results = [];
  const visualComparisons = [];
  lifecycle.attachDebugger();
  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height);
    await window.loadFile(path.join(root, 'index.html'));
    for (const locale of locales) {
      await window.webContents.executeJavaScript(fixtureScript(locale), true);
      await waitForLayout(window);
      const before = await window.webContents.executeJavaScript(measureScript, true);
      await window.webContents.executeJavaScript(
        "setStandardPizzaOption('dough','씬도우');setStandardPizzaOption('crust','골드링');document.getAnimations().forEach(animation=>animation.finish())",
        true
      );
      await waitForLayout(window);
      const after = await window.webContents.executeJavaScript(measureScript, true);
      results.push({ viewportName: viewport.name, before, after });
    }
    if (captureScreenshots) {
      await window.webContents.executeJavaScript(fixtureScript('ko'), true);
      const currentMeasurement = await window.webContents.executeJavaScript(measureScript, true);
      await captureExact(window, viewport, 'after');
      if (beforeSha) {
        const baseline = execFileSync('git', ['show', `${beforeSha}:index.html`], {
          cwd: root,
          encoding: 'utf8',
        });
        const baselinePhoneCss = execFileSync(
          'git',
          ['show', `${beforeSha}:styles/device-phone.css`],
          { cwd: root, encoding: 'utf8' }
        );
        const baselinePath = path.join(userDataPath, `pizza-option-baseline-${process.pid}.html`);
        const baseHref = `file://${root.replace(/\\/g, '/')}/`;
        const baselineDocument = baseline
          .replace('<head>', `<head><base href="${baseHref}">`)
          .replace(
            /<link rel="stylesheet" href="styles\/device-phone\.css[^>]*>/,
            `<style>${baselinePhoneCss}</style>`
          );
        fs.writeFileSync(baselinePath, baselineDocument);
        await window.loadFile(baselinePath);
        await window.webContents.executeJavaScript(fixtureScript('ko'), true);
        const baselineMeasurement = await window.webContents.executeJavaScript(measureScript, true);
        await captureExact(window, viewport, 'before');
        visualComparisons.push({ viewportName: viewport.name, baselineMeasurement, currentMeasurement });
        fs.unlinkSync(baselinePath);
        await window.loadFile(path.join(root, 'index.html'));
      }
    }
  }
  const report = { promo, viewports, locales, results, visualComparisons };
  if (captureScreenshots) {
    fs.writeFileSync(
      path.join(screenshotDir, 'pizza-option-layout-measurements.json'),
      `${JSON.stringify(report, null, 2)}\n`
    );
  }
  if (reportPath) {
    fs.writeFileSync(reportPath, `${JSON.stringify(report)}\n`);
    process.stdout.write(`PIZZA_OPTION_LAYOUT_REPORT=${reportPath}\n`);
  } else {
    process.stdout.write(`PIZZA_OPTION_LAYOUT_RESULT=${JSON.stringify(report)}\n`);
  }
});
