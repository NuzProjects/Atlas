import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createWispDuplex } from './proxy/proxy-wisp.mjs';
import { createWispAgent } from './proxy/proxy-agent.mjs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createFaviconCache } from './services/favicon-cache.mjs';
import { deploymentConfig, isPublicAtlasFile } from './config/deployment-config.mjs';
import { decodeResponse } from './proxy/proxy-encoding.mjs';
import { rewriteLocations, rewriteCss } from './proxy/proxy-compat.mjs';
import { stripTrackerTags } from './proxy/proxy-trackers.mjs';
import WebSocket, { WebSocketServer } from 'ws';
import { withAtlasFetchSlot } from './limits/proxy-limits.mjs';
import {
  contentOrigin,
  contentUpstreamOrigin,
  isContentHost,
  upstreamHeaders,
  responseHeaders,
  siteCookieNames,
} from './proxy/proxy-security.mjs';
import { createResourceTokens } from './proxy/proxy-resource-tokens.mjs';
import { createUrlCodec, loadUrlKey } from './proxy/proxy-url.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { buildInfo } from './config/proxy-build.mjs';
import { createProxyEngines } from './proxy/proxy-engines.mjs';
import { createProxyBootstrap } from './proxy/proxy-bootstrap.mjs';
import { createDefaultRelayGateway } from './services/default-relay.mjs';
import { clientKey, createLimiter } from './limits/proxy-ratelimit.mjs';
import { applyWispLimits, wispLimits } from './limits/wisp-limits.mjs';
import { startStatsLog } from './limits/proxy-stats.mjs';
import { stats as wispStats } from '../src/server/stats.mjs';

import { server as wisp } from '../src/index.mjs';
import * as logging from '../src/logging.mjs';
import { client as wispClient } from '../src/entrypoints/client.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(path.dirname(__filename));
const atlasBuild = buildInfo(__dirname);
const cachedFavicon = createFaviconCache({
  directory: path.join(__dirname, '.cache', 'favicons'),
  fallbackPath: path.join(__dirname, 'assets', 'atlas.png'),
});

const contentFilterScript = await fs.readFile(
  path.join(__dirname, 'public', 'js', 'proxy', 'atlas-content-filter.js'),
  'utf8'
);
const deployment = deploymentConfig();
const {
  buildContentFilterBootstrap,
  buildMetadataBootstrap,
  buildProxyStyle,
  buildInterceptScript,
  connectionErrorPage,
} = createProxyBootstrap({ deployment, contentFilterScript });
const defaultRelayUpgrade = createDefaultRelayGateway(deployment.localWisp);
const requestContext = new AsyncLocalStorage();
const limiter = createLimiter();
const bufferBudget = (Number.parseInt(process.env.ATLAS_BUFFER_BUDGET_MB, 10) || 96) * 1024 * 1024;
let bufferedBytes = 0;
Object.defineProperty(deployment, 'requestOrigin', {
  get: () => requestContext.getStore()?.origin || deployment.publicOrigin,
});
const urlCodec = createUrlCodec(await loadUrlKey(path.join(__dirname, '.cache', 'proxy-url.key')));
const proxyEngines = await createProxyEngines(__dirname, urlCodec);
deployment.decodeProxyTarget = token => urlCodec.open(token).url;
const PORT = deployment.port;

logging.set_level(logging.WARN);
wisp.options.dns_result_order = 'ipv4first';
wisp.options.allow_private_ips = deployment.allowPrivate;
wisp.options.allow_loopback_ips = deployment.allowPrivate;
if (deployment.production) {
  applyWispLimits(wisp.options, wispLimits());
  wisp.options.port_blacklist = [25, 465, 587];
}

process.on('uncaughtException', error => {
  console.error(
    'Fatal application exception; restarting',
    error?.code || error?.name || 'unknown',
    error?.stack?.split('\n').slice(1, 4).join('\n') || ''
  );
  process.exit(1);
});
process.on('unhandledRejection', error => {
  console.error(
    'Unhandled application rejection; restarting',
    error?.code || error?.name || 'unknown',
    error?.stack?.split('\n').slice(1, 4).join('\n') || ''
  );
  process.exit(1);
});

const wispConnections = new Map();
const wispConnecting = new Map();
const wispAgents = new Map();
function getWispAgent(relay, secure, lane = 0) {
  const normalized = deployment.normalizeRelay(relay),
    key = JSON.stringify([normalized, secure, lane]);
  if (!wispAgents.has(key))
    wispAgents.set(
      key,
      createWispAgent(() => getWispConnection(normalized, lane), { secure })
    );
  return wispAgents.get(key);
}

function getWispConnection(wispUrl, lane = 0) {
  const normalized = deployment.normalizeRelay(wispUrl);
  const connectionKey = JSON.stringify([normalized, lane]);

  const existing = wispConnections.get(connectionKey);
  if (existing && existing.connected) {
    return Promise.resolve(existing);
  }
  if (wispConnecting.has(connectionKey)) return wispConnecting.get(connectionKey);

  const opening = new Promise((resolve, reject) => {
    try {
      const conn = new wispClient.ClientConnection(normalized, { wisp_version: 2 });
      wispConnections.set(connectionKey, conn);
      const forget = () => {
        if (wispConnections.get(connectionKey) !== conn) return;
        wispConnections.delete(connectionKey);
        for (const secure of [true, false]) {
          const key = JSON.stringify([normalized, secure, lane]);
          wispAgents.get(key)?.destroy();
          wispAgents.delete(key);
        }
      };
      const timer = setTimeout(() => {
        forget();
        conn.close();
        reject(new Error(`Connection to Wisp server ${normalized} timed out`));
      }, 8000);

      conn.onopen = () => {
        clearTimeout(timer);
        wispConnections.set(connectionKey, conn);
        resolve(conn);
      };

      conn.onerror = err => {
        clearTimeout(timer);
        forget();
        conn.close();
        reject(err || new Error(`Failed to connect to Wisp server: ${normalized}`));
      };

      conn.onclose = () => {
        clearTimeout(timer);
        forget();
        reject(new Error(`Connection to Wisp server ${normalized} closed`));
      };
    } catch (err) {
      reject(err);
    }
  });
  wispConnecting.set(connectionKey, opening);
  const finish = () => {
    if (wispConnecting.get(connectionKey) === opening) wispConnecting.delete(connectionKey);
  };
  opening.then(finish, finish);
  return opening;
}

