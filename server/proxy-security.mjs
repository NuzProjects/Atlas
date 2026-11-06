import origins from '../public/proxy-origin.js';

const upstreamOrigins = new Map();
export function contentOrigin(target, config) {
  const original = new URL(target).origin;
  const isolated = origins.originFor(target, config.proxyOriginTemplate, config.requestOrigin || config.publicOrigin);
  if (!config.proxyOriginTemplate) return isolated;
  upstreamOrigins.delete(isolated);
  upstreamOrigins.set(isolated, original);
  if (upstreamOrigins.size > 4096) upstreamOrigins.delete(upstreamOrigins.keys().next().value);
  return isolated;
}
export function isContentHost(host, config) {
  const template = config.proxyOriginTemplate || config.legacyProxyOriginTemplate;
  if (!template) return false;
  const suffix = new URL(template.replace('{site}', 'x')).host;
  const prefix = suffix.split('.')[0].slice(0, -1),
    label = host.split('.')[0];
  return (
    label.startsWith(prefix) &&
    /^[a-f0-9]{32}$/.test(label.slice(prefix.length)) &&
    host.substring(host.indexOf('.')) === suffix.substring(suffix.indexOf('.'))
  );
}
export function contentUpstreamOrigin(host, config) {
  if (!isContentHost(host, config)) return null;
  const protocol = new URL(config.proxyOriginTemplate.replace('{site}', 'x')).protocol;
  return upstreamOrigins.get(protocol + '//' + host) || null;
}
export function escapeHtml(value) {
  return String(value).replace(
    /[&<>"']/g,
    char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]
  );
}
export function proxyCookies(headers) {
  const values = headers['set-cookie'];
  return (Array.isArray(values) ? values : values ? [values] : []).map(
    cookie => cookie.replace(/;\s*Domain=[^;]*/gi, '').replace(/;\s*Path=[^;]*/gi, '') + '; Path=/'
  );
}
export function siteCookiePrefix(target) {
  return 'atlas_' + origins.hash(new URL(target).origin).slice(0, 32) + '_';
}
export function siteCookieNames(cookie, targets) {
  const prefixes = targets.map(siteCookiePrefix);
  const names = (cookie || '')
    .split(';')
    .map(value => value.trim().split('=')[0])
    .filter(name => name && prefixes.some(prefix => name.startsWith(prefix)));
  return [...new Set(names)];
}
export function siteCookies(cookie, target) {
  const prefix = siteCookiePrefix(target);
  return (cookie || '')
    .split(';')
    .map(value => value.trim())
    .filter(value => value.startsWith(prefix))
    .map(value => value.slice(prefix.length))
    .join('; ');
}
export function upstreamHeaders(req, target, config) {
  const headers = {};
  const allowed = [
    'authorization',
    'content-type',
    'accept',
    'accept-language',
    'range',
    'if-none-match',
    'if-modified-since',
    'access-control-request-method',
    'access-control-request-headers',
  ];
  allowed.forEach(name => {
    if (req.headers[name]) headers[name] = req.headers[name];
  });
  for (const [name, value] of Object.entries(req.headers)) {
    if (/^x-/i.test(name) && !/^x-(?:forwarded(?:-|$)|real-ip$|atlas(?:-|$))/i.test(name)) headers[name] = value;
  }
  if (req.headers.host === new URL(contentOrigin(target, config)).host && req.headers.cookie) {
    const cookies = config.proxyOriginTemplate ? req.headers.cookie : siteCookies(req.headers.cookie, target);
    if (cookies) headers.cookie = cookies;
  }
  const sourceOrigin = upstreamOrigins.get(req.headers.origin);
  if (req.headers.origin) headers.Origin = sourceOrigin || req.headers.origin;
  try {
    const referer = new URL(req.headers.referer);
    const original =
      referer.searchParams.get('token') && config.decodeProxyTarget
        ? config.decodeProxyTarget(referer.searchParams.get('token'))
        : referer.searchParams.get('url');
    if (original && contentOrigin(original, config) === referer.origin) {
      headers.Referer = original;
      if (req.headers.origin === referer.origin) headers.Origin = new URL(original).origin;
    } else if (upstreamOrigins.has(referer.origin)) headers.Referer = upstreamOrigins.get(referer.origin) + '/';
  } catch {}

  if (headers.Origin && headers.Origin !== new URL(target).origin && !['GET', 'HEAD', 'OPTIONS'].includes(req.method))
    delete headers.cookie;
  return headers;
}
export function responseHeaders(req, response, config, target) {
  const result = {};
  for (const name of [
    'content-type',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
    'content-disposition',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-expose-headers',
  ]) {
    if (response.headers[name]) result[name] = response.headers[name];
  }
  const cookies = proxyCookies(response.headers).map(cookie =>
    config.proxyOriginTemplate ? cookie : siteCookiePrefix(target) + cookie
  );
  if (cookies.length) result['Set-Cookie'] = cookies;
  const allowed = response.headers['access-control-allow-origin'];
  if (allowed === '*') result['Access-Control-Allow-Origin'] = '*';
  else if (allowed && req.headers.origin) {
    try {
      if (contentOrigin(allowed, config) === req.headers.origin)
        result['Access-Control-Allow-Origin'] = req.headers.origin;
    } catch {}
  }
  if (
    result['Access-Control-Allow-Origin'] === req.headers.origin &&
    response.headers['access-control-allow-credentials'] === 'true'
  )
    result['Access-Control-Allow-Credentials'] = 'true';
  result.Vary = 'Origin';
  return result;
}
