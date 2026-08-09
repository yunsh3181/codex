const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { runElectronVerification } = require('./electron-verification-lifecycle');

const root = path.resolve(__dirname, '..');
const captureScreenshots = process.argv.includes('--screenshots');
const writeAggregateReport = captureScreenshots || process.argv.includes('--aggregate-report');
const beforeShaArg = process.argv.find(argument => argument.startsWith('--before-sha='));
const beforeSha = beforeShaArg ? beforeShaArg.slice('--before-sha='.length) : null;
const reportPath = process.env.ORDER_REVIEW_REPORT || null;
const screenshotDir = process.env.ORDER_REVIEW_SCREENSHOT_DIR || path.join(root, 'artifacts');
if (captureScreenshots) fs.mkdirSync(screenshotDir, { recursive: true });
const userDataPath = process.env.ELECTRON_VERIFICATION_USER_DATA || path.join(app.getPath('temp'), `order-review-layout-${process.pid}`);
fs.mkdirSync(userDataPath, { recursive: true });
app.setPath('userData', userDataPath);
const viewports = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1080x1920', width: 1080, height: 1920 },
];
const locales = ['ko', 'en', 'ja', 'zh', 'vi', 'es'];
const scenarios = [
  { name: 'normal-whole', promo: 'normal', size: 'L', mode: 'single', set: null, right: null },
  { name: 'two-items', promo: 'normal', size: 'L', mode: 'single', set: null, right: null, orderCount: 2 },
  { name: 'three-items', promo: 'normal', size: 'L', mode: 'single', set: null, right: null, orderCount: 3 },
  { name: 'four-items', promo: 'normal', size: 'L', mode: 'single', set: null, right: null, orderCount: 4 },
  { name: 'takeout-half', promo: 'takeout', size: 'L', mode: 'half', set: null, right: 'P002' },
  { name: 'set-2', promo: 'set', size: 'R', mode: 'single', set: 2, right: null },
  { name: 'set-3', promo: 'set', size: 'L', mode: 'single', set: 3, right: null },
  { name: 'set-4', promo: 'set', size: 'F', mode: 'single', set: 4, right: null },
  { name: 'upup', promo: 'upup', size: 'F', mode: 'single', set: null, right: null },
  { name: 'happy-hour', promo: 'happy', size: 'R', mode: 'single', set: null, right: null },
  {
    name: 'multi-pizza',
    promo: 'normal',
    size: 'L',
    mode: 'single',
    set: null,
    right: null,
    crust: '오리지널',
    left: 'P003',
    orderCount: 1,
    quantity: 2,
  },
  {
    name: 'max-categories',
    promo: 'takeout',
    size: 'L',
    mode: 'single',
    set: null,
    right: null,
    topping: true,
    extras: true,
    orderCount: 1,
  },
  {
    name: 'long-complex-order',
    promo: 'takeout',
    size: 'L',
    mode: 'half',
    set: null,
    right: 'P002',
    crust: '치즈롤',
    left: 'P003',
    topping: true,
    extras: true,
    orderCount: 4,
    phoneOrderCount: 4,
    quantity: 2,
  },
  { name: 'five-items', promo: 'normal', size: 'L', mode: 'single', set: null, right: null, orderCount: 5 },
  { name: 'six-items', promo: 'upup', size: 'F', mode: 'single', set: null, right: null, orderCount: 6 },
  {
    name: 'bulk-pagination',
    promo: 'normal', size: 'L', mode: 'single', set: null, right: null,
    crust: '오리지널', left: 'P003', topping: false, extras: false,
    orderCount: 10, quantity: 1,
  },
  { name: 'max-cart-items', promo: 'set', size: 'L', mode: 'single', set: 3, right: null, included: true, extras: true, orderCount: 12 },
];

app.commandLine.appendSwitch('headless');
app.commandLine.appendSwitch('hide-scrollbars');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

