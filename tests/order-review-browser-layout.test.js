const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertElectronSucceeded, spawnElectronVerificationSync } = require('./helpers/electron-verification-process');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
test('real browser layout keeps the page fixed and the order list independently scrollable', { timeout: 120_000 }, t => {
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
  assert.equal(report.results.length, 8 * 6 * 23);
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
    assert.equal(result.fits, true, `${context}: ${JSON.stringify(result.scroll)}`);
    assert.equal(result.verticalScrollable, false, `${context}: document must not scroll`);
    assert.equal(result.pageCount, 1, `${context}: pagination must stay removed`);
    assert.equal(result.visibleItemCount, result.orderItemCount, `${context}: hidden order card`);
    assert.deepEqual(result.pageItemIndexes, [Array.from({ length: result.orderItemCount }, (_, i) => i)], `${context}: order indexes`);
    assert.equal(result.paginationTrace, null, `${context}: legacy pager trace`);
    assert.ok(result.orderRegion.clientHeight > 0, `${context}: missing list viewport`);
    const overflows = result.orderRegion.scrollHeight > result.orderRegion.clientHeight + 1;
    assert.equal(result.scrollControls.hidden, !overflows, `${context}: scroll controls visibility`);
    assert.equal(result.scrollControls.upDisabled, true, `${context}: initial up control`);
    assert.equal(result.scrollControls.downDisabled, !overflows, `${context}: initial down control`);
    assert.equal(result.confirmButton.visible, true, `${context}: confirm hidden`);
    assert.equal(result.confirmButton.enabled, true, `${context}: confirm disabled`);
    assert.ok(result.confirmButton.rect.height >= 44, `${context}: confirm touch height`);
    assert.ok(result.confirmButton.bottomSafetyGap >= 8, `${context}: confirm safety gap`);
    assert.deepEqual(result.verticalSingleCharacterKorean, [], `${context}: vertical Korean`);
    assert.ok(result.cartBadgeCount > 0, `${context}: cart badge count`);
    if (result.scenario === 'multi-pizza') assert.equal(result.cartBadgeCount, 2, `${context}: pizza quantity badge`);
    if (result.scenario === 'max-categories') assert.equal(result.cartBadgeCount, 4, `${context}: parent plus separate extras badge`);
    if (result.cartModal) {
      assert.equal(result.cartModal.itemCount, result.orderItemCount, `${context}: modal order groups`);
      assert.equal(result.cartModal.empty, false, `${context}: unexpected empty modal`);
      assert.equal(result.cartModal.dialogCount, 1, `${context}: duplicate modal`);
      assert.equal(result.cartModal.horizontalOverflow, 0, `${context}: modal horizontal overflow`);
      assert.deepEqual(result.cartModal.clipped, [], `${context}: modal clipping`);
      assert.equal(result.cartModal.backgroundLocked, true, `${context}: modal background scroll`);
      assert.equal(result.cartModal.closed, true, `${context}: modal close`);
      assert.equal(result.cartModal.focusReturned, true, `${context}: cart focus return`);
      assert.ok(result.cartModal.modal.left >= 0 && result.cartModal.modal.right <= result.viewport.width, `${context}: modal viewport x`);
      assert.ok(result.cartModal.modal.top >= 0 && result.cartModal.modal.bottom <= result.viewport.height, `${context}: modal viewport y`);
    }
    if (result.layout === 'kiosk21') {
      assert.ok(result.typography.menuName >= 15, `${context}: ${result.typography.menuName}px menu name`);
      assert.ok(result.typography.quantityPrice >= 15, `${context}: ${result.typography.quantityPrice}px quantity/price`);
      assert.deepEqual(result.confirmClick, { before: 'review', after: 'phone', clickCount: 1 }, `${context}: confirm click`);
    }
    if (result.scenario === 'set-four' && result.layout === 'kiosk21') {
      const mutation = result.quantityMutation;
      assert.ok(mutation, `${context}: quantity mutation trace`);
      assert.equal(mutation.afterIncrement.quantities[0], mutation.before.quantities[0] + 1, `${context}: increment`);
      assert.ok(mutation.afterIncrement.total > mutation.before.total, `${context}: increment total`);
      assert.deepEqual(mutation.afterDecrement.quantities, mutation.before.quantities, `${context}: decrement quantity`);
      assert.equal(mutation.afterDecrement.total, mutation.before.total, `${context}: decrement total`);
    }
    if (['two-items','three-items','four-items','multi-pizza','max-categories','long-complex-order','five-items','six-items','bulk-pagination','max-cart-items','set-one','set-three-photo','set-four','set-four-long','set-four-upup','four-items-forced-overflow'].includes(result.scenario)) {
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
    assert.ok(result.contentOverlapPx <= 1, `${context}: ${result.contentOverlapPx}px footer overlap`);
    assert.ok(result.minFontSize >= 12, `${context}: ${result.minFontSize}px font`);
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
    result.scenario === 'max-cart-items' && result.orderRegion.scrollHeight > result.orderRegion.clientHeight
  ), 'large carts use the independent order-list scroll region');
  assert.ok(report.touchEvidence.afterSwipe > 0, 'trusted touch swipe scrolls the order list');
  assert.ok(report.touchEvidence.afterDown > report.touchEvidence.afterSwipe, 'down touch advances the order list');
  assert.equal(report.touchEvidence.bottom.downDisabled, true, 'down control disables at the bottom');
  assert.ok(report.touchEvidence.afterUp < report.touchEvidence.bottom.top, 'up touch moves away from the bottom');
  assert.equal(report.touchEvidence.modalOpened, true, 'cart modal opens by touch');
  assert.ok(report.touchEvidence.modalScrollMax > 0 && report.touchEvidence.modalAfter > 0, 'cart modal list scrolls by touch');
  assert.equal(report.touchEvidence.modalClosed, true, 'cart modal closes by touch');
  assert.equal(report.touchEvidence.focusReturned, true, 'touch close returns focus');
  assert.equal(report.touchEvidence.actionMisselects, 0, 'swipe does not activate edit or delete');
  assert.equal(report.touchEvidence.trusted, true, 'touch and pointer events are trusted');
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
  assert.equal(aggregate.totalCombinations, 8 * 6 * 23);
  assert.deepEqual(aggregate.viewports, ['360x640', '390x844', '834x940', '834x1112', '810x1080', '768x1024', '1080x1920', '1920x1080']);
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
