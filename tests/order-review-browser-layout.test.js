const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');

const root = path.resolve(__dirname, '..');
const retryDelay = new Int32Array(new SharedArrayBuffer(4));

const spawnElectron = (command, args, options) => {
  let run;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    run = spawnSync(command, args, options);
    if (run.error?.code !== 'EBUSY') return run;
    Atomics.wait(retryDelay, 0, 0, 500);
  }
  return run;
};

test('real browser layout fits every viewport, locale, and order scenario', { timeout: 120_000 }, t => {
  const electron = require('electron');
  assert.ok(fs.existsSync(electron), `Electron executable not found: ${electron}`);
  let command = electron;
  let args = ['scripts/verify-order-review-layout.js'];
  const reportPath = path.join(os.tmpdir(), `order-review-layout-${process.pid}.json`);
  if (process.platform === 'darwin') {
    const binary = spawnSync('file', [electron], { encoding: 'utf8' }).stdout;
    const architecture = binary.includes('arm64') ? '-arm64' :
      binary.includes('x86_64') ? '-x86_64' : null;
    if (architecture) {
      const supported = spawnSync('/usr/bin/arch', [architecture, '/usr/bin/true']);
      if (supported.status !== 0) {
        t.skip(`Electron ${architecture.slice(1)} is not supported by this host`);
        return;
      }
      command = '/usr/bin/arch';
      args = [architecture, electron, ...args];
    }
  }
  const run = spawnElectron(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
      ORDER_REVIEW_REPORT: reportPath,
    },
    timeout: 110_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  assert.equal(run.status, 0, `${run.error || ''}\n${run.stdout || ''}\n${run.stderr || ''}`);
  assert.ok(fs.existsSync(reportPath), run.stdout);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  fs.unlinkSync(reportPath);
  assert.equal(report.results.length, 4 * 6 * 9);
  for (const result of report.results) {
    const context = `${result.viewportName}/${result.locale}/${result.scenario}`;
    const expected = report.viewports.find(viewport => viewport.name === result.viewportName);
    assert.deepEqual(
      { width: result.viewport.width, height: result.viewport.height },
      { width: expected.width, height: expected.height },
      `${context}: viewport`
    );
    if (process.platform === 'win32' && result.layout !== 'phone') continue;
    assert.equal(result.fits, true, `${context}: ${JSON.stringify(result.scroll)}`);
    if (['multi-pizza', 'max-categories'].includes(result.scenario)) {
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
        metric.scrollHeight <= metric.clientHeight,
        `${context}: ${metric.text} ${metric.scrollHeight}px > ${metric.clientHeight}px`
      );
    }
    assert.deepEqual(result.clipped, [], `${context}: clipped`);
    assert.deepEqual(result.hiddenRequired, [], `${context}: required UI hidden`);
    assert.ok(
      result.contentOverlapPx <= 1,
      `${context}: ${result.contentOverlapPx}px fixed cart overlap at ${JSON.stringify({
        lastContent: result.lastContent,
        orderRegion: result.orderRegion,
        reviewSections: result.reviewSections,
      })}`
    );
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
  assert.ok(
    report.results.some(result =>
      result.layout === 'phone' &&
      result.scenario === 'max-categories' &&
      result.compressionStage >= 1
    ),
    'measured mobile multi-pizza review activates compression'
  );
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
