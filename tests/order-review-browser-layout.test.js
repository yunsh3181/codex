const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');

const root = path.resolve(__dirname, '..');

test('real browser layout fits every viewport, locale, and order scenario', { timeout: 120_000 }, t => {
  const electron = require('electron');
  assert.ok(fs.existsSync(electron), `Electron executable not found: ${electron}`);
  let command = electron;
  let args = ['scripts/verify-order-review-layout.js'];
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
  const run = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' },
    timeout: 110_000,
  });
  assert.equal(run.status, 0, `${run.stdout}\n${run.stderr}`);
  const marker = run.stdout.split('\n').find(line => line.startsWith('ORDER_REVIEW_LAYOUT_RESULT='));
  assert.ok(marker, run.stdout);
  const report = JSON.parse(marker.slice('ORDER_REVIEW_LAYOUT_RESULT='.length));
  assert.equal(report.results.length, 4 * ((6 * 7) + 1));
  for (const result of report.results) {
    const context = `${result.viewportName}/${result.locale}/${result.scenario}`;
    const expected = report.viewports.find(viewport => viewport.name === result.viewportName);
    assert.deepEqual(
      { width: result.viewport.width, height: result.viewport.height },
      { width: expected.width, height: expected.height },
      `${context}: viewport`
    );
    assert.equal(result.fits, true, `${context}: ${JSON.stringify(result.scroll)}`);
    assert.deepEqual(result.clipped, [], `${context}: clipped`);
    assert.deepEqual(result.hiddenRequired, [], `${context}: required UI hidden`);
    assert.ok(
      result.contentOverlapPx <= 1,
      `${context}: ${result.contentOverlapPx}px fixed cart overlap at ${JSON.stringify(result.lastContent)}`
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
