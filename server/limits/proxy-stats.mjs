import { monitorEventLoopDelay } from 'node:perf_hooks';

const SAMPLE_MS = 20;
const megabytes = bytes => Math.round(bytes / 1048576);
const lagMs = (histogram, percentile) => Math.max(0, Math.round(histogram.percentile(percentile) / 1e6) - SAMPLE_MS);

export function statsLine(sample) {
  return (
    '[atlas-stats] ' +
    `sockets=${sample.openSockets} clients=${sample.clients} streams=${sample.openStreams} ` +
    `streams_refused=+${sample.streamsRefused} requests_refused=+${sample.requestsRefused} sockets_refused=+${sample.socketsRefused} ` +
    `loop_p50_ms=${sample.loopP50} loop_p99_ms=${sample.loopP99} rss_mb=${sample.rssMb} heap_mb=${sample.heapMb}`
  );
}

export function startStatsLog({
  limiter,
  wispStats,
  intervalSeconds,
  log = console.log,
  memory = process.memoryUsage,
}) {
  if (!(intervalSeconds > 0)) return () => {};
  const histogram = monitorEventLoopDelay({ resolution: SAMPLE_MS });
  histogram.enable();
  let last = { streams: 0, requests: 0, sockets: 0 };
  const timer = setInterval(() => {
    const current = limiter.stats();
    const refused = {
      streams: wispStats.throttled_streams,
      requests: current.requestsRefused,
      sockets: current.socketsRefused,
    };
    const delta = {
      streams: refused.streams - last.streams,
      requests: refused.requests - last.requests,
      sockets: refused.sockets - last.sockets,
    };
    last = refused;
    const active =
      current.openSockets > 0 || wispStats.open_streams > 0 || delta.streams + delta.requests + delta.sockets > 0;
    if (active) {
      const usage = memory();
      log(
        statsLine({
          openSockets: current.openSockets,
          clients: current.clients,
          openStreams: wispStats.open_streams,
          streamsRefused: delta.streams,
          requestsRefused: delta.requests,
          socketsRefused: delta.sockets,
          loopP50: lagMs(histogram, 50),
          loopP99: lagMs(histogram, 99),
          rssMb: megabytes(usage.rss),
          heapMb: megabytes(usage.heapUsed),
        })
      );
    }
    histogram.reset();
  }, intervalSeconds * 1000);
  timer.unref();
  return () => {
    clearInterval(timer);
    histogram.disable();
  };
}
