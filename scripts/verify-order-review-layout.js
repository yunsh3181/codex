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
  { name: '834x940', width: 834, height: 940 },
  { name: '834x1112', width: 834, height: 1112 },
  { name: '810x1080', width: 810, height: 1080 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1080x1920', width: 1080, height: 1920 },
  { name: '1920x1080', width: 1920, height: 1080 },
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
  { name: 'set-one', promo: 'set', size: 'L', mode: 'single', set: 3, right: null, included: true, orderCount: 1 },
  { name: 'set-three-photo', promo: 'set', size: 'L', mode: 'single', set: 3, right: null, included: true, orderCount: 3 },
  { name: 'set-four', promo: 'set', size: 'F', mode: 'single', set: 4, right: null, included: true, orderCount: 4 },
  { name: 'set-four-long', promo: 'set', size: 'F', mode: 'single', set: 4, right: null, included: true, extras: true, crust: '치즈롤', left: 'P003', orderCount: 4 },
  { name: 'set-four-upup', promo: 'set', size: 'L', mode: 'single', set: 3, right: null, included: true, orderCount: 4, mixedUpUp: true },
  { name: 'four-items-forced-overflow', promo: 'set', size: 'F', mode: 'single', set: 4, right: null, included: true, extras: true, crust: '치즈롤', left: 'P003', orderCount: 4, artificialLong: true },
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
const selectedViewports=process.env.ORDER_REVIEW_ONLY_VIEWPORT?viewports.filter(viewport=>viewport.name===process.env.ORDER_REVIEW_ONLY_VIEWPORT):viewports;
const selectedLocales=process.env.ORDER_REVIEW_ONLY_LOCALE?locales.filter(locale=>locale===process.env.ORDER_REVIEW_ONLY_LOCALE):locales;
const selectedScenarios=process.env.ORDER_REVIEW_ONLY_SCENARIO?scenarios.filter(scenario=>scenario.name===process.env.ORDER_REVIEW_ONLY_SCENARIO):scenarios;

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
const dispatchTouch = (window,type,x,y,id=41) => window.webContents.debugger.sendCommand('Input.dispatchTouchEvent',{
  type,
  touchPoints:type==='touchEnd'?[]:[{x,y,id,radiusX:4,radiusY:4,force:1}],
});
const touchTap = async (window,selector) => {
  const point=await window.webContents.executeJavaScript(`(()=>{const element=document.querySelector(${JSON.stringify(selector)}),rect=element.getBoundingClientRect();return{x:rect.left+rect.width/2,y:rect.top+rect.height/2}})()`,true);
  await dispatchTouch(window,'touchStart',point.x,point.y);
  await dispatchTouch(window,'touchEnd',point.x,point.y);
  await waitForLayout(window);
  return point;
};
const runTouchEvidence = async window => {
  window.setContentSize(834,940);
  await window.loadFile(path.join(root,'index.html'));
  const scenario=scenarios.find(candidate=>candidate.name==='max-cart-items');
  await window.webContents.executeJavaScript(fixtureScript('ko',scenario),true);
  await waitForLayout(window);
  await window.webContents.executeJavaScript(`(()=>{window.__reviewTouchEvents=[];window.__reviewActionTouches=0;window.__reviewTouchListener=event=>window.__reviewTouchEvents.push({type:event.type,trusted:event.isTrusted,pointerType:event.pointerType||null});window.__reviewActionListener=()=>window.__reviewActionTouches++;for(const type of ['pointerdown','touchstart','pointerup','touchend','click'])document.addEventListener(type,window.__reviewTouchListener,true);document.querySelector('.reviewOrderList').addEventListener('click',event=>{if(event.target.closest('.cartOrderActions'))window.__reviewActionListener()})})()`,true);
  const plan=await window.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.reviewOrderList'),rect=list.getBoundingClientRect();return{x:rect.left+rect.width*.55,from:rect.bottom-42,to:rect.top+42,before:list.scrollTop,max:list.scrollHeight-list.clientHeight}})()`,true);
  await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  try{
    await dispatchTouch(window,'touchStart',plan.x,plan.from,42);
    for(let index=1;index<=8;index+=1){await dispatchTouch(window,'touchMove',plan.x,plan.from+(plan.to-plan.from)*index/8,42);await new Promise(resolve=>setTimeout(resolve,16))}
    await dispatchTouch(window,'touchEnd',plan.x,plan.to,42);
    await new Promise(resolve=>setTimeout(resolve,240));
    const afterSwipe=await window.webContents.executeJavaScript(`document.querySelector('.reviewOrderList').scrollTop`,true);
    await touchTap(window,'.reviewScrollDown');
    await new Promise(resolve=>setTimeout(resolve,360));
    const afterDown=await window.webContents.executeJavaScript(`document.querySelector('.reviewOrderList').scrollTop`,true);
    await window.webContents.executeJavaScript(`{const list=document.querySelector('.reviewOrderList');list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event('scroll'))}`,true);
    const bottom=await window.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.reviewOrderList');return{top:list.scrollTop,max:list.scrollHeight-list.clientHeight,downDisabled:document.querySelector('.reviewScrollDown').disabled}})()`,true);
    await touchTap(window,'.reviewScrollUp');
    await new Promise(resolve=>setTimeout(resolve,360));
    const afterUp=await window.webContents.executeJavaScript(`document.querySelector('.reviewOrderList').scrollTop`,true);
    await touchTap(window,'#customerCartButton');
    const modalOpened=await window.webContents.executeJavaScript(`state.modal==='cartView'&&document.querySelectorAll('.cartViewModal').length===1`,true);
    const modalPlan=await window.webContents.executeJavaScript(`(()=>{const list=document.querySelector('.cartModalOrderList'),rect=list.getBoundingClientRect();return{x:rect.left+rect.width/2,from:rect.bottom-32,to:rect.top+32,before:list.scrollTop,max:list.scrollHeight-list.clientHeight}})()`,true);
    await dispatchTouch(window,'touchStart',modalPlan.x,modalPlan.from,43);
    for(let index=1;index<=8;index+=1){await dispatchTouch(window,'touchMove',modalPlan.x,modalPlan.from+(modalPlan.to-modalPlan.from)*index/8,43);await new Promise(resolve=>setTimeout(resolve,16))}
    await dispatchTouch(window,'touchEnd',modalPlan.x,modalPlan.to,43);
    await new Promise(resolve=>setTimeout(resolve,240));
    const modalAfter=await window.webContents.executeJavaScript(`document.querySelector('.cartModalOrderList').scrollTop`,true);
    await touchTap(window,'.cartModalClose');
    return await window.webContents.executeJavaScript(`({afterSwipe:${afterSwipe},afterDown:${afterDown},bottom:${JSON.stringify(bottom)},afterUp:${afterUp},modalOpened:${modalOpened},modalScrollBefore:${modalPlan.before},modalScrollMax:${modalPlan.max},modalAfter:${modalAfter},modalClosed:state.modal===null,focusReturned:document.activeElement?.id==='customerCartButton',actionMisselects:window.__reviewActionTouches,events:window.__reviewTouchEvents,trusted:window.__reviewTouchEvents.every(event=>event.trusted)})`,true);
  }finally{
    await window.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled',{enabled:false});
  }
};

const fixtureScript = (locale, scenario) => `
  (async () => {
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
    const snapshots = [snapshot];
    if (${JSON.stringify(Boolean(scenario.mixedUpUp))}) {
      Object.assign(state, { promo: 'upup', set: null, size: 'F', left: 'P003', crust: '치즈롤' });
      snapshots.push(orderSnapshot());
    }
    state.cartItems = Array.from(
      { length: document.documentElement.dataset.layout === 'phone'
        ? ${JSON.stringify(scenario.phoneOrderCount || scenario.orderCount || 1)}
        : ${JSON.stringify(scenario.orderCount || 1)} },
      (_, index) => ({ ...snapshots[index % snapshots.length], qty: ${JSON.stringify(scenario.quantity || 1)} })
    );
    clearCurrentProduct();
    state.step = 'review';
    window.scrollTo(0, 0);
    render();
    if (${JSON.stringify(Boolean(scenario.artificialLong))} && document.documentElement.dataset.layout === 'kiosk21') {
      document.querySelectorAll('.reviewOrderCard').forEach((card, index) => {
        const stress=document.createElement('p');
        stress.className='reviewStressText';
        stress.textContent=('장문 옵션 검증 ${'매우 긴 피자명과 치즈롤 토핑 사이드 음료 혜택 '.repeat(12)}' + (index + 1));
        card.querySelector('.cartCategory')?.append(stress);
      });
      scheduleOrderReviewFit();
    }
    document.getAnimations().forEach(animation => animation.finish());
  })()
`;

const measureScript = `
  (() => {
    const root = document.documentElement;
    const targets = [...document.querySelectorAll(
      '.reviewOrderCard *, .reviewAddMore *, .reviewDiscountBox *, .reviewConfirmBtn, .reviewScrollControls *'
    )];
    const coreTextTargets = [...document.querySelectorAll(
      '.reviewMenuName, .reviewMenuQuantity, .reviewMenuAmount, .reviewOrderTotal, ' +
      '.reviewOrderBadge, .reviewDiscountBox .line'
    )];
    const textTargets = targets.filter(element => {
      const rect=element.getBoundingClientRect();
      return element.children.length===0&&element.textContent.trim()&&rect.width>0&&rect.height>0;
    });
    const touchTargets = [...document.querySelectorAll(
      '.reviewOrderActions button, .reviewAddOrderButton, .reviewScrollControls button, ' +
      '.reviewBottomActions button, .customerCartButton, .langTopBtn'
    )].filter(element => { const rect=element.getBoundingClientRect(); return rect.width>0&&rect.height>0 });
    const isPhoneReview = root.dataset.layout === 'phone';
    const requiredSelector = [
      '.progress',
      '.progress .progressStep',
      '.langTopBtn span',
      '.reviewBottomActions .reviewHomeBtn',
      '.reviewBottomActions .reviewBackBtn',
      '.reviewBottomActions .customerCartButton',
      '.reviewBottomActions .reviewDockConfirm',
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
    const cartbarRect = (document.querySelector('.reviewBottomActions') ||
      document.querySelector('.cartbar'))?.getBoundingClientRect();
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
    const stageChildren = [...document.querySelector('.stage').children]
      .filter(element => getComputedStyle(element).position !== 'fixed');
    const lastContent = stageChildren
      .map(element => ({ className: element.className, bottom: element.getBoundingClientRect().bottom }))
      .sort((left, right) => right.bottom - left.bottom)[0];
    const reviewContentBottom = lastContent.bottom;
    const stage = document.querySelector('.stage');
    const stagePaddingBottom = parseFloat(getComputedStyle(stage).paddingBottom) || 0;
    const horizontalOverflow = Math.max(0, root.scrollWidth - innerWidth);
    const verticalScrollable = root.scrollHeight > innerHeight + 1;
    const contentBottomGap = cartbarRect ? stagePaddingBottom - cartbarRect.height : stagePaddingBottom;
    const clippedVisibleRect = element => {
      const clipped = rect(element.getBoundingClientRect());
      for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor);
        if (!/(auto|scroll|hidden|clip)/.test(style.overflow + ' ' + style.overflowX + ' ' + style.overflowY)) continue;
        const boundary = ancestor.getBoundingClientRect();
        clipped.top = Math.max(clipped.top, boundary.top);
        clipped.right = Math.min(clipped.right, boundary.right);
        clipped.bottom = Math.min(clipped.bottom, boundary.bottom);
        clipped.left = Math.max(clipped.left, boundary.left);
        clipped.width = Math.max(0, clipped.right - clipped.left);
        clipped.height = Math.max(0, clipped.bottom - clipped.top);
      }
      return clipped;
    };
    const visibleCoreRects = coreTextTargets
      .filter(element => getComputedStyle(element).display !== 'none')
      .map(element => ({ element, rect: clippedVisibleRect(element) }))
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
      cartBadgeCount: cartTopLevelQuantity(),
      compressionStage: Number(document.body.dataset.reviewCompression || 0),
      densityMode: document.body.dataset.reviewDensity || 'default',
      reviewPageFits: document.body.dataset.reviewPageFits === 'true',
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
        scrollTop: orderList?.scrollTop || 0,
      },
      scrollControls: (() => {
        const controls = document.querySelector('.reviewScrollControls');
        const up = controls?.querySelector('.reviewScrollUp');
        const down = controls?.querySelector('.reviewScrollDown');
        return {
          hidden: Boolean(controls?.hidden),
          upDisabled: Boolean(up?.disabled),
          downDisabled: Boolean(down?.disabled),
        };
      })(),
      scroll: { width: root.scrollWidth, height: root.scrollHeight },
      fits: root.scrollWidth <= innerWidth && root.scrollHeight <= innerHeight,
      horizontalOverflow,
      verticalScrollable,
      contentBottomGap,
      overlapCount: overlaps.length,
      typography: {
        title: fontSize('.title', 0),
        menuName: fontSize('.reviewMenuName', 0),
        options: fontSize('.reviewOrderBadge', 0),
        quantityPrice: fontSize('.reviewMenuAmount', fontSize('.reviewMenuQuantity', 0)),
        summary: fontSize('.reviewDiscountBox .line', 0),
        totalPayment: fontSize('.reviewDiscountBox .final strong', 0),
        footerButton: fontSize('.reviewDockConfirm', fontSize('.reviewInlineConfirm', 0)),
      },
      verticalSingleCharacterKorean: textTargets.filter(element => {
        const text=element.textContent.trim();
        if(!/[가-힣]{2,}/.test(text))return false;
        const style=getComputedStyle(element);
        const lineHeight=parseFloat(style.lineHeight)||parseFloat(style.fontSize)*1.2;
        return element.getBoundingClientRect().width<=parseFloat(style.fontSize)*1.6&&
          element.getBoundingClientRect().height>lineHeight*1.5;
      }).map(element=>element.textContent.trim()),
      confirmButton: (() => {
        const button = document.querySelector('.reviewDockConfirm') ||
          document.querySelector('.reviewInlineConfirm');
        const bounds = button?.getBoundingClientRect();
        return {
          rect: rect(bounds),
          bottomSafetyGap: bounds ? innerHeight - bounds.bottom : 0,
          visible: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
          enabled: Boolean(button && !button.disabled),
        };
      })(),
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

const cartModalMeasureScript = `
  (async () => {
    openCartModal();
    const modal = document.querySelector('.cartViewModal');
    const list = document.querySelector('.cartModalOrderList');
    const totals = document.querySelector('.cartModalTotals');
    const close = document.querySelector('.cartModalClose');
    const backdrop = document.querySelector('.cartViewBackdrop');
    const rect = element => { const value=element?.getBoundingClientRect(); return value ? {top:value.top,right:value.right,bottom:value.bottom,left:value.left,width:value.width,height:value.height} : null };
    const text = [...modal.querySelectorAll('h2,button,span,strong,small')].filter(element => {
      const value=element.getBoundingClientRect(); return value.width>0&&value.height>0&&element.children.length===0&&element.textContent.trim();
    });
    const result = {
      modal: rect(modal), list: rect(list), totals: rect(totals), close: rect(close), backdrop: rect(backdrop),
      itemCount: document.querySelectorAll('.cartModalOrderCard').length,
      empty: Boolean(document.querySelector('.cartModalEmpty')),
      horizontalOverflow: Math.max(0, modal.scrollWidth-modal.clientWidth),
      listOverflow: list ? Math.max(0,list.scrollHeight-list.clientHeight) : 0,
      clipped: text.filter(element=>element.scrollWidth>element.clientWidth+2||element.scrollHeight>element.clientHeight+2).map(element=>element.textContent.trim()),
      backgroundLocked: getComputedStyle(document.querySelector('.stage')).overflow==='hidden',
      dialogCount: document.querySelectorAll('.cartViewModal').length,
    };
    closeCartModal();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    result.closed = state.modal===null && !document.querySelector('.cartViewModal');
    result.focusReturned = document.activeElement?.id==='customerCartButton';
    return result;
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

const confirmClickScript = `
  (() => {
    if(document.documentElement.dataset.layout!=='kiosk21')return null;
    const button=document.querySelector('.reviewDockConfirm')||document.querySelector('.reviewConfirmBtn');
    let clickCount=0;
    button.addEventListener('click',()=>{clickCount+=1});
    const before=state.step;
    button.click();
    return {before,after:state.step,clickCount};
  })()
`;

const quantityMutationScript = `
  (async () => {
    if(document.documentElement.dataset.layout!=='kiosk21'||state.cartItems.length!==4)return null;
    const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const snapshot=()=>({
      quantities:state.cartItems.map(item=>Number(item.qty||1)),
      pageCount:reviewPages.length,
      pageItemIndexes:reviewPages.map(page=>[...page]),
      orderScrollHeight:document.querySelector('.reviewOrderList').scrollHeight,
      orderClientHeight:document.querySelector('.reviewOrderList').clientHeight,
      confirmVisible:(()=>{const rect=document.querySelector('.reviewDockConfirm').getBoundingClientRect();return rect.width>0&&rect.height>0})(),
      total:reviewTotals().final,
    });
    const before=snapshot();
    changeCartQty(0,1);
    await settle();
    const afterIncrement=snapshot();
    changeCartQty(0,-1);
    await settle();
    const afterDecrement=snapshot();
    return {before,afterIncrement,afterDecrement};
  })()
`;

const compressionTraceScript = `
  (() => {
    if(document.documentElement.dataset.layout!=='kiosk21')return null;
    const body=document.body;
    const list=document.querySelector('.reviewOrderList');
    const cards=[...document.querySelectorAll('.reviewOrderCard')];
    const pager=document.querySelector('.reviewPager');
    body.classList.remove('reviewCompact1','reviewCompact2','reviewPaginated');
    cards.forEach(card=>card.hidden=false);
    if(pager)pager.hidden=true;
    const read=stage=>{
      const gap=parseFloat(getComputedStyle(list).rowGap)||0;
      const usedHeight=cards.reduce((sum,card)=>sum+Math.ceil(Math.max(card.getBoundingClientRect().height,card.scrollHeight)),0)+Math.max(0,cards.length-1)*gap;
      return {stage,usedHeight,scrollHeight:list.scrollHeight,clientHeight:list.clientHeight,fits:list.scrollHeight<=list.clientHeight+1};
    };
    const stages=[read('default')];
    body.classList.add('reviewCompact1');
    stages.push(read('compact1'));
    body.classList.add('reviewCompact2');
    stages.push(read('compact2'));
    fitOrderReview();
    return stages;
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

  for (const viewport of selectedViewports) {
    window.setContentSize(viewport.width, viewport.height);
    await window.loadFile(path.join(root, 'index.html'));
    for (const locale of selectedLocales) {
      for (const scenario of selectedScenarios) {
        await window.webContents.executeJavaScript(fixtureScript(locale, scenario), true);
        await waitForLayout(window);
        const measurement = await window.webContents.executeJavaScript(measureScript, true);
        const cartModal = ['normal-whole','three-items','max-cart-items'].includes(scenario.name)
          ? await window.webContents.executeJavaScript(cartModalMeasureScript, true)
          : null;
        const paginationTrace = await window.webContents.executeJavaScript(paginationTraceScript, true);
        const compressionTrace = await window.webContents.executeJavaScript(compressionTraceScript, true);
        const quantityMutation = scenario.name === 'set-four'
          ? await window.webContents.executeJavaScript(quantityMutationScript, true)
          : null;
        const confirmClick = await window.webContents.executeJavaScript(confirmClickScript, true);
        results.push({ viewportName: viewport.name, locale, scenario: scenario.name, ...measurement, cartModal, paginationTrace, compressionTrace, quantityMutation, confirmClick });
      }
    }
    if (captureScreenshots) {
      const captureScenario = scenarios.find(scenario => scenario.name === 'long-complex-order');
      await window.webContents.executeJavaScript(fixtureScript('ko', captureScenario), true);
      await waitForLayout(window);
      await captureExact(window, viewport, 'after');
      const captureNamedScenario=async(scenarioName,locale,evidenceName,{bottom=false,modal=false}={})=>{
        const evidenceScenario=scenarios.find(candidate=>candidate.name===scenarioName);
        await window.webContents.executeJavaScript(fixtureScript(locale,evidenceScenario),true);
        await waitForLayout(window);
        if(bottom)await window.webContents.executeJavaScript(`{const list=document.querySelector('.reviewOrderList');list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event('scroll'))}`,true);
        if(modal){await window.webContents.executeJavaScript(`openCartModal()`,true);await waitForLayout(window)}
        await captureExact(window,viewport,evidenceName);
      };
      if(viewport.name==='1080x1920'){
        await captureNamedScenario('three-items','ko','required-ko-orders-3');
        await captureNamedScenario('max-cart-items','ko','required-ko-orders-12-top');
        await captureNamedScenario('max-cart-items','ko','required-ko-orders-12-bottom',{bottom:true});
      }
      if(viewport.name==='834x940')await captureNamedScenario('six-items','ko','required-ko-orders-6');
      if(viewport.name==='834x1112'){
        await captureNamedScenario('three-items','ko','required-ko-orders-3');
        await captureNamedScenario('three-items','vi','required-vi-orders-3');
        await window.webContents.executeJavaScript(`(()=>{PJ_I18N.setLanguage('ko');reset('home',{skipRelease:true});render();openCartModal()})()`,true);
        await waitForLayout(window);await captureExact(window,viewport,'required-cart-empty-modal');
        await captureNamedScenario('three-items','ko','required-cart-orders-3-modal',{modal:true});
        await captureNamedScenario('long-complex-order','es','required-cart-long-quantity-2-modal',{modal:true});
        for(const step of ['home','promo','pizza','side','review']){
          await window.webContents.executeJavaScript(fixtureScript('ko',scenarios.find(candidate=>candidate.name==='normal-whole')),true);
          await window.webContents.executeJavaScript(`state.step=${JSON.stringify(step)};render()`,true);await waitForLayout(window);
          await captureExact(window,viewport,`required-cart-button-${step}`);
        }
      }
      if(viewport.name==='1080x1920'){
        for (const [scenarioName, evidenceName] of [
          ['set-three-photo','set-three-after'],
          ['set-four','set-four-after'],
          ['set-four-long','set-four-long-after'],
          ['set-four-upup','set-four-upup-after'],
        ]) {
          const evidenceScenario=scenarios.find(scenario=>scenario.name===scenarioName);
          await window.webContents.executeJavaScript(fixtureScript('ko',evidenceScenario),true);
          await waitForLayout(window);
          await captureExact(window,viewport,evidenceName);
        }
        const clickScenario=scenarios.find(scenario=>scenario.name==='set-four');
        await window.webContents.executeJavaScript(fixtureScript('ko',clickScenario),true);
        await waitForLayout(window);
        await captureExact(window,viewport,'confirm-before-click');
        await window.webContents.executeJavaScript(`document.querySelector('.reviewDockConfirm').click()`,true);
        await waitForLayout(window);
        await captureExact(window,viewport,'confirm-after-click');
        const normalScenario=scenarios.find(scenario=>scenario.name==='normal-whole');
        await window.webContents.executeJavaScript(fixtureScript('ko',normalScenario),true);
        await waitForLayout(window);
        await captureExact(window,viewport,'normal-no-pager');
        const bulkScenario=scenarios.find(scenario=>scenario.name==='bulk-pagination');
        await window.webContents.executeJavaScript(fixtureScript('ko',bulkScenario),true);
        await waitForLayout(window);
        await captureExact(window,viewport,'pagination-first');
        await window.webContents.executeJavaScript(`{const list=document.querySelector('.reviewOrderList');list.scrollTop=(list.scrollHeight-list.clientHeight)/2;list.dispatchEvent(new Event('scroll'))}`,true);
        await waitForLayout(window);
        await captureExact(window,viewport,'pagination-middle');
        await window.webContents.executeJavaScript(`{const list=document.querySelector('.reviewOrderList');list.scrollTop=list.scrollHeight;list.dispatchEvent(new Event('scroll'))}`,true);
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

  const touchEvidence = await runTouchEvidence(window);
const report = {
    viewports,
    locales,
    scenarios: scenarios.map(({ name }) => name),
    touchEvidence,
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
