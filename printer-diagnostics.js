'use strict';

const STORAGE_KEY = 'pjReceiptPrinterSettings';
const bridge = window.kioskPrinter;
const printerSelect = document.getElementById('printerSelect');
const useDefaultPrinter = document.getElementById('useDefaultPrinter');
const testPrintButton = document.getElementById('testPrint');
const resultPanel = document.querySelector('.result');
let printers = [];

function savedSettings() {
  try {
    return { printerName: '', useDefault: true, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') };
  } catch {
    return { printerName: '', useDefault: true };
  }
}

function errorMessage(error) {
  return error?.message || String(error || '알 수 없는 오류');
}

function selectedPrinter() {
  return printers.find(printer => printer.name === printerSelect.value) || null;
}

function renderDetails() {
  const printer = selectedPrinter();
  document.getElementById('selectedName').textContent = printer?.displayName || '-';
  document.getElementById('printerStatus').textContent = printer
    ? `${printer.available ? '사용 가능' : '사용 불가'} · ${printer.offline ? '오프라인' : printer.status}`
    : '-';
  document.getElementById('printerConnection').textContent = printer?.connection || '-';
  document.getElementById('printerPort').textContent = printer?.port || '정보 없음';
  document.getElementById('printerDriver').textContent = printer?.driverName || '정보 없음';
  testPrintButton.disabled = !bridge || !printer?.available;
}

function showResult(kind, message, date = new Date()) {
  resultPanel.className = `result ${kind || ''}`.trim();
  document.getElementById('lastResult').textContent = message;
  document.getElementById('lastResultTime').textContent = date.toLocaleString('ko-KR');
}

async function refreshPrinters() {
  if (!bridge) {
    const notice = document.getElementById('bridgeNotice');
    notice.hidden = false;
    notice.textContent = '일반 브라우저는 Windows 프린터 목록에 접근할 수 없습니다. Windows Electron 키오스크에서 이 화면을 여세요.';
    printerSelect.innerHTML = '<option>데스크톱 Bridge를 사용할 수 없음</option>';
    showResult('error', '프린터 Bridge가 없어 목록을 조회할 수 없습니다.');
    return;
  }
  printerSelect.disabled = true;
  printerSelect.innerHTML = '<option>목록을 불러오는 중...</option>';
  try {
    printers = await bridge.list();
    const settings = savedSettings();
    useDefaultPrinter.checked = settings.useDefault;
    const defaultPrinter = printers.find(printer => printer.isDefault);
    const selectedName = settings.useDefault
      ? defaultPrinter?.name
      : printers.some(printer => printer.name === settings.printerName) ? settings.printerName : defaultPrinter?.name;
    printerSelect.replaceChildren();
    if (printers.length) {
      for (const printer of printers) {
        const option = document.createElement('option');
        option.value = printer.name;
        option.textContent = `${printer.displayName}${printer.isDefault ? ' (기본)' : ''}${printer.offline ? ' · 오프라인' : ''}`;
        printerSelect.append(option);
      }
    } else {
      printerSelect.append(new Option('설치된 프린터가 없습니다'));
    }
    printerSelect.disabled = !printers.length;
    if (selectedName) printerSelect.value = selectedName;
    renderDetails();
  } catch (error) {
    printers = [];
    printerSelect.innerHTML = '<option>프린터 조회 실패</option>';
    showResult('error', `목록 조회 실패: ${errorMessage(error)}`);
    console.error('[printer diagnostics] list failed', error);
  }
}

printerSelect.addEventListener('change', () => {
  if (useDefaultPrinter.checked && !selectedPrinter()?.isDefault) useDefaultPrinter.checked = false;
  renderDetails();
});
useDefaultPrinter.addEventListener('change', () => {
  if (useDefaultPrinter.checked) {
    const defaultPrinter = printers.find(printer => printer.isDefault);
    if (defaultPrinter) printerSelect.value = defaultPrinter.name;
  }
  renderDetails();
});
document.getElementById('refreshPrinters').addEventListener('click', refreshPrinters);
document.getElementById('savePrinter').addEventListener('click', () => {
  const printer = selectedPrinter();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    printerName: printer?.name || '',
    useDefault: useDefaultPrinter.checked
  }));
  showResult('success', printer ? `선택 저장 완료: ${printer.displayName}` : '저장할 프린터가 없습니다.');
});
testPrintButton.addEventListener('click', async () => {
  const printer = selectedPrinter();
  if (!printer) return;
  testPrintButton.disabled = true;
  testPrintButton.textContent = '출력 요청 중...';
  try {
    const result = await bridge.testPrint(printer.name);
    showResult('success', `테스트 출력 성공: ${result.printerName}`, new Date(result.printedAt));
  } catch (error) {
    showResult('error', `테스트 출력 실패: ${errorMessage(error)}`);
    console.error('[printer diagnostics] print failed', error);
  } finally {
    testPrintButton.textContent = '테스트 영수증 출력';
    renderDetails();
  }
});

refreshPrinters();
