'use strict';

const WINDOWS_PRINTER_STATUS = [
  [0x00000001, 'paused'],
  [0x00000002, 'error'],
  [0x00000008, 'paper-jam'],
  [0x00000010, 'paper-out'],
  [0x00000080, 'offline'],
  [0x00000200, 'busy'],
  [0x00000400, 'printing'],
  [0x00001000, 'not-available'],
  [0x00100000, 'user-intervention'],
  [0x00400000, 'door-open']
];

function optionValue(options, names) {
  for (const name of names) {
    const value = options?.[name];
    if (value !== undefined && value !== null && String(value).trim()) return String(value);
  }
  return '';
}

function normalizeStatus(value, options = {}) {
  const numeric = Number(value);
  const state = optionValue(options, ['printer-state', 'printerState']);
  const reasons = optionValue(options, ['printer-state-reasons', 'printerStateReasons']);
  const flags = Number.isFinite(numeric)
    ? WINDOWS_PRINTER_STATUS.filter(([mask]) => (numeric & mask) === mask).map(([, label]) => label)
    : [];
  const status = flags.join(', ') || state || (numeric ? `status-${numeric}` : 'ready');
  const searchable = `${status} ${reasons}`.toLowerCase();
  const offline = /offline|not-available|unreachable|disconnected/.test(searchable);
  const unavailable = offline || /error|paper-(out|jam)|door-open|user-intervention|no-toner/.test(searchable);
  return { status, reasons, offline, available: !unavailable };
}

function connectionFromPort(port, uri) {
  const source = `${port} ${uri}`.toLowerCase();
  if (/usb|^dot4/.test(source)) return 'USB';
  if (/^com\d|serial/.test(source)) return 'Serial';
  if (/^lpt\d|parallel/.test(source)) return 'Parallel';
  if (/^ip_|tcp|https?:|ipp:|socket:|wia/.test(source)) return 'Network';
  if (/^nul|file:|pdf|xps|onenote/.test(source)) return 'Virtual';
  return port || uri ? 'Other' : 'Unknown';
}

function normalizePrinter(printer) {
  const options = printer?.options || {};
  const port = optionValue(options, ['port-name', 'portName', 'printer-port', 'device-uri']);
  const uri = optionValue(options, ['device-uri', 'printer-uri-supported']);
  const driverName = optionValue(options, ['driver-name', 'printer-make-and-model']) ||
    printer?.description || '';
  const state = normalizeStatus(printer?.status, options);
  return {
    name: String(printer?.name || ''),
    displayName: String(printer?.displayName || printer?.name || ''),
    isDefault: Boolean(printer?.isDefault),
    status: state.status,
    statusReasons: state.reasons,
    offline: state.offline,
    available: state.available,
    connection: connectionFromPort(port, uri),
    port,
    driverName
  };
}

function testReceiptHtml(printerName, printedAt = new Date()) {
  const escapedName = String(printerName).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
  const escapedTime = printedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><style>
@page{size:80mm auto;margin:3mm}*{box-sizing:border-box}body{width:74mm;margin:0;color:#000;font:12px/1.45 Arial,"Malgun Gothic",sans-serif}
h1{margin:0;text-align:center;font-size:20px}.center{text-align:center}.rule{border-top:1px dashed #000;margin:8px 0}
.row{display:flex;justify-content:space-between;gap:8px}.large{font-size:16px;font-weight:700}.cut{margin-top:16px;text-align:center}
</style></head><body>
<h1>PAPA JOHNS</h1><div class="center">80mm 프린터 테스트</div><div class="rule"></div>
<div class="row"><span>프린터</span><strong>${escapedName}</strong></div>
<div class="row"><span>출력 시각</span><span>${escapedTime}</span></div>
<div class="rule"></div><div class="large center">TEST PRINT OK</div>
<p class="center">한글/English/1234567890<br>용지 폭과 잘림 상태를 확인하세요.</p>
<div class="rule"></div><div class="cut">- - - 절취선 - - -</div>
</body></html>`;
}

module.exports = { normalizePrinter, normalizeStatus, connectionFromPort, testReceiptHtml };