async function fetchOverWisp(wispUrl, targetUrl, options = {}, redirectCount = 0) {
  return withAtlasFetchSlot(new URL(targetUrl).hostname, (releaseSlot, lane) =>
    fetchOverWispRequest(wispUrl, targetUrl, { ...options, releaseSlot, lane }, redirectCount)
  );
}
async function fetchOverWispRequest(wispUrl, targetUrl, options = {}, redirectCount = 0) {
  if (redirectCount > 5) {
    throw new Error('Too many redirects');
  }

  const parsed = new URL(targetUrl);
  const isHttps = parsed.protocol === 'https:';
  const port = parsed.port ? parseInt(parsed.port, 10) : isHttps ? 443 : 80;
  const host = parsed.hostname;
  const agent = getWispAgent(wispUrl, isHttps, options.lane);

  return new Promise((resolve, reject) => {
    let req;
    const timeoutMs = options.timeout || 10000;
    const timer = setTimeout(() => {
      req?.destroy(new Error('Upstream request timed out'));
      reject(new Error('Upstream request timed out'));
    }, timeoutMs);

    const onConnected = () => {
      const pathWithQuery = parsed.pathname + (parsed.search || '');

      const headers = {
        Host: parsed.host,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        ...(options.headers || {}),
      };

      if (options.body && typeof options.body.pipe !== 'function') {
        headers['Content-Length'] = Buffer.byteLength(options.body);
      }

      req = http.request(
        {
          host: host,
          port: port,
          path: pathWithQuery,
          method: options.method || 'GET',
          headers: headers,
          maxHeaderSize: 65536,
          agent,
        },
        async res => {
          if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && !options.noRedirect) {
            clearTimeout(timer);
            try {
              const redirectTarget = new URL(res.headers.location, targetUrl).href;
              res.resume();
              const redirectedOptions = { ...options, headers: { ...options.headers } };
              options.releaseSlot?.();
              delete redirectedOptions.releaseSlot;
              if (new URL(redirectTarget).origin !== parsed.origin) {
                for (const name of Object.keys(redirectedOptions.headers))
                  if (/^(authorization|cookie|origin|referer)$/i.test(name)) delete redirectedOptions.headers[name];
              }
              if (res.statusCode === 303 || ([301, 302].includes(res.statusCode) && options.method === 'POST')) {
                redirectedOptions.method = 'GET';
                delete redirectedOptions.body;
                delete redirectedOptions.headers['Content-Type'];
              }
              const redirectedRes = await fetchOverWisp(wispUrl, redirectTarget, redirectedOptions, redirectCount + 1);
              resolve(redirectedRes);
              return;
            } catch (e) {
              reject(e);
              return;
            }
          }

          let responseBody;
          try {
            responseBody = decodeResponse(res);
          } catch (error) {
            clearTimeout(timer);
            req.destroy(error);
            reject(error);
            return;
          }
          if (
            options.responseSink &&
            !res.headers.location &&
            !/javascript|ecmascript|text\/css|text\/html/i.test(res.headers['content-type'] || '')
          ) {
            clearTimeout(timer);
            try {
              options.responseSink.writeHead(
                res.statusCode,
                options.buildResponseHeaders({ headers: res.headers, statusCode: res.statusCode })
              );
              await pipeline(responseBody, options.responseSink);
              resolve({ streamed: true });
            } catch (error) {
              req.destroy();
              reject(error);
            }
            return;
          }
          const chunks = [];
          let bytes = 0;
          let counted = 0;
          let held = true;
          const releaseBuffer = () => {
            if (!held) return;
            held = false;
            bufferedBytes -= counted;
          };
          responseBody.on('data', c => {
            bytes += c.length;
            if (held) {
              counted += c.length;
              bufferedBytes += c.length;
            }
            if (bytes > 32 * 1024 * 1024) {
              req.destroy(new Error('Upstream response exceeds 32 MiB limit'));
              return;
            }
            if (bufferedBytes > bufferBudget) {
              req.destroy(new Error('Atlas is busy; please retry in a moment'));
              return;
            }
            chunks.push(c);
          });
          res.on('aborted', () => req.destroy(new Error('Upstream response was interrupted')));
          req.once('close', releaseBuffer);
          responseBody.on('close', releaseBuffer);
          responseBody.on('error', error => {
            releaseBuffer();
            clearTimeout(timer);
            req.destroy();
            reject(error);
          });
          responseBody.on('end', () => {
            releaseBuffer();
            clearTimeout(timer);
            const rawBuffer = Buffer.concat(chunks);
            resolve({
              statusCode: res.statusCode,
              headers: res.headers,
              buffer: rawBuffer,
              targetUrl: targetUrl,
            });
          });
        }
      );

      req.on('error', err => {
        clearTimeout(timer);
        req.destroy();
        reject(err);
      });

      if (typeof options.body?.pipe === 'function') {
        const body = options.body;
        const interrupted = () => req.destroy(new Error('Upload was interrupted'));
        body.once('aborted', interrupted);
        body.once('error', interrupted);
        req.once('close', () => {
          body.unpipe(req);
          body.removeListener('aborted', interrupted);
          body.removeListener('error', interrupted);
        });
        body.pipe(req);
      } else {
        req.end(options.body);
      }
    };

    onConnected();
  });
}

