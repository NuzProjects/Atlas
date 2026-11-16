function positive(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function wispLimits(env = process.env) {
  return {
    streamsTotal: positive(env.ATLAS_WISP_STREAMS_TOTAL, 256),
    streamsPerHost: positive(env.ATLAS_WISP_STREAMS_PER_HOST, 32),
    streamsGlobal: positive(env.ATLAS_WISP_STREAMS_GLOBAL, 1000),
  };
}

export function applyWispLimits(options, limits) {
  options.stream_limit_total = limits.streamsTotal;
  options.stream_limit_per_host = limits.streamsPerHost;
  options.stream_limit_global = limits.streamsGlobal;
}
