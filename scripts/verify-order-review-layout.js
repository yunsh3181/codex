const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const captureScreenshots = process.argv.includes('--screenshots');
const beforeShaArg = process.argv.find(argument => argument.startsWith('--before-sha='));
const beforeSha = beforeShaArg ? beforeShaArg.slice('--before-sha='.length) : null;
const viewports = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1080x1920', width: 1080, height: 1920 },
];
const locales = ['ko', 'en', 'ja', 'zh', 'vi', 'es'];
const scenarios = [
  { name: 'normal-whole', promo: 'normal', size: 'L', mode: 'single', set: null, right: null },
  { name: 'takeout-half', promo: 'takeout', size: 'L', mode: 'half', set: null, right: 'P002' },
  { name: 'set-2', promo: 'set', size: 'R', mode: 'single', set: 2, right: null },
  { name: 'set-3', promo: 'set', size: 'L', mode: 'single', set: 3, right: null },
  { name: 'set-4', promo: 'set', size: 'F', mode: 'single', set: 4, right: null },
  { name: 'upup', promo: 'upup', size: 'F', mode: 'single', set: null, right: null },
  { name: 'happy-hour', promo: 'happy', size: 'R', mode: 'single', set: null, right: null },
];
const richScenario = {
  name: 'takeout-all-categories',
  promo: 'takeout',
  size: 'L',
  mode: 'single',
  set: null,
  right: null,
  topping: true,
  extras: true,
};

app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const waitForPaint = () => new Promise(resolve => setTimeout(resolve, 120));
const captureExact = async (window, viewport, prefix) => {
  await waitForPaint();
  const screenshot = await window.webContents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
  });
  const image = nativeImage.createFromBuffer(Buffer.from(screenshot.data, 'base64'));
  const imageSize = image.getSize();
  if (imageSize.width !== viewport.width || imageSize.height !== viewport.height) {
    throw new Error(
      `${prefix}/${viewport.name}: raw screenshot ${imageSize.width}x${imageSize.height} ` +
      `does not match viewport ${viewport.width}x${viewport.height}`
    );
  }
  fs.writeFileSync(
    path.join(root, 'artifacts', `order-review-${prefix}-${viewport.name}.png`),
    image.toPNG()
  );
};

const fixtureScript = (locale, scenario) => `
  (() => {
    window.PJ_I18N.setLanguage(${JSON.stringify(locale)});
    Object.assign(state, {
      step: 'review',
      orderType: 'takeout',
      orderTiming: 'now',
      promo: ${JSON.stringify(scenario.promo)},
      set: ${JSON.stringify(scenario.set)},
      size: ${JSON.stringify(scenario.size)},
      mode: ${JSON.stringify(scenario.mode)},
      dough: '오리지널',
      left: 'P001',
      right: ${JSON.stringify(scenario.right)},
      crust: '치즈롤',
      toppingChoice: 'add',
      toppings: ${scenario.topping ? '{ T001: 1 }' : '{}'},
      extraSides: ${scenario.extras ? '{ S002: 1 }' : '{}'},
      extraDrinks: ${scenario.extras ? '{ D002: 1, D010: 1 }' : '{}'},
      setSides: ${scenario.included ? "{ S009: 1 }" : '{}'},
      setDrink: ${scenario.included ? "'D001'" : 'null'},
      disposables: false,
      cartItems: []
    });
    state.cartItems = [orderSnapshot()];
    clearCurrentProduct();
    state.step = 'review';
    window.scrollTo(0, 0);
    render();
    document.getAnimations().forEach(animation => animation.finish());
  })()
`;

