export function isAdOrTracker(value, baseURL) {
  if (!value) return false;
  let url;
  try {
    url = new URL(String(value), baseURL);
  } catch {
    return false;
  }
  const domains = [
    'doubleclick.net',
    'googlesyndication.com',
    'google-analytics.com',
    'googletagmanager.com',
    'googleadservices.com',
    'adservice.google.com',
    'pagead2.googlesyndication.com',
    'adnxs.com',
    'adroll.com',
    'criteo.com',
    'outbrain.com',
    'taboola.com',
    'scorecardresearch.com',
    'quantserve.com',
    'facebook.net/tr',
    'connect.facebook.net',
    'analytics.twitter.com',
    'hotjar.com',
    'clarity.ms',
    'amazon-adsystem.com',
    'adsystem.com',
    'rubiconproject.com',
    'pubmatic.com',
    'openx.net',
    'casalemedia.com',
    'chartbeat.com',
    'segment.io',
    'segment.com',
    'mixpanel.com',
    'amplitude.com',
    'newrelic.com',
    'nr-data.net',
    'optimizely.com',
    'zedo.com',
    'moatads.com',
  ];
  return domains.some(entry => {
    const [host, ...path] = entry.split('/');
    return (
      (url.hostname === host || url.hostname.endsWith('.' + host)) &&
      (!path.length || url.pathname.startsWith('/' + path.join('/')))
    );
  });
}

export function stripTrackerTags(html, baseURL) {
  return html.replace(/<(script|iframe)\b([^>]*)>[\s\S]*?<\/\1\s*>/gi, (tag, _name, attrs) => {
    const src = /(?:^|\s)src\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    return src && isAdOrTracker(src[1] ?? src[2] ?? src[3], baseURL) ? '' : tag;
  });
}
