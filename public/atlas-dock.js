const atlasDockRoot = document.getElementById('homeBottomDock');
function atlasDockClockOffset(serverTime, sentAt, roundTrip) {
  return serverTime - (sentAt + roundTrip / 2);
}
const atlasDockClock = document.getElementById('atlasDockClock');
const atlasDockDelay = document.getElementById('atlasDockDelay');
const atlasDockTimeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
let atlasDockOffset = 0,
  atlasDockBestDelay = Infinity,
  atlasDockOffsetExpires = 0;
let atlasDockClockTimer,
  atlasDockMeasuring = false,
  atlasDockSynced = false;
function tickAtlasDockClock() {
  clearTimeout(atlasDockClockTimer);
  const now = Date.now() + atlasDockOffset;
  atlasDockClock.textContent = atlasDockTimeFormat.format(new Date(now));
  atlasDockClock.dateTime = new Date(now).toISOString();
  atlasDockClock.dataset.synced = String(atlasDockSynced);
  if (!document.hidden) atlasDockClockTimer = setTimeout(tickAtlasDockClock, 1000 - (((now % 1000) + 1000) % 1000) + 5);
}
async function measureAtlasDockDelay() {
  if (atlasDockMeasuring || document.hidden || atlasDockRoot.style.display === 'none') return;
  atlasDockMeasuring = true;
  try {
    const samples = atlasDockSynced ? 1 : 3;
    for (let sample = 0; sample < samples; sample++) {
      const sentAt = Date.now(),
        started = performance.now();
      const response = await fetch('/api/clock?_=' + sentAt, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      if (!response.ok) throw new Error('Atlas server unavailable');
      const data = await response.json(),
        roundTrip = performance.now() - started;
      if (!Number.isFinite(data.time) || roundTrip < 0) throw new Error('Invalid server time');
      if (Date.now() > atlasDockOffsetExpires) {
        atlasDockBestDelay = Infinity;
        atlasDockOffsetExpires = Date.now() + 60000;
      }
      if (roundTrip < atlasDockBestDelay) {
        atlasDockBestDelay = roundTrip;
        atlasDockOffset = atlasDockClockOffset(data.time, sentAt, roundTrip);
      }
      atlasDockSynced = true;
      atlasDockDelay.textContent = Math.round(roundTrip) + ' ms';
      atlasDockDelay.setAttribute(
        'aria-label',
        'Atlas server round-trip delay: ' + Math.round(roundTrip) + ' milliseconds'
      );
      delete atlasDockDelay.dataset.offline;
      tickAtlasDockClock();
    }
  } catch (_) {
    atlasDockDelay.textContent = 'Offline';
    atlasDockDelay.dataset.offline = 'true';
    atlasDockDelay.setAttribute('aria-label', 'Atlas server unavailable');
  } finally {
    atlasDockMeasuring = false;
  }
}
tickAtlasDockClock();
measureAtlasDockDelay();
const atlasDockPoll = setInterval(measureAtlasDockDelay, 10000);
document.addEventListener('visibilitychange', () => {
  tickAtlasDockClock();
  if (!document.hidden) measureAtlasDockDelay();
});
window.addEventListener('focus', () => {
  tickAtlasDockClock();
  measureAtlasDockDelay();
});
new MutationObserver(measureAtlasDockDelay).observe(atlasDockRoot, { attributes: true, attributeFilter: ['style'] });
window.addEventListener(
  'pagehide',
  () => {
    clearTimeout(atlasDockClockTimer);
    clearInterval(atlasDockPoll);
  },
  { once: true }
);
