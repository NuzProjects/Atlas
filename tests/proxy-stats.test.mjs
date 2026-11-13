import test from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, limitSettings } from '../server/proxy-ratelimit.mjs';
import { startStatsLog, statsLine } from '../server/proxy-stats.mjs';

const memory = () => ({ rss: 150 * 1048576, heapUsed: 60 * 1048576 });

test('limiter counts refused requests and sockets', () => {
  const limiter = createLimiter({ ...limitSettings({}), requestsPerMinute: 1, socketsPerClient: 1 }, { now: () => 0 });
  limiter.allowRequest('a');
  limiter.allowRequest('a');
  limiter.allowRequest('a');
  limiter.openSocket('a');
  limiter.openSocket('a');
  const { requestsRefused, socketsRefused } = limiter.stats();
  assert.equal(requestsRefused, 2);
  assert.equal(socketsRefused, 1);
});

test('stats lines carry only aggregate numbers', () => {
  const line = statsLine({
    openSockets: 3,
    clients: 2,
    openStreams: 41,
    streamsRefused: 5,
    requestsRefused: 0,
    socketsRefused: 1,
    loopP50: 1,
    loopP99: 12,
    rssMb: 150,
    heapMb: 60,
  });
  assert.equal(
    line,
    '[atlas-stats] sockets=3 clients=2 streams=41 streams_refused=+5 requests_refused=+0 sockets_refused=+1 loop_p50_ms=1 loop_p99_ms=12 rss_mb=150 heap_mb=60'
  );
});

test('the logger stays silent while idle and reports refusal deltas when active', async () => {
  const limiter = createLimiter();
  const wispStats = { open_streams: 0, throttled_streams: 0 };
  const lines = [];
  const stop = startStatsLog({ limiter, wispStats, intervalSeconds: 0.05, log: line => lines.push(line), memory });
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.deepEqual(lines, []);
  wispStats.open_streams = 7;
  wispStats.throttled_streams = 3;
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.ok(lines.length >= 1);
  assert.match(lines[0], /streams=7 streams_refused=\+3 /);
  const second = lines.find((line, index) => index > 0);
  if (second) assert.match(second, /streams_refused=\+0 /);
  stop();
});

test('a zero interval disables the logger', () => {
  const stop = startStatsLog({ limiter: createLimiter(), wispStats: {}, intervalSeconds: 0 });
  assert.equal(typeof stop, 'function');
  stop();
});
