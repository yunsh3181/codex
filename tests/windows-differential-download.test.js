'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { HttpExecutor, CancellationToken } = require('builder-util-runtime');
const { GenericDifferentialDownloader } = require('electron-updater/out/differentialDownloader/GenericDifferentialDownloader');
const { NsisUpdater } = require('electron-updater/out/NsisUpdater');

class NodeRangeExecutor extends HttpExecutor {
  createRequest(options, callback) { return http.request(options, callback); }
  addRedirectHandlers() {}
}

const digest = value => crypto.createHash('sha512').update(value).digest('base64');
const blockDigest = value => crypto.createHash('sha256').update(value).digest('base64');

function blockmap(blocks) {
  return { version: '2', files: [{ name: 'file', offset: 0, sizes: blocks.map(block => block.length), checksums: blocks.map(blockDigest) }] };
}

test('electron-updater range downloads only changed blocks and validates the rebuilt installer', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-differential-update-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const chunk = character => Buffer.alloc(64 * 1024, character);
  const oldBlocks = [chunk('A'), chunk('B'), chunk('C'), chunk('D')];
  const newBlocks = [oldBlocks[0], chunk('X'), oldBlocks[2], oldBlocks[3]];
  const oldFile = path.join(directory, 'old.exe');
  const newFile = path.join(directory, 'new.exe');
  const target = Buffer.concat(newBlocks);
  fs.writeFileSync(oldFile, Buffer.concat(oldBlocks));
  let transferred = 0;
  const server = http.createServer((request, response) => {
    const match = String(request.headers.range || '').match(/^bytes=(\d+)-(\d+)$/);
    if (!match) { response.writeHead(200, { 'content-length': target.length }); response.end(target); return; }
    const start = Number(match[1]);
    const end = Number(match[2]);
    const body = target.subarray(start, end + 1);
    transferred += body.length;
    response.writeHead(206, { 'content-range': `bytes ${start}-${end}/${target.length}`, 'accept-ranges': 'bytes', 'content-length': body.length });
    response.end(body);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const logs = [];
  const downloader = new GenericDifferentialDownloader(
    { size: target.length, sha512: digest(target) },
    new NodeRangeExecutor(),
    { oldFile, newFile, newUrl: new URL(`http://127.0.0.1:${server.address().port}/new.exe`), logger: { info: value => logs.push(String(value)), warn() {}, error() {}, debug() {} }, requestHeaders: null, isUseMultipleRangeRequest: false, cancellationToken: new CancellationToken() }
  );
  await downloader.download(blockmap(oldBlocks), blockmap(newBlocks));
  assert.deepEqual(fs.readFileSync(newFile), target);
  assert.equal(transferred, 64 * 1024);
  assert.ok(transferred < target.length);
  assert.match(logs.join('\n'), /Full: 256 KB, To download: 64 KB \(25%\)/);
  assert.match(logs.join('\n'), /Differential download:/);
});

test('checksum mismatch rejects a partially rebuilt installer', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-differential-corrupt-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const old = Buffer.alloc(1024, 'A');
  const target = Buffer.alloc(1024, 'B');
  const oldFile = path.join(directory, 'old.exe');
  const newFile = path.join(directory, 'new.exe');
  fs.writeFileSync(oldFile, old);
  const server = http.createServer((_request, response) => { response.writeHead(206); response.end(Buffer.alloc(1024, 'X')); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const downloader = new GenericDifferentialDownloader(
    { size: target.length, sha512: digest(target) }, new NodeRangeExecutor(),
    { oldFile, newFile, newUrl: new URL(`http://127.0.0.1:${server.address().port}/new.exe`), logger: { info() {}, warn() {}, error() {}, debug() {} }, requestHeaders: null, isUseMultipleRangeRequest: false, cancellationToken: new CancellationToken() }
  );
  await assert.rejects(downloader.download(blockmap([old]), blockmap([target])), /sha512|checksum/i);
});

test('a missing previous blockmap selects and completes the SHA-512 checked full fallback', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pj-full-fallback-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const target = Buffer.alloc(96 * 1024, 'F');
  const destination = path.join(directory, 'fallback.exe');
  let transferred = 0;
  const server = http.createServer((_request, response) => {
    transferred += target.length;
    response.writeHead(200, { 'content-length': target.length });
    response.end(target);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const errors = [];
  const fallback = await NsisUpdater.prototype.differentialDownloadInstaller.call({
    _testOnlyOptions: null,
    app: { version: '1.0.0' },
    _logger: { info() {}, warn() {}, error: value => errors.push(String(value)) }
  }, { url: new URL(`http://127.0.0.1:${server.address().port}/new.exe`), info: { size: target.length, sha512: digest(target) } }, {
    updateInfoAndProvider: { info: { version: '2.0.0' }, provider: { getBlockMapFiles: async () => { throw Object.assign(new Error('old blockmap 404'), { code: 'ENOENT' }); } } },
    cancellationToken: new CancellationToken(),
    requestHeaders: null
  }, destination, {}, 'current-installer.exe');
  assert.equal(fallback, true);
  assert.match(errors.join('\n'), /fallback to full download[\s\S]*old blockmap 404/i);
  const fullDownload = await new NodeRangeExecutor().downloadToBuffer(new URL(`http://127.0.0.1:${server.address().port}/new.exe`), { cancellationToken: new CancellationToken() });
  assert.equal(digest(fullDownload), digest(target));
  fs.writeFileSync(destination, fullDownload);
  assert.deepEqual(fs.readFileSync(destination), target);
  assert.equal(transferred, target.length);
});