const measureScript = `
  (() => {
    const root = document.documentElement;
    const targets = [...document.querySelectorAll(
      '.reviewOrderCard *, .reviewAddMore *, .reviewDiscountBox *, .reviewConfirmBtn'
    )];
    const coreTextTargets = [...document.querySelectorAll(
      '.cartPizzaMeta, .cartPizzaToppingLine, .cartPizzaPriceLine, .cartItemSummary, ' +
      '.cartBenefitRow, .cartOrderTotal, .reviewDiscountBox .line'
    )];
    const textTargets = targets.filter(element =>
      element.children.length === 0 && element.textContent.trim()
    );
    const touchTargets = [...document.querySelectorAll(
      '.cartOrderActions button, .reviewAddMoreGrid button, .reviewConfirmBtn, .langTopBtn'
    )];
    const isPhoneReview = root.dataset.layout === 'phone';
    const requiredSelector = [
      '.progress',
      '.progress .progressStep',
      '.langTopBtn span',
      '.cartbar .cartmain',
      '.cartbar .cartprice',
      ...(isPhoneReview ? ['.brandName', '.brandLogo', '.reviewBrandTagline'] : []),
    ].join(', ');
    const requiredVisibleTargets = [...document.querySelectorAll(requiredSelector)];
    const clipped = textTargets.filter(element =>
      element.scrollWidth > element.clientWidth + 2 ||
      element.scrollHeight > element.clientHeight + 2
    );
    const fontSizes = textTargets.map(element => parseFloat(getComputedStyle(element).fontSize));
    const touchSizes = touchTargets.map(element => {
      const rect = element.getBoundingClientRect();
      return { width: rect.width, height: rect.height, text: element.textContent.trim() };
    });
    const discountTextMetrics = [...document.querySelectorAll(
      '.cartPizzaPriceLine.discount > span, .cartBenefitRow > span, .cartBenefitRow > strong'
    )].map(element => ({
      text: element.textContent.trim(),
      fontSize: parseFloat(getComputedStyle(element).fontSize),
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    const cartbarRect = document.querySelector('.cartbar')?.getBoundingClientRect();
    const brandRect = document.querySelector('.brand')?.getBoundingClientRect();
    const locationRect = document.querySelector('.brandName')?.getBoundingClientRect();
    const logoRect = document.querySelector('.brandLogo')?.getBoundingClientRect();
    const taglineRect = document.querySelector('.reviewBrandTagline')?.getBoundingClientRect();
    const languageButtonRect = document.querySelector('.langTopBtn')?.getBoundingClientRect();
    const languageTextRect = document.querySelector('.langTopBtn span')?.getBoundingClientRect();
    const rect = value => value ? {
      top: value.top,
      right: value.right,
      bottom: value.bottom,
      left: value.left,
      width: value.width,
      height: value.height,
    } : null;
    const stageChildren = [...document.querySelector('.stage').children];
    const lastContent = stageChildren
      .map(element => ({ className: element.className, bottom: element.getBoundingClientRect().bottom }))
      .sort((left, right) => right.bottom - left.bottom)[0];
    const reviewContentBottom = lastContent.bottom;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      scroll: { width: root.scrollWidth, height: root.scrollHeight },
      fits: root.scrollWidth <= innerWidth && root.scrollHeight <= innerHeight,
      clipped: clipped.map(element => ({
        text: element.textContent.trim(),
        tagName: element.tagName,
        className: element.className,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      })),
      minFontSize: Math.min(...coreTextTargets.map(element => parseFloat(getComputedStyle(element).fontSize))),
      minTouchWidth: Math.min(...touchSizes.map(size => size.width)),
      minTouchHeight: Math.min(...touchSizes.map(size => size.height)),
      touchSizes,
      discountTextMetrics,
      hiddenRequired: requiredVisibleTargets
        .filter(element => {
          const style = getComputedStyle(element);
          const rect = element.getBoundingClientRect();
          return style.display === 'none' || style.visibility === 'hidden' ||
            parseFloat(style.opacity) === 0 || rect.width < 1 || rect.height < 1;
        })
        .map(element => element.className || element.tagName),
      contentOverlapPx: cartbarRect ? Math.max(0, reviewContentBottom - cartbarRect.top) : 0,
      lastContent,
      reviewBrand: isPhoneReview ? {
        location: rect(locationRect),
        logo: rect(logoRect),
        tagline: rect(taglineRect),
        gapAboveLogo: logoRect.top - locationRect.bottom,
        gapBelowLogo: taglineRect.top - logoRect.bottom,
        ordered: locationRect.top < logoRect.top && logoRect.top < taglineRect.top,
        contained: locationRect.left >= brandRect.left - 1 &&
          locationRect.right <= brandRect.right + 1 &&
          locationRect.top >= brandRect.top - 1 &&
          locationRect.bottom <= brandRect.bottom + 1 &&
          taglineRect.left >= brandRect.left - 1 &&
          taglineRect.right <= brandRect.right + 1 &&
          taglineRect.top >= brandRect.top - 1 &&
          taglineRect.bottom <= brandRect.bottom + 1 &&
          logoRect.top >= brandRect.top - 1 &&
          logoRect.bottom <= brandRect.bottom + 1,
        separateFromLanguage: brandRect.right <= languageButtonRect.left,
      } : null,
      nonPhoneTaglineHidden: isPhoneReview ? null :
        getComputedStyle(document.querySelector('.reviewBrandTagline')).display === 'none',
      languageBounds: {
        button: rect(languageButtonRect),
        text: rect(languageTextRect),
        textInsideButton: languageTextRect.left >= languageButtonRect.left &&
          languageTextRect.right <= languageButtonRect.right &&
          languageTextRect.top >= languageButtonRect.top &&
          languageTextRect.bottom <= languageButtonRect.bottom,
        buttonInsideViewport: languageButtonRect.left >= 0 &&
          languageButtonRect.right <= innerWidth &&
          languageButtonRect.top >= 0 &&
          languageButtonRect.bottom <= innerHeight,
      },
      layout: root.dataset.layout
    };
  })()
`;

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    show: false,
    frame: false,
    skipTaskbar: true,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      offscreen: true,
      sandbox: true,
    },
  });
  const results = [];
  window.webContents.debugger.attach('1.3');

  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height);
    await window.loadFile(path.join(root, 'index.html'));
    for (const locale of locales) {
      for (const scenario of scenarios) {
        await window.webContents.executeJavaScript(fixtureScript(locale, scenario), true);
        const measurement = await window.webContents.executeJavaScript(measureScript, true);
        results.push({ viewportName: viewport.name, locale, scenario: scenario.name, ...measurement });
      }
    }
    await window.webContents.executeJavaScript(fixtureScript('ko', richScenario), true);
    results.push({
      viewportName: viewport.name,
      locale: 'ko',
      scenario: richScenario.name,
      ...await window.webContents.executeJavaScript(measureScript, true),
    });
    if (captureScreenshots) {
      await window.webContents.executeJavaScript(fixtureScript('ko', richScenario), true);
      await captureExact(window, viewport, 'after');
      if (beforeSha) {
        const baselineCss = ['phone', 'tablet', 'kiosk21']
          .map(device => execFileSync(
            'git',
            ['show', `${beforeSha}:styles/device-${device}.css`],
            { cwd: root, encoding: 'utf8' }
          ))
          .join('\n');
        await window.webContents.executeJavaScript(`
          document.querySelectorAll('link[href*="styles/device-"]').forEach(link => {
            link.disabled = true;
          });
          const baseline = document.createElement('style');
          baseline.id = 'order-review-baseline-css';
          baseline.textContent = ${JSON.stringify(baselineCss)};
          document.head.appendChild(baseline);
          render();
        `, true);
        await captureExact(window, viewport, 'before');
      }
    }
  }

  const report = {
    viewports,
    locales,
    scenarios: [...scenarios.map(({ name }) => name), richScenario.name],
    results,
  };
  if (captureScreenshots) {
    fs.writeFileSync(
      path.join(root, 'artifacts', 'order-review-layout-measurements.json'),
      `${JSON.stringify(report, null, 2)}\n`
    );
  }
  process.stdout.write(`ORDER_REVIEW_LAYOUT_RESULT=${JSON.stringify(report)}\n`);
  window.destroy();
  app.quit();
}).catch(error => {
  console.error(error);
  app.exit(1);
});
