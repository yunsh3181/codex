'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Install before loadFile, never after the real Firebase SDK has initialized.
// Reuse the existing in-memory runtime without its admin-only global db export:
// the customer page declares its own lexical `let db`.
function installCustomerBrowserBootstrap({ session, root, profile, online = false }) {
  const runtime = fs.readFileSync(path.join(root, 'tests/fixtures/admin-browser-runtime.js'), 'utf8')
    .replace(/\s*Object\.defineProperty\(window,'db',[^\n]+\);?/, '');
  const runtimePath = path.join(profile, 'customer-fixture-firebase.js');
  const emptyPath = path.join(profile, 'customer-fixture-empty.js');
  const networkPath = path.join(profile, 'customer-fixture-network.js');
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(runtimePath, `window.__PJ_FIRESTORE_FIXTURE__={mode:'synthetic',realSdk:false};\n${runtime}`);
  fs.writeFileSync(emptyPath, 'void 0;');
  // Exercise the production event handler; do not mutate the frozen API or the
  // browser navigator. This runs before the following Firebase/app bootstrap.
  fs.writeFileSync(networkPath, fs.readFileSync(path.join(root, 'network-status.js'), 'utf8') +
    (online ? '\nwindow.dispatchEvent(new Event("online"));\n' : ''));
  const externalRequests = [];
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    const sdk = details.url.match(/\/(?:assets\/vendor\/firebase\/|firebasejs\/[^/]+\/)firebase-(app|firestore|auth)-compat\.js(?:\?|$)/);
    if (sdk) return callback({ redirectURL: pathToFileURL(sdk[1] === 'app' ? runtimePath : emptyPath).href });
    if (/\/network-status\.js(?:\?|$)/.test(details.url)) return callback({ redirectURL: pathToFileURL(networkPath).href });
    if (/^(?:https?|wss?):/i.test(details.url)) {
      const url = new URL(details.url);
      externalRequests.push(`${url.origin}${url.pathname}`);
      return callback({ cancel: true });
    }
    callback({});
  });
  return {
    document(relative) {
      // Remote SDK URLs cannot safely redirect to file: in Chromium. Replace
      // only those script references in the test document before navigation.
      const base = pathToFileURL(path.join(root, path.dirname(relative)) + path.sep).href;
      const html = fs.readFileSync(path.join(root, relative), 'utf8')
        .replace('<head>', `<head><base href="${base}">`)
        .replace(/https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-(app|firestore|auth)-compat\.js/g,
          (_match, sdk) => pathToFileURL(sdk === 'app' ? runtimePath : emptyPath).href);
      const target = path.join(profile, 'customer-fixture-' + relative.replaceAll('/', '-'));
      fs.writeFileSync(target, html);
      return target;
    },
    async verify(window, { checkOnline = online } = {}) {
      const bootstrap = await window.webContents.executeJavaScript(`({synthetic:window.__PJ_FIRESTORE_FIXTURE__?.mode==='synthetic',online:window.PJ_NETWORK?.isOnline(),frozen:window.PJ_NETWORK?Object.isFrozen(window.PJ_NETWORK):null})`, true);
      if (!bootstrap.synthetic || (checkOnline && (!bootstrap.online || !bootstrap.frozen)) || externalRequests.length) {
        throw new Error(`customer fixture isolation failed: ${JSON.stringify({ bootstrap, externalRequests })}`);
      }
      return { ...bootstrap, externalRequests: externalRequests.length };
    },
    dispose() { session.webRequest.onBeforeRequest(null); }
  };
}

module.exports = { installCustomerBrowserBootstrap };
