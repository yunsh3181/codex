(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.PJ_BUSINESS_HOURS = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const BUSINESS_HOURS = Object.freeze({
    timeZone: 'Asia/Seoul',
    open: '11:00',
    close: '21:30',
    checkIntervalMs: 15000
  });
  const UI_COPY = Object.freeze({
    store: '판교2테크노밸리점',
    beforeOpenTitle: '영업 준비 중입니다',
    afterCloseTitle: '오늘 영업이 종료되었습니다',
    hoursLabel: '주문 가능 시간',
    hours: '오전 11:00 ~ 오후 9:30',
    beforeOpenMessage: '잠시 후 이용해 주세요',
    afterCloseMessage: '내일 다시 이용해 주세요',
    closedError: '오늘 영업이 종료되었습니다. 주문 가능 시간은 오전 11시부터 오후 9시 30분까지입니다.',
    currentTime: '현재 한국시간'
  });

  function timeParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BUSINESS_HOURS.timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
  }

  function secondsSinceMidnight(date = new Date()) {
    const parts = timeParts(date);
    return parts.hour * 3600 + parts.minute * 60 + parts.second;
  }

  function parseTime(value) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 3600 + minute * 60;
  }

  function getStatus(date = new Date()) {
    const seconds = secondsSinceMidnight(date);
    if (seconds < parseTime(BUSINESS_HOURS.open)) return 'before-open';
    if (seconds >= parseTime(BUSINESS_HOURS.close)) return 'after-close';
    return 'open';
  }

  function isOpen(date = new Date()) {
    return getStatus(date) === 'open';
  }

  function millisecondsUntilNextBoundary(date = new Date()) {
    const parts = timeParts(date);
    const nowSeconds = parts.hour * 3600 + parts.minute * 60 + parts.second;
    const milliseconds = date.getMilliseconds();
    const open = parseTime(BUSINESS_HOURS.open);
    const close = parseTime(BUSINESS_HOURS.close);
    const target = nowSeconds < open ? open : nowSeconds < close ? close : open + 86400;
    return Math.max(1, (target - nowSeconds) * 1000 - milliseconds);
  }

  function formatKoreanTime(date = new Date()) {
    return new Intl.DateTimeFormat('ko-KR', {
      timeZone: BUSINESS_HOURS.timeZone,
      month: 'long',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23'
    }).format(date);
  }

  function createMonitor({ now = () => new Date(), onStatusChange, onClockTick = () => {} }) {
    let status = null;
    let intervalId = null;
    let boundaryTimeoutId = null;
    let clockIntervalId = null;

    function scheduleBoundary() {
      clearTimeout(boundaryTimeoutId);
      boundaryTimeoutId = setTimeout(check, millisecondsUntilNextBoundary(now()) + 25);
    }

    function check() {
      const date = now();
      const nextStatus = getStatus(date);
      if (nextStatus !== status) {
        const previousStatus = status;
        status = nextStatus;
        onStatusChange(nextStatus, previousStatus, date);
      }
      onClockTick(date);
      scheduleBoundary();
      return nextStatus;
    }

    function start() {
      if (intervalId !== null) return;
      check();
      intervalId = setInterval(check, BUSINESS_HOURS.checkIntervalMs);
      clockIntervalId = setInterval(() => onClockTick(now()), 1000);
    }

    function stop() {
      clearInterval(intervalId);
      clearInterval(clockIntervalId);
      clearTimeout(boundaryTimeoutId);
      intervalId = clockIntervalId = boundaryTimeoutId = null;
    }

    return { start, stop, check, currentStatus: () => status };
  }

  return {
    BUSINESS_HOURS,
    UI_COPY,
    timeParts,
    secondsSinceMidnight,
    getStatus,
    isOpen,
    millisecondsUntilNextBoundary,
    formatKoreanTime,
    createMonitor
  };
});
