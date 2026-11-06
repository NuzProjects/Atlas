import { ClientConnection } from '../src/client/connection.mjs';
import * as logging from '../src/logging.mjs';
import { pathToFileURL } from 'node:url';
import origins from '../public/proxy-origin.js';
import { proxyEngineAssets } from '../server/proxy-engines.mjs';
logging.set_level(logging.ERROR);

export async function healthCheck(origin, { timeout = 10000, requireIsolation = false, production = false } = {}) {
  const base = new URL(origin);
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password)
    throw new Error('Invalid health-check origin');
  const response = await fetch(new URL('/api/status', base), {
    signal: AbortSignal.timeout(timeout),
    redirect: 'error',
  });
  if (!response.ok || (await response.json()).status !== 'online') throw new Error('HTTP readiness failed');
  const page = await fetch(new URL('/home', base), { signal: AbortSignal.timeout(timeout), redirect: 'error' });
  const html = await page.text();
  const originHelper = /<script\b[^>]*\bsrc=["']\/((?:atlas|proxy)-origin\.js)(?:\?[^"']*)?["']/i.exec(html)?.[1];
  if (!page.ok || !html.includes('homeSearchInput') || !originHelper) throw new Error('Application readiness failed');
  for (const asset of proxyEngineAssets) {
    const response = await fetch(new URL(asset, base), { signal: AbortSignal.timeout(timeout), redirect: 'error' });
    const type = response.headers.get('content-type') || '';
    if (
      !response.ok ||
      !(asset.endsWith('.wasm') ? type.includes('application/wasm') : type.includes('javascript')) ||
      !(await response.arrayBuffer()).byteLength
    )
      throw new Error('Proxy engine readiness failed: ' + asset);
  }
  if (production && /"contentMode":"shared"/.test(html)) {
    const helper = await fetch(new URL('/atlas-page-storage.js', base), {
      signal: AbortSignal.timeout(timeout),
      redirect: 'error',
    });
    if (!helper.ok || !(await helper.text()).includes('AtlasPageStorage'))
      throw new Error('Shared content runtime readiness failed');
  } else if (production) requireIsolation = true;
  if (requireIsolation && !/"proxyOriginTemplate":"https:\/\/[^"\s]*\{site\}[^"\s]*"/.test(html))
    throw new Error('Production content isolation is not configured');
  if (requireIsolation) {
    const match = html.match(/"proxyOriginTemplate":("[^"\n]+")/);
    const isolated = origins.originFor('https://example.com', JSON.parse(match[1]));
    const content = await fetch(new URL('/' + originHelper, isolated), {
      signal: AbortSignal.timeout(timeout),
      redirect: 'error',
    });
    if (!content.ok || !(await content.text()).includes('AtlasProxyOrigin'))
      throw new Error('Isolated content DNS/TLS readiness failed');
  }
  const socket = new URL('/wisp/', base);
  socket.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  await new Promise((resolve, reject) => {
    const connection = new ClientConnection(socket.href, { wisp_version: 2 });
    const timer = setTimeout(() => finish(new Error('Wisp readiness timed out')), timeout);
    let settled = false;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      connection.close();
      error ? reject(error) : resolve();
    };
    connection.onopen = () => finish();
    connection.onerror = () => finish(new Error('Wisp readiness failed'));
    connection.onclose = () => finish(new Error('Wisp closed before readiness'));
  });
  return { http: true, application: true, wisp: true };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await healthCheck(process.argv[2] || process.env.ATLAS_HEALTH_ORIGIN || 'http://127.0.0.1:8080', {
      production: process.argv.includes('--production'),
    });
    console.log('Atlas health: HTTP, application and Wisp v2 ready.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