const waitForLayout = window => window.webContents.executeJavaScript(`(async () => {
  await document.fonts.ready;
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})()`, true);
const captureExact = async (window, viewport, prefix) => {
  await waitForLayout(window);
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
    path.join(screenshotDir, `order-review-${prefix}-${viewport.name}.png`),
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
      left: ${JSON.stringify(scenario.left || 'P001')},
      right: ${JSON.stringify(scenario.right)},
      crust: ${JSON.stringify(scenario.crust || '치즈롤')},
      toppingChoice: 'add',
      toppings: ${scenario.topping ? '{ T001: 1 }' : '{}'},
      extraSides: ${scenario.extras ? '{ S002: 1 }' : '{}'},
      extraDrinks: ${scenario.extras ? '{ D002: 1, D010: 1 }' : '{}'},
      setSides: ${scenario.included ? "{ S009: 1 }" : '{}'},
      setDrink: ${scenario.included ? "'D001'" : 'null'},
      disposables: false,
      cartItems: []
    });
    const snapshot = orderSnapshot();
    state.cartItems = Array.from(
      { length: document.documentElement.dataset.layout === 'kiosk21'
        ? ${JSON.stringify(scenario.orderCount || 1)}
        : document.documentElement.dataset.layout === 'phone'
          ? ${JSON.stringify(scenario.phoneOrderCount || 1)}
          : 1 },
      () => ({ ...snapshot, qty: ${JSON.stringify(scenario.quantity || 1)} })
    );
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
    const textTargets = targets.filter(element => {
      const rect=element.getBoundingClientRect();
      return element.children.length===0&&element.textContent.trim()&&rect.width>0&&rect.height>0;
    });
    const touchTargets = [...document.querySelectorAll(
      '.cartOrderActions button, .reviewAddMoreGrid button, .reviewConfirmBtn, .langTopBtn'
    )].filter(element => { const rect=element.getBoundingClientRect(); return rect.width>0&&rect.height>0 });
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
    const orderList = document.querySelector('.reviewOrderList');
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
    const stage = document.querySelector('.stage');
    const stagePaddingBottom = parseFloat(getComputedStyle(stage).paddingBottom) || 0;
    const horizontalOverflow = Math.max(0, root.scrollWidth - innerWidth);
    const verticalScrollable = root.scrollHeight > innerHeight + 1;
    const contentBottomGap = cartbarRect ? stagePaddingBottom - cartbarRect.height : stagePaddingBottom;
    const visibleCoreRects = coreTextTargets
      .filter(element => getComputedStyle(element).display !== 'none')
      .map(element => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const overlaps = [];
    for (let left = 0; left < visibleCoreRects.length; left += 1) {
      for (let right = left + 1; right < visibleCoreRects.length; right += 1) {
        const a = visibleCoreRects[left], b = visibleCoreRects[right];
        if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
        const width = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
        const height = Math.min(a.rect.bottom, b.rect.bottom) - Math.max(a.rect.top, b.rect.top);
        if (width > 1 && height > 1) overlaps.push([a.element.className, b.element.className]);
      }
    }
    const fontSize = (selector, fallback) => {
      const element = document.querySelector(selector);
      return element ? parseFloat(getComputedStyle(element).fontSize) : fallback;
    };
    const visibleIndexes=[...document.querySelectorAll('.reviewOrderCard')].map((card,index)=>card.hidden?null:index).filter(index=>index!==null);
    const measuredGap=Number(reviewPageMetrics?.gap||0);
    const usedHeight=visibleIndexes.reduce((sum,index)=>sum+Number(reviewPageMetrics?.cardHeights?.[index]||0),0)+Math.max(0,visibleIndexes.length-1)*measuredGap;
    const nextIndex=visibleIndexes.length?visibleIndexes[visibleIndexes.length-1]+1:null;
    const nextCardHeight=nextIndex===null?0:Number(reviewPageMetrics?.cardHeights?.[nextIndex]||0);
    const pager=document.querySelector('.reviewPager');
    const currentPageMetric=reviewPageMetrics?.pageMetrics?.[reviewPage]||null;
    return {
      viewport: { width: innerWidth, height: innerHeight },
      orderItemCount: document.querySelectorAll('.reviewOrderCard').length,
      orderQuantity: state.cartItems.reduce((sum, item) => sum + Number(item.qty || 1), 0),
      compressionStage: Number(document.body.dataset.reviewCompression || 0),
      densityMode: document.body.dataset.reviewDensity || 'default',
      pageCount: Array.isArray(reviewPages) ? reviewPages.length : 1,
      currentPage: Number(reviewPage || 0) + 1,
      visibleItemCount: [...document.querySelectorAll('.reviewOrderCard')].filter(card => !card.hidden).length,
      pageItemIndexes: Array.isArray(reviewPages) ? reviewPages.map(page => [...page]) : [],
      cardCount: document.querySelectorAll('.reviewOrderCard').length,
      availableHeight: currentPageMetric?.availableHeight??orderList?.clientHeight??0,
      usedHeight:currentPageMetric?.usedHeight??usedHeight,
      remainingHeight:currentPageMetric?.remainingHeight??((orderList?.clientHeight||0)-usedHeight),
      visibleIndexes,
      visibleCount:visibleIndexes.length,
      minimumFontSize:Math.min(...coreTextTargets.map(element=>parseFloat(getComputedStyle(element).fontSize))),
      pagerReservedHeight:pager&&!pager.hidden?pager.getBoundingClientRect().height:0,
      canFitNextCard:Boolean(currentPageMetric?.canFitNextCard),
      orderRegion: {
        scrollHeight: orderList?.scrollHeight || 0,
        clientHeight: orderList?.clientHeight || 0,
      },
      scroll: { width: root.scrollWidth, height: root.scrollHeight },
      fits: root.scrollWidth <= innerWidth && root.scrollHeight <= innerHeight,
      horizontalOverflow,
      verticalScrollable,
      contentBottomGap,
      overlapCount: overlaps.length,
      typography: {
        title: fontSize('.title', 0),
        menuName: fontSize('.cartPizzaToppingLine', 0),
        options: fontSize('.cartPizzaMeta', 0),
        quantityPrice: fontSize('.cartItemQuantity', 14),
        totalPayment: fontSize('.reviewDiscountBox .final', 0),
      },
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
      stageSections: stageChildren.map(element => ({
        className: element.className,
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
        height: element.getBoundingClientRect().height,
      })),
      reviewSections: [...document.querySelectorAll('.reviewOrderCard > *')].map(element => ({
        className: element.className,
        height: element.getBoundingClientRect().height,
      })),
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

const paginationTraceScript = `
  (async () => {
    if(document.documentElement.dataset.layout!=='kiosk21'||reviewPages.length<2)return null;
    const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const snapshot=()=>{
      const list=document.querySelector('.reviewOrderList');
      const cards=[...document.querySelectorAll('.reviewOrderCard')];
      const visibleIndexes=cards.map((card,index)=>card.hidden?null:index).filter(index=>index!==null);
      const gap=Number(reviewPageMetrics.gap||0);
      const metric=reviewPageMetrics.pageMetrics?.[reviewPage]||{};
      const heights=visibleIndexes.map(index=>Math.ceil(Math.max(cards[index].getBoundingClientRect().height,cards[index].scrollHeight)));
      const usedHeight=Number(metric.usedHeight??(heights.reduce((sum,height)=>sum+height,0)+Math.max(0,heights.length-1)*gap));
      const nextIndex=visibleIndexes.length?visibleIndexes[visibleIndexes.length-1]+1:null;
      const nextHeight=nextIndex!==null?Number(reviewPageMetrics.cardHeights[nextIndex]||0):0;
      const previous=document.querySelector('.reviewPagePrev');
      const next=document.querySelector('.reviewPageNext');
      const status=document.querySelector('.reviewPageStatus');
      const pager=document.querySelector('.reviewPager');
      return {
        page:Number(reviewPage)+1,
        visibleIndexes,
        visibleCount:visibleIndexes.length,
        availableHeight:Number(metric.availableHeight??list.clientHeight),
        usedHeight,
        remainingHeight:Number(metric.remainingHeight??(list.clientHeight-usedHeight)),
        overflow:Math.max(0,list.scrollHeight-list.clientHeight),
        clipping:[...cards.filter(card=>!card.hidden).flatMap(card=>[...card.querySelectorAll('*')])].filter(element=>element.children.length===0&&element.textContent.trim()&&(element.scrollWidth>element.clientWidth+2||element.scrollHeight>element.clientHeight+2)).length,
        previousDisabled:previous.disabled,
        nextDisabled:next.disabled,
        statusText:status.textContent.trim(),
        focusClass:document.activeElement?.className||'',
        pagerReservedHeight:pager.hidden?0:pager.getBoundingClientRect().height,
        nextCardHeight:Number(metric.nextCardHeight??nextHeight),
        canFitNextCard:Boolean(metric.canFitNextCard),
        totalsText:document.querySelector('.reviewDiscountBox')?.textContent.replace(/\\s+/g,' ').trim()||''
      };
    };
    const pages=[snapshot()];
    while(!document.querySelector('.reviewPageNext').disabled){document.querySelector('.reviewPageNext').click();await settle();pages.push(snapshot())}
    while(!document.querySelector('.reviewPagePrev').disabled){document.querySelector('.reviewPagePrev').click();await settle()}
    return {pages,returnToFirst:snapshot()};
  })()
`;

runElectronVerification({ app }, async lifecycle => {
  if (reportPath) lifecycle.expectReport(reportPath);
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
  lifecycle.attachDebugger();

  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height);
    await window.loadFile(path.join(root, 'index.html'));
    for (const locale of locales) {
      for (const scenario of scenarios) {
        await window.webContents.executeJavaScript(fixtureScript(locale, scenario), true);
        await waitForLayout(window);
        const measurement = await window.webContents.executeJavaScript(measureScript, true);
        const paginationTrace = await window.webContents.executeJavaScript(paginationTraceScript, true);
        results.push({ viewportName: viewport.name, locale, scenario: scenario.name, ...measurement, paginationTrace });
      }
    }
    if (captureScreenshots) {
      const captureScenario = scenarios.find(scenario => scenario.name === 'long-complex-order');
      await window.webContents.executeJavaScript(fixtureScript('ko', captureScenario), true);
      await waitForLayout(window);
      await captureExact(window, viewport, 'after');
      if(viewport.name==='1080x1920'){
        const normalScenario=scenarios.find(scenario=>scenario.name==='normal-whole');
        await window.webContents.executeJavaScript(fixtureScript('ko',normalScenario),true);
        await waitForLayout(window);
        await captureExact(window,viewport,'normal-no-pager');
        const bulkScenario=scenarios.find(scenario=>scenario.name==='bulk-pagination');
        await window.webContents.executeJavaScript(fixtureScript('ko',bulkScenario),true);
        await waitForLayout(window);
        await captureExact(window,viewport,'pagination-first');
        await window.webContents.executeJavaScript(`for(let index=0;index<Math.floor((reviewPages.length-1)/2);index+=1)document.querySelector('.reviewPageNext').click()`,true);
        await waitForLayout(window);
        await captureExact(window,viewport,'pagination-middle');
        await window.webContents.executeJavaScript(`while(!document.querySelector('.reviewPageNext').disabled)document.querySelector('.reviewPageNext').click()`,true);
        await waitForLayout(window);
        await captureExact(window,viewport,'pagination-last');
      }
      if (viewport.width <= 390) {
        await window.webContents.executeJavaScript('window.scrollTo(0, document.documentElement.scrollHeight)', true);
        await captureExact(window, viewport, 'after-bottom');
        await window.webContents.executeJavaScript("state.step='home'; render(); window.scrollTo(0, 0)", true);
        await captureExact(window, viewport, 'home-after');
        await window.webContents.executeJavaScript(fixtureScript('es', captureScenario), true);
        await captureExact(window, viewport, 'es-after');
      }
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
    scenarios: scenarios.map(({ name }) => name),
    results,
  };
  if (writeAggregateReport) {
    const phoneResults = results.filter(result => result.layout === 'phone');
    const range = values => ({ min: Math.min(...values), max: Math.max(...values) });
    const layoutSummary = layout => {
      const matches = results.filter(result => result.layout === layout);
      return {
        changed: layout === 'kiosk21',
        combinations: matches.length,
        overlapCount: matches.reduce((total, result) => total + result.overlapCount, 0),
        clippedTextCount: matches.reduce((total, result) => total + result.clipped.length, 0),
        maxHorizontalOverflow: Math.max(0, ...matches.map(result => result.horizontalOverflow)),
      };
    };
    const aggregateReport = {
      viewports: viewports.map(viewport => viewport.name),
      locales,
      scenarios: scenarios.map(({ name }) => name),
      totalCombinations: results.length,
      overlapCount: results.reduce((total, result) => total + result.overlapCount, 0),
      clippedTextCount: results.reduce((total, result) => total + result.clipped.length, 0),
      maxHorizontalOverflow: Math.max(...results.map(result => result.horizontalOverflow)),
      scrollHeightByLocale: Object.fromEntries(locales.map(locale => [
        locale,
        range(phoneResults.filter(result => result.locale === locale).map(result => result.scroll.height)),
      ])),
      minimumBottomSafetyGap: Math.min(...phoneResults.map(result => result.contentBottomGap)),
      typography: {
        review: Object.fromEntries(Object.keys(phoneResults[0].typography).map(key => [
          key,
          range(phoneResults.map(result => result.typography[key])),
        ])),
        homeCards: {
          orderTypeTitle: 20,
          orderTypeDescription: 12,
          promotionTitle: 14,
          promotionHighlight: 14,
          promotionDescription: 11,
        },
      },
      kioskMeasurements: results.filter(result=>result.layout==='kiosk21'&&result.locale==='ko').map(result=>({
        scenario:result.scenario,
        densityMode:result.densityMode,
        availableHeight:result.availableHeight,
        usedHeight:result.usedHeight,
        remainingHeight:result.remainingHeight,
        visibleIndexes:result.visibleIndexes,
        visibleCount:result.visibleCount,
        minimumFontSize:result.minimumFontSize,
        pageCount:result.pageCount,
        cardCount:result.cardCount,
        pagerReservedHeight:result.pagerReservedHeight,
        canFitNextCard:result.canFitNextCard,
        pages:result.paginationTrace?.pages||[],
      })),
      protectedLayouts: {
        kiosk: layoutSummary('kiosk21'),
        tablet: layoutSummary('tablet'),
        desktop: {
          changed: false,
          verification: 'Order review implementation requires html[data-layout="kiosk21"] and body[data-step="review"].',
        },
      },
    };
    fs.writeFileSync(
      path.join(root, 'artifacts', 'order-review-layout-measurements.json'),
      `${JSON.stringify(aggregateReport, null, 2)}\n`
    );
  }
  if (reportPath) {
    await lifecycle.writeReportAtomically(reportPath, report);
    process.stdout.write(`ORDER_REVIEW_LAYOUT_REPORT=${reportPath}\n`);
  } else {
    process.stdout.write(`ORDER_REVIEW_LAYOUT_RESULT=${JSON.stringify(report)}\n`);
  }
});
