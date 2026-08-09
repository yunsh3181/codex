const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runElectronVerification } = require('./electron-verification-lifecycle');

const root = path.resolve(__dirname, '..');
const outputDir = process.env.MOBILE_PIZZA_GRID_OUTPUT || path.join(app.getPath('temp'), 'mobile-pizza-grid');
const reportPath = process.env.MOBILE_PIZZA_GRID_REPORT || path.join(outputDir, 'measurements.json');
const beforeSha = process.env.MOBILE_PIZZA_GRID_BEFORE || null;
const capture = process.argv.includes('--screenshots');
const userDataPath = process.env.ELECTRON_VERIFICATION_USER_DATA || path.join(app.getPath('temp'), `mobile-pizza-grid-${process.pid}`);
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);
app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const scenarios = [
  { name: 'normal', promo: 'normal', size: 'F', set: null, bannerTakeout: false },
  { name: 'takeout-20', promo: 'takeout', size: 'F', set: null, bannerTakeout: true },
  { name: 'happy-hour', promo: 'happy', size: 'R', set: null, bannerTakeout: false },
  { name: 'upup', promo: 'upup', size: 'F', set: null, bannerTakeout: false },
  { name: 'set', promo: 'set', size: 'F', set: 4, bannerTakeout: false },
];
const locales = ['ko', 'en', 'ja', 'zh', 'vi', 'es'];
const viewports = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '1080x1920', width: 1080, height: 1920 },
];
const waitForLayout = window => window.webContents.executeJavaScript(`(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})()`, true);
const fixture = (scenario, locale = 'ko') => `(() => {
  window.PJ_I18N.setLanguage(${JSON.stringify(locale)});
  Object.assign(state, {
    step: 'pizza', orderType: 'takeout', orderTiming: 'now', promo: ${JSON.stringify(scenario.promo)},
    set: ${JSON.stringify(scenario.set)}, size: ${JSON.stringify(scenario.size)}, mode: 'single',
    dough: '오리지널', crust: '오리지널', cat: 'ALL', left: null, right: null,
    bannerTakeout: ${JSON.stringify(scenario.bannerTakeout)}
  });
  render();
  scrollTo(0, 0);
  document.getAnimations().forEach(animation => animation.finish());
})()`;
const timingFixture = `(() => {
  window.PJ_I18N.setLanguage('ko');
  Object.assign(state, { step: 'timing', orderType: 'takeout', orderTiming: null });
  render();
  scrollTo(0, 0);
  document.getAnimations().forEach(animation => animation.finish());
})()`;
const measurePizza = `(() => {
  const root = document.documentElement;
  const grid = document.querySelector('.pizzaMenuGrid');
  const cards = [...document.querySelectorAll('.pizzaMenuCard')];
  const images = cards.map(card => card.querySelector('.imagePic'));
  const names = cards.map(card => card.querySelector('h3'));
  const prices = cards.flatMap(card => [...card.querySelectorAll('.price,.discount,.muted')]);
  const cartbar = document.querySelector('.cartbar');
  const last = cards[cards.length - 1];
  const lastDocumentBottom = last ? last.getBoundingClientRect().bottom + scrollY : 0;
  const fixedBarHeight = cartbar ? innerHeight - cartbar.getBoundingClientRect().top : 0;
  const clippedNames = names.filter(element => element && (
    element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1
  ));
  const clippedPrices = prices.filter(element => element && (
    element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 2
  ));
  const clipped = [...clippedNames, ...clippedPrices];
  return {
    layout: root.dataset.layout,
    viewport: { width: innerWidth, height: innerHeight },
    columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
    cardCount: cards.length,
    cardSize: cards[0] ? { width: cards[0].getBoundingClientRect().width, height: cards[0].getBoundingClientRect().height } : null,
    imageSize: images[0] ? { width: images[0].getBoundingClientRect().width, height: images[0].getBoundingClientRect().height } : null,
    imageFit: images[0]?.querySelector('img') ? getComputedStyle(images[0].querySelector('img')).objectFit : null,
    nameFontSize: names[0] ? parseFloat(getComputedStyle(names[0]).fontSize) : null,
    priceFontSize: prices[0] ? parseFloat(getComputedStyle(prices[0]).fontSize) : null,
    horizontalOverflow: Math.max(0, root.scrollWidth - innerWidth),
    scrollHeight: root.scrollHeight,
    clipped: clipped.map(element => element.textContent.trim()),
    lastCardBottom: last?.getBoundingClientRect().bottom || 0,
    cartbarTop: cartbar?.getBoundingClientRect().top || innerHeight,
    bottomClearance: root.scrollHeight - lastDocumentBottom - fixedBarHeight,
  };
})()`;
const measureTiming = `(() => {
  const read = selector => {
    const element = document.querySelector(selector);
    const style = getComputedStyle(element);
    return {
      background: style.backgroundColor, color: style.color, border: style.borderColor,
      headingColor: getComputedStyle(element.querySelector('h2')).color,
      iconColor: getComputedStyle(element.querySelector('.uiIcon')).color,
      descriptionColor: getComputedStyle(element.querySelector('p')).color,
    };
  };
  return { layout: document.documentElement.dataset.layout, now: read('.timingNow'), reserve: read('.timingReserve') };
})()`;

