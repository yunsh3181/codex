const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertElectronSucceeded, spawnElectronVerificationSync } = require('./helpers/electron-verification-process');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
test('real browser layout fits every viewport, locale, and order scenario', { timeout: 120_000 }, t => {
  const reportPath = path.join(os.tmpdir(), `order-review-layout-${process.pid}.json`);
  const userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'order-review-profile-'));
  t.after(() => fs.rmSync(reportPath, { force: true }));
  t.after(() => fs.rmSync(userDataPath, { recursive: true, force: true }));
  const run = spawnElectronVerificationSync(['scripts/verify-order-review-layout.js'], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ORDER_REVIEW_REPORT: reportPath,
      ELECTRON_VERIFICATION_USER_DATA: userDataPath,
    },
    timeout: 110_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  assertElectronSucceeded(assert, run, reportPath);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  fs.unlinkSync(reportPath);
  assert.equal(report.results.length, 4 * 6 * 17);
  for (const result of report.results) {
    const context = `${result.viewportName}/${result.locale}/${result.scenario}`;
    const expected = report.viewports.find(viewport => viewport.name === result.viewportName);
    assert.deepEqual(
      { width: result.viewport.width, height: result.viewport.height },
      { width: expected.width, height: expected.height },
      `${context}: viewport`
    );
    if (process.platform === 'win32' && result.layout !== 'phone') continue;
    assert.equal(result.horizontalOverflow, 0, `${context}: ${JSON.stringify(result.scroll)}`);
    assert.equal(result.overlapCount, 0, `${context}: text overlap`);
    if (result.layout === 'phone') {
      assert.equal(result.compressionStage, 0, `${context}: phone review must not compress`);
      assert.ok(result.contentBottomGap >= 44, `${context}: ${result.contentBottomGap}px bottom gap`);
      if (['max-categories', 'long-complex-order'].includes(result.scenario)) {
        assert.equal(result.verticalScrollable, true, `${context}: long review must scroll`);
      }
    } else {
      assert.equal(result.fits, true, `${context}: ${JSON.stringify(result.scroll)}`);
      if (result.layout === 'kiosk21') {
        assert.equal(result.verticalScrollable, false, `${context}: document must not scroll`);
        assert.ok(result.orderRegion.scrollHeight <= result.orderRegion.clientHeight + 2, `${context}: order list overflow`);
        const indexes = result.pageItemIndexes.flat();
        assert.equal(indexes.length, result.orderItemCount, `${context}: paged item count`);
        assert.equal(new Set(indexes).size, result.orderItemCount, `${context}: duplicate paged item`);
        assert.deepEqual([...indexes].sort((a,b)=>a-b), Array.from({length:result.orderItemCount},(_,i)=>i), `${context}: missing paged item`);
        assert.ok(result.minimumFontSize >= 16, `${context}: ${result.minimumFontSize}px kiosk font`);
        if(result.pageCount===1){
          assert.equal(result.pagerReservedHeight,0,`${context}: pager reserved space`);
          assert.equal(result.paginationTrace,null,`${context}: unexpected pagination trace`);
        }else{
          const trace=result.paginationTrace;
          assert.ok(trace,`${context}: missing pagination trace`);
          assert.equal(trace.pages.length,result.pageCount,`${context}: traversed page count`);
          assert.deepEqual(trace.pages.map(page=>page.visibleIndexes),result.pageItemIndexes,`${context}: actual page indexes`);
          assert.equal(trace.pages[0].previousDisabled,true,`${context}: first previous enabled`);
          assert.equal(trace.pages.at(-1).nextDisabled,true,`${context}: last next enabled`);
          assert.deepEqual(trace.returnToFirst.visibleIndexes,trace.pages[0].visibleIndexes,`${context}: first page return`);
          assert.equal(trace.returnToFirst.previousDisabled,true,`${context}: returned previous enabled`);
          assert.equal(trace.returnToFirst.statusText,`1 / ${result.pageCount}`,`${context}: returned status`);
          const totals=new Set(trace.pages.map(page=>page.totalsText));
          assert.equal(totals.size,1,`${context}: totals changed between pages`);
          for(const [pageIndex,page] of trace.pages.entries()){
            assert.equal(page.statusText,`${pageIndex+1} / ${result.pageCount}`,`${context}: page status`);
            assert.equal(page.overflow,0,`${context}: page ${pageIndex+1} overflow`);
            assert.equal(page.clipping,0,`${context}: page ${pageIndex+1} clipping`);
            assert.ok(page.usedHeight<=page.availableHeight+2,`${context}: page ${pageIndex+1} height`);
            assert.ok(page.pagerReservedHeight>=80,`${context}: pager height`);
            if(pageIndex>0)assert.match(page.focusClass,/reviewPageStatus/,`${context}: page focus`);
            if(pageIndex<trace.pages.length-1)assert.equal(page.canFitNextCard,false,`${context}: page ${pageIndex+1} wastes fit space`);
          }
        }
        if (['six-items','bulk-pagination'].includes(result.scenario)) {
          assert.ok(result.pageCount >= 2, `${context}: expected pagination`);
          assert.ok(result.pageItemIndexes.some(page=>page.length>=2),`${context}: one-card pages only`);
          assert.ok(result.pageCount<result.cardCount,`${context}: page count equals card count`);
        }
        if(['normal-whole','two-items','three-items','four-items'].includes(result.scenario)){
          assert.equal(result.pageCount,1,`${context}: ordinary order paginated`);
          assert.equal(result.pagerReservedHeight,0,`${context}: ordinary pager space`);
        }
      }
    }
    if (['two-items','three-items','four-items','multi-pizza','max-categories','long-complex-order','five-items','six-items','bulk-pagination','max-cart-items'].includes(result.scenario)) {
      if (result.scenario === 'multi-pizza') {
        assert.equal(result.orderQuantity, 2, `${context}: order quantity`);
      }
    } else {
      assert.equal(result.compressionStage, 0, `${context}: base order must remain uncompressed`);
    }
    for (const metric of result.discountTextMetrics) {
      assert.ok(metric.fontSize >= 12, `${context}: ${metric.fontSize}px discount font`);
      assert.ok(
        metric.scrollWidth <= metric.clientWidth,
        `${context}: ${metric.text} ${metric.scrollWidth}px > ${metric.clientWidth}px wide`
      );
      assert.ok(
        metric.scrollHeight <= metric.clientHeight + 1,
        `${context}: ${metric.text} ${metric.scrollHeight}px > ${metric.clientHeight}px`
      );
    }
    assert.deepEqual(result.clipped, [], `${context}: clipped`);
    assert.deepEqual(result.hiddenRequired, [], `${context}: required UI hidden`);
    if (result.layout !== 'phone') {
      assert.ok(
        result.contentOverlapPx <= 1,
        `${context}: ${result.contentOverlapPx}px fixed cart overlap at ${JSON.stringify({
          lastContent: result.lastContent,
          orderRegion: result.orderRegion,
          stageSections: result.stageSections,
          reviewSections: result.reviewSections,
        })}`
      );
    }
    assert.ok(result.minFontSize >= (result.layout==='kiosk21'?16:12), `${context}: ${result.minFontSize}px font`);
    assert.ok(result.minTouchWidth >= 44, `${context}: ${result.minTouchWidth}px touch width`);
    assert.ok(result.minTouchHeight >= 44, `${context}: ${result.minTouchHeight}px touch height`);
    assert.equal(
      result.languageBounds.textInsideButton,
      true,
      `${context}: LANGUAGE text bounds ${JSON.stringify(result.languageBounds)}`
    );
    assert.equal(result.languageBounds.buttonInsideViewport, true, `${context}: LANGUAGE viewport bounds`);
    if (result.layout === 'phone') {
      assert.equal(result.reviewBrand.ordered, true, `${context}: brand order`);
      assert.equal(result.reviewBrand.contained, true, `${context}: brand containment`);
      assert.equal(result.reviewBrand.separateFromLanguage, true, `${context}: brand/language overlap`);
      assert.ok(result.reviewBrand.gapAboveLogo >= 0, `${context}: location/logo overlap`);
      assert.ok(result.reviewBrand.gapBelowLogo >= 0, `${context}: logo/tagline overlap`);
      assert.ok(result.reviewBrand.gapAboveLogo <= 2, `${context}: ${result.reviewBrand.gapAboveLogo}px upper gap`);
      assert.ok(result.reviewBrand.gapBelowLogo <= 2, `${context}: ${result.reviewBrand.gapBelowLogo}px lower gap`);
    } else {
      assert.equal(result.nonPhoneTaglineHidden, true, `${context}: non-phone header changed`);
    }
  }
  assert.ok(report.results.some(result =>
    result.layout === 'phone' && result.scenario === 'long-complex-order' && result.verticalScrollable
  ), 'measured mobile complex review uses natural page scrolling');
});