const resourceToken = createResourceTokens(urlCodec);

function proxyAddress(target, wisp, isNavigation = false, blockAds = true, blockFingerprint = true, descriptor) {
  const kind = isNavigation ? 'document' : 'resource';
  const value = { url: target, wisp, kind, blockAds, blockFingerprint };
  const token = isNavigation ? urlCodec.seal(value, descriptor) : resourceToken(value, descriptor);
  return contentOrigin(target, deployment) + (isNavigation ? '/view' : '/resource') + '?token=' + token;
}
function resolveToProxy(
  rawUrl,
  targetBaseUrl,
  wispEndpoint,
  isNavigation = false,
  blockAds = true,
  blockFingerprint = true,
  descriptor
) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  const trimmed = rawUrl.trim();
  if (
    trimmed.startsWith('#') ||
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('blob:') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('tel:')
  ) {
    return rawUrl;
  }
  if (['/view?', '/resource?', '/proxy?', '/proxy-raw?'].some(prefix => trimmed.startsWith(prefix))) {
    return rawUrl;
  }
  try {
    const resolved = new URL(trimmed, targetBaseUrl).href;
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      return proxyAddress(resolved, wispEndpoint, isNavigation, blockAds, blockFingerprint, descriptor);
    }
  } catch {}
  return rawUrl;
}