const captureExact = async (window, viewport, name) => {
  const screenshot = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png', fromSurface: true, captureBeyondViewport: false,
  });
  const image = nativeImage.createFromBuffer(Buffer.from(screenshot.data, 'base64'));
  const size = image.getSize();
  if (size.width !== viewport.width || size.height !== viewport.height) {
    throw new Error(`${name}: ${size.width}x${size.height} != ${viewport.width}x${viewport.height}`);
  }
  fs.writeFileSync(path.join(outputDir, `${name}-${viewport.name}.png`), image.toPNG());
};

const baselineDocument = () => {
  const html = execFileSync('git', ['show', `${beforeSha}:index.html`], { cwd: root, encoding: 'utf8' });
  const phoneCss = execFileSync('git', ['show', `${beforeSha}:styles/device-phone.css`], { cwd: root, encoding: 'utf8' });
  const baseHref = `file://${root.replace(/\\/g, '/')}/`;
  return html.replace('<head>', `<head><base href="${baseHref}">`).replace(
    /<link rel="stylesheet" href="styles\/device-phone\.css[^>]*>/,
    `<style>${phoneCss}</style>`
  );
};

const baselineComparison = beforeSha
  ? { requested: true, ref: beforeSha, performed: false, reason: null }
  : { requested: false, ref: null, performed: false, reason: 'baseline ref not requested' };

const prepareBaseline = baselinePath => {
  if (!beforeSha) return false;
  try {
    execFileSync('git', ['cat-file', '-e', `${beforeSha}:index.html`], { cwd: root, stdio: 'ignore' });
    execFileSync('git', ['cat-file', '-e', `${beforeSha}:styles/device-phone.css`], { cwd: root, stdio: 'ignore' });
  } catch {
    throw new Error(`Requested baseline ref is unavailable: ${beforeSha}`);
  }
  fs.writeFileSync(baselinePath, baselineDocument());
  baselineComparison.performed = true;
  return true;
};

runElectronVerification({ app }, async lifecycle => {
  lifecycle.expectReport(reportPath);
  const window = lifecycle.trackWindow(new BrowserWindow({
    show: false, frame: false, useContentSize: true,
    webPreferences: { contextIsolation: true, offscreen: true, sandbox: true },
  }));
  lifecycle.attachDebugger();
  const results = [];
  const localeResults = [];
  const baselinePath = path.join(userDataPath, `mobile-pizza-grid-baseline-${process.pid}.html`);
  const hasBaseline = prepareBaseline(baselinePath);
  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height);
    await window.loadFile(path.join(root, 'index.html'));
    await window.webContents.executeJavaScript(timingFixture, true);
    await waitForLayout(window);
    const timingAfter = await window.webContents.executeJavaScript(measureTiming, true);
    if (capture && viewport.name === '390x844') await captureExact(window, viewport, 'timing-after');
    let timingBefore = null;
    if (hasBaseline) {
      await window.loadFile(baselinePath);
      await window.webContents.executeJavaScript(timingFixture, true);
      await waitForLayout(window);
      timingBefore = await window.webContents.executeJavaScript(measureTiming, true);
      if (capture && viewport.name === '390x844') await captureExact(window, viewport, 'timing-before');
    }
    results.push({ viewport: viewport.name, scenario: 'timing', before: timingBefore, after: timingAfter });
    for (const scenario of scenarios) {
      await window.loadFile(path.join(root, 'index.html'));
      await window.webContents.executeJavaScript(fixture(scenario), true);
      await waitForLayout(window);
      const after = await window.webContents.executeJavaScript(measurePizza, true);
      if (capture && (viewport.name === '390x844' || (viewport.name === '360x640' && scenario.name === 'normal') || (viewport.name === '1080x1920' && scenario.name === 'normal'))) {
        await captureExact(window, viewport, `${scenario.name}-after`);
      }
      if (capture && viewport.name === '390x844' && scenario.name === 'normal') {
        await window.webContents.executeJavaScript(`(() => {
          const grid = document.querySelector('.pizzaMenuGrid');
          const template = grid.querySelector('.pizzaMenuCard');
          grid.append(template.cloneNode(true), template.cloneNode(true));
        })()`, true);
        await waitForLayout(window);
        await window.webContents.executeJavaScript('scrollTo(0, document.documentElement.scrollHeight)', true);
        await waitForLayout(window);
        await captureExact(window, viewport, 'normal-17-bottom-after');
      }
      let before = null;
      if (hasBaseline) {
        await window.loadFile(baselinePath);
        await window.webContents.executeJavaScript(fixture(scenario), true);
        await waitForLayout(window);
        before = await window.webContents.executeJavaScript(measurePizza, true);
        if (capture && ((viewport.name === '390x844' && scenario.name === 'normal') || (viewport.name === '1080x1920' && scenario.name === 'normal'))) {
          await captureExact(window, viewport, `${scenario.name}-before`);
        }
      }
      results.push({ viewport: viewport.name, scenario: scenario.name, before, after });
    }
  }
  window.setContentSize(390, 844);
  for (const locale of locales) {
    for (const scenario of scenarios) {
      await window.loadFile(path.join(root, 'index.html'));
      await window.webContents.executeJavaScript(fixture(scenario, locale), true);
      await waitForLayout(window);
      localeResults.push({ locale, scenario: scenario.name, measurement: await window.webContents.executeJavaScript(measurePizza, true) });
    }
  }
  await lifecycle.writeReportAtomically(reportPath, { baselineComparison, viewports, scenarios, locales, results, localeResults });
  if (hasBaseline) fs.unlinkSync(baselinePath);
});