test('stored screenshots are raw viewport captures without forced resizing', () => {
  const source = fs.readFileSync(path.join(root, 'scripts', 'verify-order-review-layout.js'), 'utf8');
  assert.doesNotMatch(source, /\.resize\s*\(/);
  assert.match(source, /raw screenshot[\s\S]*does not match viewport/);
  for (const [width, height] of [[360, 640], [390, 844], [768, 1024], [1080, 1920]]) {
    for (const prefix of ['before', 'after']) {
      const png = fs.readFileSync(
        path.join(root, 'artifacts', `order-review-${prefix}-${width}x${height}.png`)
      );
      assert.equal(png.readUInt32BE(16), width, `${prefix} ${width} width`);
      assert.equal(png.readUInt32BE(20), height, `${prefix} ${height} height`);
    }
  }
});

test('repository measurement artifact is aggregate-only while failures retain detailed context', () => {
  const aggregate = JSON.parse(fs.readFileSync(
    path.join(root, 'artifacts', 'order-review-layout-measurements.json'),
    'utf8'
  ));
  assert.equal('results' in aggregate, false);
  assert.equal(aggregate.totalCombinations, 4 * 6 * 17);
  assert.deepEqual(aggregate.viewports, ['360x640', '390x844', '768x1024', '1080x1920']);
  assert.deepEqual(aggregate.locales, ['ko', 'en', 'ja', 'zh', 'vi', 'es']);
  assert.equal(aggregate.overlapCount, 0);
  assert.equal(aggregate.clippedTextCount, 0);
  assert.equal(aggregate.maxHorizontalOverflow, 0);
  assert.ok(aggregate.minimumBottomSafetyGap >= 44);
  for (const locale of aggregate.locales) {
    assert.ok(aggregate.scrollHeightByLocale[locale].min > 0, locale);
    assert.ok(
      aggregate.scrollHeightByLocale[locale].max >= aggregate.scrollHeightByLocale[locale].min,
      locale
    );
  }
  const source = fs.readFileSync(path.join(root, 'scripts', 'verify-order-review-layout.js'), 'utf8');
  assert.match(source, /ORDER_REVIEW_REPORT/);
  assert.match(source, /results,/);
  const testSource = fs.readFileSync(__filename, 'utf8');
  assert.match(testSource, /const context = `\$\{result\.viewportName\}\/\$\{result\.locale\}\/\$\{result\.scenario\}`/);
});