function rewriteHtmlForProxy(html, targetUrl, wispUrl, blockAds = true, blockFingerprint = true) {
  const contentFilterBootstrap = buildContentFilterBootstrap(targetUrl);
  const sourceHead = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] || html.slice(0, 131072);
  const metadataMarkup = (sourceHead.match(/<title\b[^>]*>[\s\S]*?<\/title>|<(?:link|base)\b[^>]*>/gi) || []).join('');
  const baseMarkup = sourceHead.match(/<base\b[^>]*>/i)?.[0] || '';
  const metadataBootstrap = buildMetadataBootstrap(targetUrl, metadataMarkup);
  const proxyDescriptor = resourceToken.descriptor();
  const proxyAddresses = new Map();
  const rewriteUrl = (raw, base, relay, navigation = false, ads = true, fingerprint = true) => {
    let key;
    try {
      key = JSON.stringify([new URL(raw, base).href, navigation, relay, ads, fingerprint]);
    } catch {
      return raw;
    }
    if (proxyAddresses.has(key)) return proxyAddresses.get(key);
    const address = resolveToProxy(raw, base, relay, navigation, ads, fingerprint, proxyDescriptor);
    if (proxyAddresses.size < 2048) proxyAddresses.set(key, address);
    return address;
  };
  const darkStyle = buildProxyStyle(blockAds);
  let interceptScript = buildInterceptScript({
    targetUrl,
    wispUrl,
    proxyDescriptor,
    blockAds,
    blockFingerprint,
    baseMarkup,
  });

  if (blockAds) {
    html = stripTrackerTags(html, targetUrl);
  }

  html = html.replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, '');
  html = html.replace(/<meta[^>]+http-equiv=["']?X-Frame-Options["']?[^>]*>/gi, '');

  const transformedAttrs = attrs => attrs.replace(/\s+integrity\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '');

  html = html.replace(/<link\b([^>]+)>/gi, (tagMatch, attrs) => {
    const newAttrs = attrs.replace(/\bhref=(["'])([^"']+)\1/i, (m, quote, url) => {
      return `href=${quote}${rewriteUrl(url, targetUrl, wispUrl, false, blockAds, blockFingerprint)}${quote}`;
    });
    return `<link${newAttrs !== attrs ? transformedAttrs(newAttrs) : newAttrs}>`;
  });

  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (match, attrs, body) => {
    if (
      /\bsrc\s*=/.test(attrs) ||
      /\btype\s*=\s*["'](?:application\/ld\+json|application\/json|importmap)/i.test(attrs)
    )
      return match;
    return (
      '<script' +
      attrs +
      '>' +
      rewriteLocations(body, url => rewriteUrl(url, targetUrl, wispUrl, false, blockAds, blockFingerprint), targetUrl) +
      '</script>'
    );
  });

  html = html.replace(/<script\b([^>]+)>/gi, (tagMatch, attrs) => {
    const newAttrs = attrs.replace(/\bsrc=(["'])([^"']+)\1/i, (m, quote, url) => {
      return `src=${quote}${rewriteUrl(url, targetUrl, wispUrl, false, blockAds, blockFingerprint)}${quote}`;
    });
    return `<script${newAttrs !== attrs ? transformedAttrs(newAttrs) : newAttrs}>`;
  });

  html = html.replace(/<(img|source|audio|video|embed)\b([^>]+)>/gi, (tagMatch, tagName, attrs) => {
    let newAttrs = attrs.replace(/\bsrc=(["'])([^"']+)\1/i, (m, quote, url) => {
      return `src=${quote}${rewriteUrl(url, targetUrl, wispUrl, false, blockAds, blockFingerprint)}${quote}`;
    });
    newAttrs = newAttrs.replace(/\bsrcset=(["'])([^"']+)\1/i, (m, quote, srcsetVal) => {
      const rewritten = srcsetVal
        .split(',')
        .map(part => {
          const trimmed = part.trim();
          if (!trimmed) return part;
          const parts = trimmed.split(/\s+/);
          const url = parts[0];
          const descriptor = parts.slice(1).join(' ');
          const proxiedUrl = rewriteUrl(url, targetUrl, wispUrl, false, blockAds, blockFingerprint);
          return descriptor ? `${proxiedUrl} ${descriptor}` : proxiedUrl;
        })
        .join(', ');
      return `srcset=${quote}${rewritten}${quote}`;
    });
    return `<${tagName}${newAttrs}>`;
  });

  html = html.replace(/<iframe\b([^>]+)>/gi, (tagMatch, attrs) => {
    const newAttrs = attrs.replace(/\bsrc=(["'])([^"']+)\1/i, (m, quote, url) => {
      return `src=${quote}${rewriteUrl(url, targetUrl, wispUrl, true, blockAds, blockFingerprint)}${quote}`;
    });
    return `<iframe${newAttrs}>`;
  });

  html = html.replace(/<base[^>]*>/gi, '');

  html = html.replace(/<a\b([^>]+)>/gi, (tagMatch, attrs) => {
    let newAttrs = attrs.replace(/(^|\s)href\s*=\s*(["'])([^"']*)\2/i, (m, space, quote, url) => {
      return `${space}data-atlas-href=${quote}${rewriteUrl(url, targetUrl, wispUrl, true, blockAds, blockFingerprint)}${quote}`;
    });
    newAttrs = newAttrs.replace(/\btarget=(["'])(?:_top|_parent)\1/gi, 'target=$1_self$1');
    if (/\bdata-atlas-href=/.test(newAttrs)) {
      if (!/\brole=/.test(newAttrs)) newAttrs += ' role="link"';
      if (!/\btabindex=/.test(newAttrs)) newAttrs += ' tabindex="0"';
    }
    return `<a${newAttrs}>`;
  });

  html = html.replace(/<form\b([^>]+)>/gi, (tagMatch, attrs) => {
    let newAttrs = attrs.replace(/\baction=(["'])([^"']+)\1/i, (m, quote, url) => {
      return `action=${quote}${rewriteUrl(url, targetUrl, wispUrl, true, blockAds, blockFingerprint)}${quote}`;
    });
    newAttrs = newAttrs.replace(/\btarget=(["'])(?:_top|_parent)\1/gi, 'target=$1_self$1');
    return `<form${newAttrs}>`;
  });

  const isolationRuntime =
    '<script src="/atlas-origin.js"></script><script src="/js/proxy/atlas-url-crypto.js"></script><script src="/js/proxy/atlas-page-storage.js"></script>';

  interceptScript = interceptScript.replace('__ATLAS_PROXY_ADDRESSES__', () =>
    JSON.stringify([...proxyAddresses]).replace(/</g, '\\u003c')
  );
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(
      /<head[^>]*>/i,
      match => match + metadataBootstrap + contentFilterBootstrap + isolationRuntime + darkStyle + interceptScript
    );
  }
  return metadataBootstrap + contentFilterBootstrap + isolationRuntime + darkStyle + interceptScript + html;
}

const staticEtags = new Map();
const mimeTypes = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  avif: 'image/avif',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  map: 'application/json',
  txt: 'text/plain; charset=utf-8',
};

function redirectProxyRequest(req, res, reqUrl, legacyRoute, isolated) {
  if (['/view', '/resource'].includes(reqUrl.pathname)) {
    if (reqUrl.searchParams.has('token')) {
      try {
        if (reqUrl.searchParams.getAll('token').length !== 1 || reqUrl.searchParams.has('url')) throw new Error();
        const value = urlCodec.open(reqUrl.searchParams.get('token'));
        if (
          value.kind !== (reqUrl.pathname === '/view' ? 'document' : 'resource') ||
          !['http:', 'https:'].includes(new URL(value.url).protocol)
        )
          throw new Error();
        reqUrl.search = '';
        reqUrl.searchParams.set('url', value.url);
        if (value.wisp) reqUrl.searchParams.set('wisp', value.wisp);
        reqUrl.searchParams.set('block_ads', value.blockAds !== false);
        reqUrl.searchParams.set('block_fp', value.blockFingerprint !== false);
        if (value.kind === 'resource') reqUrl.searchParams.set('compat', '2');
      } catch {
        res.writeHead(400, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
        res.end('Invalid or expired proxy address. Reload Atlas to refresh this address.');
        return true;
      }
    }
    try {
      const target = reqUrl.searchParams.get('url');
      const origin = contentOrigin(target, deployment);
      const hadToken = new URL(req.url, 'http://atlas.local').searchParams.has('token');
      if (
        legacyRoute ||
        new URL(origin).host !== req.headers.host ||
        !hadToken ||
        new URL(req.url, 'http://atlas.local').searchParams.size !== 1
      ) {
        res.writeHead(307, {
          'Cache-Control': 'no-store',
          Location: proxyAddress(
            target,
            reqUrl.searchParams.get('wisp') || deployment.localWisp,
            reqUrl.pathname === '/view',
            reqUrl.searchParams.get('block_ads') !== 'false',
            reqUrl.searchParams.get('block_fp') !== 'false'
          ),
        });
        res.end();
        return true;
      }
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Isolated content hosting must be configured before browsing.');
      return true;
    }
  } else if (
    (isolated || !deployment.proxyOriginTemplate) &&
    ![
      '/atlas-origin.js',
      '/js/proxy/proxy-origin.js',
      '/js/proxy/atlas-url-crypto.js',
      '/js/proxy/atlas-page-storage.js',
    ].includes(reqUrl.pathname)
  ) {
    try {
      let original;
      if (!deployment.proxyOriginTemplate && req.headers.referer) {
        const referer = new URL(req.headers.referer);
        if (referer.origin === deployment.requestOrigin && ['/view', '/resource'].includes(referer.pathname))
          original = referer.searchParams.has('token')
            ? urlCodec.open(referer.searchParams.get('token')).url
            : referer.searchParams.get('url');
      } else if (isolated) original = contentUpstreamOrigin(req.headers.host, deployment);
      if (!original) throw new Error();
      const resolved = new URL(reqUrl.pathname + reqUrl.search, original).href;
      res.writeHead(307, {
        Location: proxyAddress(
          resolved,
          deployment.localWisp,
          ['document', 'iframe'].includes(req.headers['sec-fetch-dest'])
        ),
      });
      res.end();
      return true;
    } catch {
      if (isolated) {
        res.writeHead(404);
        res.end('Not Found');
        return true;
      }
    }
  }
  return false;
}

async function serveFavicon(req, res, reqUrl) {
  try {
    const domain = reqUrl.searchParams.get('domain');
    const icon = domain
      ? await cachedFavicon(domain)
      : { data: await fs.readFile(path.join(__dirname, 'assets', 'atlas.png')), contentType: 'image/png' };
    const etag = '"' + createHash('sha256').update(icon.data).digest('hex') + '"';
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', `public, max-age=${icon.fallback ? 3600 : 604800}`);
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304);
      res.end();
      return;
    }
    res.writeHead(200, { 'Content-Type': icon.contentType, 'Content-Length': icon.data.length });
    res.end(icon.data);
  } catch {
    res.writeHead(400);
    res.end('Invalid favicon domain');
  }
}

async function serveSuggestions(res, reqUrl) {
  const q = (reqUrl.searchParams.get('q') || '').trim().slice(0, 256);
  if (!q) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([]));
    return;
  }

  let answered = false;
  const reply = suggestions => {
    if (answered || res.headersSent || res.destroyed) return;
    answered = true;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(suggestions));
  };
  try {
    const suggestUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(q)}`;
    const sReq = https.get(suggestUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 4000 }, sRes => {
      let raw = '';
      sRes.setEncoding('utf8');
      sRes.on('data', chunk => {
        raw += chunk;
        if (raw.length > 65536) {
          reply([]);
          sReq.destroy();
        }
      });
      sRes.on('error', () => reply([]));
      sRes.on('end', () => {
        try {
          const parsed = JSON.parse(raw);
          const suggestions = Array.isArray(parsed) && Array.isArray(parsed[1]) ? parsed[1] : [];
          reply(suggestions.filter(value => typeof value === 'string').slice(0, 8));
        } catch {
          reply([]);
        }
      });
    });
    sReq.on('error', () => reply([]));
    sReq.on('timeout', () => {
      reply([]);
      sReq.destroy();
    });
  } catch {
    reply([]);
  }
}

function serveSiteCookies(req, res, reqUrl) {
  const targets = reqUrl.searchParams
    .getAll('origin')
    .slice(0, 8)
    .filter(value => {
      try {
        return ['http:', 'https:'].includes(new URL(value).protocol);
      } catch {
        return false;
      }
    });
  const names = siteCookieNames(req.headers.cookie, targets);
  if (req.method === 'POST') {
    res.writeHead(204, {
      'Cache-Control': 'no-store',
      ...(names.length ? { 'Set-Cookie': names.map(name => `${name}=; Path=/; Max-Age=0`) } : {}),
    });
    res.end();
    return;
  }
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ count: names.length }));
}

function serveClock(res) {
  res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify({ time: Date.now() }));
}

function serveStatus(req, res) {
  const defaultWisp = deployment.publicWisp || `ws://${req.headers.host || 'localhost:8080'}/wisp/`;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      status: 'online',
      version: '0.5.0',
      local_wisp: defaultWisp,
      port: PORT,
    })
  );
}

async function serveResource(req, res, reqUrl) {
  const rawTarget = reqUrl.searchParams.get('url') || '';
  const targetWisp = reqUrl.searchParams.get('wisp') || `ws://localhost:${PORT}/wisp/`;

  if (!rawTarget) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url parameter');
    return;
  }

  try {
    const headers = upstreamHeaders(req, rawTarget, deployment);
    const body = !['GET', 'HEAD'].includes(req.method) ? req : undefined;
    const options = {
      timeout: 30000,
      method: req.method,
      headers,
      body,
      noRedirect: true,
      relay: deployment.normalizeRelay(targetWisp),
      responseSink: res,
      buildResponseHeaders: response => ({
        ...responseHeaders(req, response, deployment, rawTarget),
        'Cache-Control':
          headers.authorization || headers.cookie || response.headers['set-cookie']
            ? 'no-store'
            : response.headers['cache-control'] || 'no-store',
      }),
    };
    const response = await fetchOverWisp(targetWisp, rawTarget, options);
    if (!response.streamed && /javascript|ecmascript/i.test(response.headers['content-type'] || '')) {
      response.buffer = Buffer.from(
        rewriteLocations(
          response.buffer.toString('utf8'),
          url =>
            resolveToProxy(
              url,
              rawTarget,
              targetWisp,
              false,
              reqUrl.searchParams.get('block_ads') !== 'false',
              reqUrl.searchParams.get('block_fp') !== 'false'
            ),
          rawTarget
        )
      );
    }
    if (!response.streamed && /text\/css/i.test(response.headers['content-type'] || '')) {
      response.buffer = Buffer.from(
        rewriteCss(response.buffer.toString('utf8'), url => resolveToProxy(url, rawTarget, targetWisp, false))
      );
    }
    if (response.streamed) return;
    const contentType = response.headers['content-type'] || 'application/octet-stream';
    if (response.headers.location) {
      const target = new URL(response.headers.location, rawTarget).href;
      res.writeHead(response.statusCode, {
        ...responseHeaders(req, response, deployment, rawTarget),
        Location: proxyAddress(
          target,
          targetWisp,
          false,
          reqUrl.searchParams.get('block_ads') !== 'false',
          reqUrl.searchParams.get('block_fp') !== 'false'
        ),
      });
      res.end();
      return;
    }
    res.writeHead(response.statusCode || 200, {
      ...responseHeaders(req, response, deployment, rawTarget),
      'Content-Type': contentType,
      'Cache-Control':
        req.method !== 'GET' ||
        headers.Authorization ||
        headers.authorization ||
        headers.cookie ||
        response.headers['set-cookie'] ||
        /json|html/i.test(contentType)
          ? 'no-store'
          : response.headers['cache-control'] || 'public, max-age=86400',
    });
    res.end(response.buffer);
  } catch (err) {
    if (res.headersSent || res.destroyed) {
      res.destroy();
      return;
    }
    res.writeHead(502, { 'Content-Type': 'text/plain' });
    res.end('Failed to fetch over Wisp: ' + err.message);
  }
}

async function serveView(req, res, reqUrl) {
  const rawTarget = reqUrl.searchParams.get('url') || '';
  const targetWisp = reqUrl.searchParams.get('wisp') || `ws://localhost:${PORT}/wisp/`;

  if (!rawTarget) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Missing url parameter');
    return;
  }

  let normalized = rawTarget;
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }

  try {
    const fetchOpts = {
      timeout: 30000,
      method: req.method,
      headers: upstreamHeaders(req, normalized, deployment),
      noRedirect: true,
    };
    if (!['GET', 'HEAD'].includes(req.method)) {
      fetchOpts.body = req;
      if (req.headers['content-type']) {
        fetchOpts.headers['Content-Type'] = req.headers['content-type'];
      }
    }

    const response = await fetchOverWisp(targetWisp, normalized, fetchOpts);
    if (response.headers.location) {
      const target = new URL(response.headers.location, normalized).href;
      res.writeHead(response.statusCode, {
        ...responseHeaders(req, response, deployment, normalized),
        Location: proxyAddress(
          target,
          targetWisp,
          true,
          reqUrl.searchParams.get('block_ads') !== 'false',
          reqUrl.searchParams.get('block_fp') !== 'false'
        ),
      });
      res.end();
      return;
    }

    const contentType = response.headers['content-type'] || 'text/html';

    if (contentType.toLowerCase().includes('text/html')) {
      let html = response.buffer.toString('utf8');
      const blockAdsParam = reqUrl.searchParams.get('block_ads') !== 'false';
      const blockFpParam = reqUrl.searchParams.get('block_fp') !== 'false';
      html = rewriteHtmlForProxy(html, response.targetUrl || normalized, targetWisp, blockAdsParam, blockFpParam);

      res.writeHead(response.statusCode || 200, {
        ...responseHeaders(req, response, deployment, normalized),
        'Cache-Control': 'no-store',
        'Content-Type': 'text/html; charset=utf-8',
      });
      res.end(html);
    } else {
      res.writeHead(response.statusCode || 200, {
        'Content-Type': contentType,
        'Content-Length': response.buffer.length,
      });
      res.end(response.buffer);
    }
  } catch (err) {
    res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(connectionErrorPage(err.message));
  }
}

async function serveStatic(req, res, reqUrl) {
  try {
    const isAppPage = ['/', '/home', '/apps', '/settings'].includes(reqUrl.pathname);
    const legalPage = { '/privacy': '/pages/privacy.html', '/terms': '/pages/terms.html' }[reqUrl.pathname];
    if (!isAppPage && !isPublicAtlasFile(reqUrl.pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const staticRoot = reqUrl.pathname.startsWith('/assets/') ? __dirname : path.join(__dirname, 'public');
    let filePath = path.join(
      staticRoot,
      isAppPage
        ? 'index.html'
        : legalPage || (reqUrl.pathname === '/atlas-origin.js' ? '/js/proxy/proxy-origin.js' : reqUrl.pathname)
    );
    filePath = path.normalize(filePath);

    if (!filePath.startsWith(staticRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    let stats = await fs.stat(filePath);
    if (stats && stats.isDirectory()) {
      filePath = path.join(filePath, 'index.html');
      stats = await fs.stat(filePath);
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const cacheControl =
      filePath === path.join(__dirname, 'assets', 'atlas.png')
        ? 'no-cache'
        : ['svg', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'ico', 'avif'].includes(ext)
          ? reqUrl.searchParams.has('v')
            ? 'public, max-age=31536000, immutable'
            : 'public, max-age=604800'
          : ['html', 'css', 'js', 'json'].includes(ext)
            ? 'no-cache'
            : 'public, max-age=3600';
    const known = isAppPage ? null : staticEtags.get(filePath);
    if (
      known &&
      known.mtimeMs === stats.mtimeMs &&
      known.size === stats.size &&
      req.headers['if-none-match'] === known.etag
    ) {
      res.writeHead(304, { ETag: known.etag, 'Cache-Control': cacheControl });
      res.end();
      return;
    }

    let data = await fs.readFile(filePath);
    if (isAppPage) {
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
      res.setHeader(
        'Content-Security-Policy',
        "frame-src 'self' " +
          (deployment.ads?.origin || '') +
          ' https: about: blob: data:' +
          (deployment.production ? '' : ' http:') +
          "; connect-src 'self' " +
          (deployment.ads?.origin || '') +
          ' https: wss: ws:' +
          (deployment.production ? '' : ' http:')
      );
      const config = JSON.stringify({
        build: atlasBuild,
        production: deployment.production,
        defaultWisp: (deployment.requestOrigin || reqUrl.origin).replace(/^http/, 'ws') + '/wisp/',
        ads: deployment.ads,
        publicOrigin: deployment.requestOrigin || reqUrl.origin,
        contentMode: deployment.contentMode,
        proxyOriginTemplate: deployment.proxyOriginTemplate,
        urlCodec: urlCodec.issue(),
      }).replace(/</g, '\\u003c');
      data = Buffer.from(
        data.toString().replace('<head>', '<head><script>window.__atlasConfig=' + config + ';</script>')
      );
    }
    let etag;
    if (!isAppPage) {
      etag = '"' + createHash('sha256').update(data).digest('base64url').slice(0, 27) + '"';
      staticEtags.delete(filePath);
      staticEtags.set(filePath, { mtimeMs: stats.mtimeMs, size: stats.size, etag });
      if (staticEtags.size > 512) staticEtags.delete(staticEtags.keys().next().value);
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, { ETag: etag, 'Cache-Control': cacheControl });
        res.end();
        return;
      }
    }

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
      'Cache-Control': cacheControl,
      ...(etag ? { ETag: etag } : {}),
    });
    res.end(data);
  } catch (err) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
}

async function appHandler(req, res) {
  const reqUrl = new URL(req.url, `http://${req.headers.host || 'localhost:8080'}`);
  const legacyRoute = { '/proxy': '/view', '/proxy-raw': '/resource' }[reqUrl.pathname];
  if (legacyRoute) reqUrl.pathname = legacyRoute;
  const isolated = isContentHost(req.headers.host || '', deployment);
  const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '');
  if (!isolated && !localHost && deployment.publicOrigin && !deployment.publicHosts.includes(req.headers.host)) {
    res.writeHead(421);
    res.end('Unknown Atlas host');
    return;
  }
  const limitKind =
    reqUrl.pathname === '/api/suggestions'
      ? 'suggestions'
      : (reqUrl.pathname.startsWith('/api/') && reqUrl.pathname !== '/api/status') ||
          ['/view', '/resource'].includes(reqUrl.pathname)
        ? 'requests'
        : null;
  if (limitKind && !limiter.allowRequest(clientKey(req), limitKind)) {
    res.writeHead(429, { 'Content-Type': 'text/plain', 'Retry-After': '60', 'Cache-Control': 'no-store' });
    res.end('Too many requests. Please wait a minute and try again.');
    return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  if (isolated) res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  else res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (await proxyEngines(req, res, reqUrl)) return;
  if (redirectProxyRequest(req, res, reqUrl, legacyRoute, isolated)) return;
  if (!isolated && req.headers.origin && req.headers.origin !== (deployment.requestOrigin || reqUrl.origin)) {
    res.writeHead(403);
    res.end('Cross-origin application request refused');
    return;
  }

  if (reqUrl.pathname === '/api/favicon' || reqUrl.pathname === '/favicon.ico') return serveFavicon(req, res, reqUrl);

  if (req.method === 'OPTIONS' && !isolated) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (reqUrl.pathname === '/api/suggestions') return serveSuggestions(res, reqUrl);
  if (reqUrl.pathname === '/api/site-cookies') return serveSiteCookies(req, res, reqUrl);
  if (reqUrl.pathname === '/api/clock') return serveClock(res);
  if (reqUrl.pathname === '/api/status') return serveStatus(req, res);
  if (reqUrl.pathname === '/resource') return serveResource(req, res, reqUrl);
  if (reqUrl.pathname === '/view') return serveView(req, res, reqUrl);

  if (['/privacy.html', '/terms.html'].includes(reqUrl.pathname)) {
    res.writeHead(301, { Location: reqUrl.pathname.slice(0, -5) + reqUrl.search });
    res.end();
    return;
  }
  return serveStatic(req, res, reqUrl);
}

const atlasSocketServer = new WebSocketServer({
  noServer: true,
  maxPayload: 1048576,
  perMessageDeflate: false,
  handleProtocols: (_protocols, req) => req.atlasProtocol || false,
});
async function routeAtlasUpgrade(req, socket, head) {
  const requestUrl = new URL(req.url, 'http://atlas.local');
  if (requestUrl.pathname === '/default-wisp/') {
    const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(req.headers.host || '');
    if (
      (!localHost && deployment.publicOrigin && !deployment.publicHosts.includes(req.headers.host)) ||
      req.headers.origin !== deployment.requestOrigin ||
      requestUrl.search
    ) {
      socket.destroy();
      return;
    }
    defaultRelayUpgrade(req, socket, head);
    return;
  }
  if (requestUrl.pathname === '/wisp/') {
    const approvedAlias =
      deployment.production && deployment.publicHosts.some(host => req.headers.origin === 'https://' + host);
    if (
      req.headers.origin &&
      !approvedAlias &&
      req.headers.origin !== (deployment.requestOrigin || 'http://' + req.headers.host)
    ) {
      socket.destroy();
      return;
    }
    wisp.routeRequest(req, socket, head);
    return;
  }
  if (requestUrl.pathname !== '/atlas-websocket') {
    socket.destroy();
    return;
  }
  let target, source;
  try {
    if (requestUrl.searchParams.has('token')) {
      if (
        requestUrl.searchParams.getAll('token').length !== 1 ||
        requestUrl.searchParams.has('url') ||
        requestUrl.searchParams.has('source')
      )
        throw new Error();
      const value = urlCodec.open(requestUrl.searchParams.get('token'));
      if (value.kind !== 'socket') throw new Error();
      requestUrl.search = '';
      requestUrl.searchParams.set('url', value.url);
      requestUrl.searchParams.set('source', value.source);
    }
    target = new URL(requestUrl.searchParams.get('url'));
    source = new URL(requestUrl.searchParams.get('source'));
    if (
      !['ws:', 'wss:'].includes(target.protocol) ||
      target.username ||
      target.password ||
      new URL(contentOrigin(source.href, deployment)).host !== req.headers.host
    )
      throw new Error();
    if (req.headers.origin !== contentOrigin(source.href, deployment)) throw new Error();
  } catch {
    socket.destroy();
    return;
  }
  let upstream,
    duplex,
    secure,
    client,
    closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    upstream?.terminate();
    secure?.destroy();
    duplex?.destroy();
    if (client?.readyState < WebSocket.CLOSING) client.close();
    else if (!client) socket.destroy();
  };
  socket.on('close', close);
  socket.on('error', close);
  try {
    const connection = await getWispConnection(deployment.localWisp);
    if (closed) return;
    const stream = connection.create_stream(
      target.hostname,
      Number(target.port || (target.protocol === 'wss:' ? 443 : 80))
    );
    duplex = createWispDuplex(stream);
    duplex.on('error', close);
    secure =
      target.protocol === 'wss:'
        ? tls.connect({
            socket: duplex,
            servername: target.hostname,
            minVersion: 'TLSv1.2',
            rejectUnauthorized: true,
            ALPNProtocols: ['http/1.1'],
          })
        : duplex;
    secure.on('error', close);
    const protocols = (req.headers['sec-websocket-protocol'] || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean);
    const headers = { Origin: source.origin };
    const httpTarget = new URL(target);
    httpTarget.protocol = target.protocol === 'wss:' ? 'https:' : 'http:';
    if (source.origin === httpTarget.origin && req.headers.cookie) {
      const scoped = upstreamHeaders({ headers: req.headers, method: 'GET' }, httpTarget.href, deployment).cookie;
      if (scoped) headers.Cookie = scoped;
    }
    upstream = new WebSocket(target.href, protocols, {
      createConnection: () => secure,
      agent: false,
      headers,
      handshakeTimeout: 10000,
      maxPayload: 1048576,
      perMessageDeflate: false,
    });
    upstream.on('error', close);
    upstream.on('close', close);
    await new Promise((resolve, reject) => {
      upstream.once('open', () => {
        upstream.pause();
        resolve();
      });
      upstream.once('error', reject);
      upstream.once('close', () => reject(new Error('Upstream WebSocket closed')));
    });
    if (closed) return;

    upstream.pause();
    req.atlasProtocol = upstream.protocol;
    atlasSocketServer.handleUpgrade(req, socket, head, accepted => {
      client = accepted;
      client.on('close', close);
      client.on('error', close);
      client.on('message', (data, binary) => {
        if (upstream.readyState !== WebSocket.OPEN) {
          close();
          return;
        }
        client.pause();
        upstream.send(data, { binary }, error => (error ? close() : client.resume()));
      });
      upstream.on('message', (data, binary) => {
        if (client.readyState !== WebSocket.OPEN) {
          close();
          return;
        }
        upstream.pause();
        client.send(data, { binary }, error => (error ? close() : upstream.resume()));
      });
      upstream.resume();
    });
  } catch {
    close();
  }
}

function requestOrigin(req) {
  if (isContentHost(req.headers.host || '', deployment)) return deployment.publicOrigin;
  return (deployment.publicOrigin ? new URL(deployment.publicOrigin).protocol : 'http:') + '//' + req.headers.host;
}
const handleRequest = (req, res) =>
  requestContext
    .run({ origin: requestOrigin(req) }, () => appHandler(req, res))
    .catch(error => {
      console.warn('HTTP request failed', error.code || error.name || 'request');
      if (res.headersSent || res.destroyed) {
        res.destroy();
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Atlas request failed. Please retry.');
    });
function limitedUpgrade(req, socket, head) {
  const release = limiter.openSocket(clientKey(req));
  if (!release) {
    socket.end('HTTP/1.1 429 Too Many Requests\r\nRetry-After: 30\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    return;
  }
  socket.once('close', release);
  requestContext
    .run({ origin: requestOrigin(req) }, () => routeAtlasUpgrade(req, socket, head))
    .catch(() => socket.destroy());
}
const server = http.createServer({ maxHeaderSize: 1024 * 1024 }, handleRequest);
server.on('upgrade', limitedUpgrade);
startStatsLog({
  limiter,
  wispStats,
  intervalSeconds: process.env.ATLAS_STATS_INTERVAL_SECONDS ? Number(process.env.ATLAS_STATS_INTERVAL_SECONDS) : 60,
});

server.listen(PORT, deployment.host, () => {
  console.log(`\n======================================================`);
  console.log(`Wisp Proxy & Search running on port ${PORT}`);
  console.log(`URL: http://localhost:${PORT}`);
  console.log(`Local Wisp: ws://localhost:${PORT}/wisp/`);
  console.log(`======================================================\n`);
});

const fallbackServer = http.createServer({ maxHeaderSize: 1024 * 1024 }, handleRequest);
fallbackServer.on('upgrade', limitedUpgrade);
if (deployment.mirror)
  fallbackServer
    .listen(8081, '127.0.0.1', () => {
      console.log(`IPv4 Mirror: http://127.0.0.1:8081 / ws://127.0.0.1:8081/wisp/`);
    })
    .on('error', () => {});
