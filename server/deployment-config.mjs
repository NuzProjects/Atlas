export function deploymentConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number.parseInt(env.PORT || '8080', 10);
  const host = env.HOST || '127.0.0.1';
  const localWisp = `ws://127.0.0.1:${port}/wisp/`;
  const contentMode = env.ATLAS_CONTENT_MODE || 'shared';
  if (!['shared', 'isolated'].includes(contentMode)) throw new Error('ATLAS_CONTENT_MODE must be shared or isolated');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid TCP port');
  if (production && env.PROXY_ORIGIN_TEMPLATE && !env.PROXY_ORIGIN_TEMPLATE.startsWith('https://'))
    throw new Error('Production content hosting requires HTTPS');
  const publicOrigins = [env.PUBLIC_ORIGIN, ...(env.ATLAS_ADDITIONAL_PUBLIC_ORIGINS || '').split(',')]
    .filter(Boolean)
    .map(value => {
      const url = new URL(value.trim());
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.pathname !== '/' ||
        url.search ||
        url.hash ||
        (production && url.protocol !== 'https:')
      )
        throw new Error('Public origins must be HTTP origins (HTTPS in production)');
      return url.origin;
    });
  const publicRelays = publicOrigins.flatMap(origin =>
    ['/wisp/', '/default-wisp/'].map(path => origin.replace(/^http/, 'ws') + path)
  );
  const publicWisp = env.PUBLIC_ORIGIN ? `${env.PUBLIC_ORIGIN.replace(/^http/, 'ws').replace(/\/$/, '')}/wisp/` : null;
  return {
    production,
    port,
    host,
    localWisp,
    publicWisp,
    contentMode,
    defaultWisp: publicWisp || localWisp,
    publicHosts: publicOrigins.map(origin => new URL(origin).host),
    publicOrigin: env.PUBLIC_ORIGIN ? new URL(env.PUBLIC_ORIGIN).origin : null,
    proxyOriginTemplate:
      contentMode === 'isolated'
        ? env.PROXY_ORIGIN_TEMPLATE || (production ? '' : `http://{site}.localhost:${port}`)
        : '',
    legacyProxyOriginTemplate: env.PROXY_ORIGIN_TEMPLATE || '',
    mirror: env.ENABLE_IPV4_MIRROR ? env.ENABLE_IPV4_MIRROR === 'true' : !production,
    allowPrivate: env.WISP_ALLOW_PRIVATE_IPS ? env.WISP_ALLOW_PRIVATE_IPS === 'true' : !production,
    normalizeRelay(value) {
      let relay = (value || localWisp).trim();
      if (!relay.endsWith('/')) relay += '/';
      if (publicRelays.includes(relay) || relay === `ws://localhost:${port}/wisp/`) return localWisp;
      if (production && relay !== localWisp) throw new Error('Use the configured Atlas relay');
      return relay;
    },
  };
}

export function isPublicAtlasFile(pathname) {
  if (
    [
      '/atlas-content-filter.js',
      '/atlas-game-ads.js',
      '/atlas-blocked.html',
      '/atlas-engines.js',
      '/atlas-scramjet-sw.js',
      '/atlas-ultraviolet-sw.js',
    ].includes(pathname)
  )
    return true;
  return (
    /^\/(?:index\.html|proxy-origin\.js|atlas-(?:tooltips\.js|origin\.js|page-storage\.js|url-crypto\.js|ui\.js|ui\.css|browser\.js|sessions\.js|internal\.js|dock\.(?:js|css)|icons\.js|site-data\.js|mobile\.css|pages\.(?:html|css|js)))$/.test(
      pathname
    ) ||
    (/^\/assets\/[^\\]+\.(?:svg|png|jpe?g|webp|gif|ico|avif|woff2?)$/i.test(pathname) &&
      !pathname.split('/').some(segment => segment.startsWith('.')))
  );
}
