import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createWispDuplex } from './proxy-wisp.mjs';
import { createWispAgent } from './proxy-agent.mjs';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createFaviconCache } from './favicon-cache.mjs';
import { deploymentConfig, isPublicAtlasFile } from './deployment-config.mjs';
import { decodeResponse } from './proxy-encoding.mjs';
import { rewriteLocations, rewriteCss } from './proxy-compat.mjs';
import { installDocumentAddress } from './proxy-document.mjs';
import { isAdOrTracker, stripTrackerTags } from './proxy-trackers.mjs';
import WebSocket, { WebSocketServer } from 'ws';
import { withAtlasFetchSlot } from './proxy-limits.mjs';
import {
  contentOrigin,
  contentUpstreamOrigin,
  isContentHost,
  escapeHtml,
  upstreamHeaders,
  responseHeaders,
  siteCookieNames,
} from './proxy-security.mjs';
import { createUrlCodec, loadUrlKey } from './proxy-url.mjs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { buildInfo } from './proxy-build.mjs';
import { createProxyEngines } from './proxy-engines.mjs';
import { createDefaultRelayGateway } from './default-relay.mjs';
import { clientKey, createLimiter } from './proxy-ratelimit.mjs';

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

const contentFilterScript = await fs.readFile(path.join(__dirname, 'public', 'atlas-content-filter.js'), 'utf8');
const deployment = deploymentConfig();
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
  wisp.options.stream_limit_total = 64;
  wisp.options.stream_limit_per_host = 16;
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
          let held = true;
          const releaseBuffer = () => {
            if (!held) return;
            held = false;
            bufferedBytes -= bytes;
          };
          responseBody.on('data', c => {
            bytes += c.length;
            bufferedBytes += c.length;
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

function proxyAddress(target, wisp, isNavigation = false, blockAds = true, blockFingerprint = true, descriptor) {
  const kind = isNavigation ? 'document' : 'resource';
  const token = urlCodec.seal({ url: target, wisp, kind, blockAds, blockFingerprint }, descriptor);
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
  const contentFilterBootstrap = `<script>${contentFilterScript}
(function(){
  var blocked=false;
  function block(){
    if(blocked)return;blocked=true;
    document.documentElement.style.visibility='hidden';window.stop();
    window.parent.postMessage({type:'__atlas_content_blocked',url:${JSON.stringify(targetUrl).replace(/</g, '\\u003c')}},'*');
  }
  window.addEventListener('message',function(event){
    if(event.data?.type==='__atlas_content_blocked' && Array.from(document.querySelectorAll('iframe')).some(function(frame){return frame.contentWindow===event.source && frame.getClientRects().length && getComputedStyle(frame).visibility!=='hidden';}))block();
  });
  AtlasContentFilter.observeDocument(document,block);
})();</script>`;
  const sourceHead = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)?.[1] || html.slice(0, 131072);
  const metadataMarkup = (sourceHead.match(/<title\b[^>]*>[\s\S]*?<\/title>|<(?:link|base)\b[^>]*>/gi) || []).join('');
  const baseMarkup = sourceHead.match(/<base\b[^>]*>/i)?.[0] || '';
  const metadataBootstrap = `<script id="__atlas_initial_metadata">(function(){try{
    document.documentElement.setAttribute('data-atlas-url',${JSON.stringify(targetUrl).replace(/</g, '\\u003c')});
    var readySent=false;
    function reportReady(){
      if(readySent || document.readyState==='loading')return;
      readySent=true;
      window.parent.postMessage({type:'__network_document_ready',url:${JSON.stringify(targetUrl).replace(/</g, '\\u003c')}},${JSON.stringify((deployment.proxyOriginTemplate ? deployment.publicOrigin : deployment.requestOrigin) || '').replace(/</g, '\\u003c')});
      document.removeEventListener('readystatechange',reportReady);
    }
    document.addEventListener('readystatechange',reportReady);reportReady();
    var template=document.createElement('template');template.innerHTML=${JSON.stringify(metadataMarkup).replace(/</g, '\\u003c')};
    var title=template.content.querySelector('title')?.textContent.trim();
    var base=new URL(template.content.querySelector('base[href]')?.getAttribute('href') || '',${JSON.stringify(targetUrl).replace(/</g, '\\u003c')});
    var icons=Array.from(template.content.querySelectorAll('link[rel~="icon" i]')).filter(function(icon){return !icon.media || matchMedia(icon.media).matches;});
    icons.sort(function(a,b){function score(icon){return icon.sizes?.value==='any'||/svg/i.test(icon.type)?100:/(?:^| )32x32(?: |$)/.test(icon.sizes?.value||'')?90:80;}return score(b)-score(a);});
    window.parent.postMessage({type:'__network_metadata',url:${JSON.stringify(targetUrl).replace(/</g, '\\u003c')},title:title,iconDeclared:!!icons.length,icon:new URL(icons[0]?.getAttribute('href') || '/favicon.ico',base).href},${JSON.stringify((deployment.proxyOriginTemplate ? deployment.publicOrigin : deployment.requestOrigin) || '').replace(/</g, '\\u003c')});
  }catch(_){}})();</script>`;
  const proxyDescriptor = urlCodec.issue();
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
  const darkStyle = `
<style id="__network_proxy_dark_patch">
  a[data-atlas-href] { cursor: pointer; }
  :where(a[data-atlas-href]) { color: LinkText; text-decoration: underline; }
  ${
    blockAds
      ? `

  .ad, .ads, .adsbygoogle, .ad-banner, .advertisement, [id^="google_ads_iframe"], [id^="ad-banner"],
  [class*="sponsored"], [id*="sponsored"], .taboola, .outbrain, iframe[src*="doubleclick"],
  iframe[src*="adservice"], iframe[src*="googlesyndication"], [class*="banner-ad"], [id*="banner-ad"],
  [class*="ad-box"], [id*="ad-box"], .ad-container, [id*="ad-container"], .ad-wrapper,
  .ads-wrapper, #carbonads, .pub_300x250, .pub_728x90, .text-ad, .ad-unit, [data-ad],
  [data-ad-unit], [data-ad-slot], [id*="advert"], [class*="advert"] {
    display: none !important;
    visibility: hidden !important;
    height: 0 !important;
    width: 0 !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }
  `
      : ''
  }
</style>
`;
  let interceptScript = `
<script id="__network_proxy_interceptor">
(function() {
  var targetUrl = ${JSON.stringify(targetUrl).replace(/</g, '\\u003c')};
  var documentTargetUrl = targetUrl;
  var atlasBaseTemplate = document.createElement('template');
  atlasBaseTemplate.innerHTML = ${JSON.stringify(baseMarkup).replace(/</g, '\\u003c')};
  (${installDocumentAddress.toString()})(document, function() { return targetUrl; }, atlasBaseTemplate.content.querySelector('base[href]')?.getAttribute('href'));
  var documentProxyToken = new URL(location.href).searchParams.get('token');
  var wispEndpoint = ${JSON.stringify(wispUrl).replace(/</g, '\\u003c')};
  var proxyOriginTemplate = ${JSON.stringify(deployment.proxyOriginTemplate)};
  var proxyDescriptor = ${JSON.stringify(proxyDescriptor)};
  var proxyAddresses = new Map(__ATLAS_PROXY_ADDRESSES__);
  var atlasParentOrigin = ${JSON.stringify((deployment.proxyOriginTemplate ? deployment.publicOrigin : deployment.requestOrigin) || '')};
  if (!atlasParentOrigin) { try { atlasParentOrigin = new URL(document.referrer).origin; } catch (_) {} }
  var atlasCanvasContexts = new WeakMap(), atlasFrameCaptures = [];
  var atlasNativeContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type) {
    var context = atlasNativeContext.apply(this, arguments);
    if (context && !atlasCanvasContexts.has(this)) {
      var entry = {type:String(type), context:context, version:0};atlasCanvasContexts.set(this, entry);
      if (/webgl/.test(entry.type)) ['clear','drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced','blitFramebuffer'].forEach(function(name) { var original = context[name];if(typeof original === 'function')context[name] = function() { var result = original.apply(this, arguments);if(atlasFrameCaptures.length)entry.version++;return result; }; });
    }
    return context;
  };
  function atlasReadCanvas(canvas) {
    var copy = document.createElement('canvas'), scale = Math.min(1, 512 / Math.max(canvas.width, canvas.height));
    copy.width = Math.max(1, Math.round(canvas.width * scale));copy.height = Math.max(1, Math.round(canvas.height * scale));
    var context = atlasNativeContext.call(copy, '2d');context.drawImage(canvas, 0, 0, copy.width, copy.height);
    return copy.toDataURL('image/png');
  }
  function atlasFlushCanvasCaptures() {
    if (!atlasFrameCaptures.length) return;
    var requests = atlasFrameCaptures.slice();
    requests.forEach(function(request) { if(!request.canvases.every(function(canvas, index) { return request.versions[index] < 0 || atlasCanvasContexts.get(canvas)?.version > request.versions[index]; }))return;atlasFrameCaptures.splice(atlasFrameCaptures.indexOf(request), 1);clearTimeout(request.timer);try { request.resolve(request.canvases.map(atlasReadCanvas)); } catch(error) { request.reject(new Error('This canvas cannot be captured safely.')); } });
  }
  var atlasNativeFrame = window.requestAnimationFrame;
  window.requestAnimationFrame = function(callback) {
    return atlasNativeFrame.call(window, function(time) { try { callback.call(this, time); } finally { atlasFlushCanvasCaptures(); } });
  };
  Object.defineProperty(window, '__atlasCaptureCanvasFrames', {value:function(canvases) {
    if (!Array.isArray(canvases) || canvases.length > 20 || canvases.some(function(canvas) { return !(canvas instanceof HTMLCanvasElement) || canvas.ownerDocument !== document; })) return Promise.reject(new Error('Invalid canvas capture.'));
    var needsFrame = canvases.some(function(canvas) { var entry = atlasCanvasContexts.get(canvas);return entry && /webgl|experimental-webgl/.test(entry.type) && !entry.context.getContextAttributes()?.preserveDrawingBuffer; });
    if (!needsFrame) { try { return Promise.resolve(canvases.map(atlasReadCanvas)); } catch(error) { return Promise.reject(new Error('This canvas cannot be captured safely.')); } }
    return new Promise(function(resolve, reject) { var request = {canvases:canvases, resolve:resolve, reject:reject, versions:canvases.map(function(canvas) { var entry = atlasCanvasContexts.get(canvas);return entry && /webgl/.test(entry.type) && !entry.context.getContextAttributes()?.preserveDrawingBuffer ? entry.version : -1; })};request.timer = setTimeout(function() { var index = atlasFrameCaptures.indexOf(request);if(index >= 0) atlasFrameCaptures.splice(index, 1);reject(new Error('The game has not rendered a fresh frame. Resume it and add the tab again.')); }, 1500);atlasFrameCaptures.push(request); });
  }});
  var blockAdsEnabled = ${JSON.stringify(blockAds)};
  var blockFingerprintEnabled = ${JSON.stringify(blockFingerprint)};
  if (!proxyOriginTemplate) AtlasPageStorage.initialize(targetUrl);

    var virtualLocation = {};
    ['href','origin','protocol','host','hostname','port','pathname','search','hash'].forEach(function(name) {
      Object.defineProperty(virtualLocation, name, { enumerable:true, get:function() { return new URL(targetUrl)[name]; }, set:function(value) { var next = new URL(targetUrl); next[name] = value; window.location.assign(toProxy(next.href, true)); } });
    });
    virtualLocation.assign = function(url) { window.location.assign(toProxy(resolveTarget(String(url)), true)); };
    virtualLocation.replace = function(url) { window.location.replace(toProxy(resolveTarget(String(url)), true)); };
    virtualLocation.reload = function() { window.location.reload(); };
    virtualLocation.toString = function() { return targetUrl; };
    Object.defineProperty(window, '__atlasLocationFor', {value:function(object) { return object === window || object === document ? virtualLocation : object.location; }});
    [window, document].forEach(function(object) { Object.defineProperty(object, '__atlasLocation', { get:function() { return virtualLocation; }, set:virtualLocation.assign }); });
    var NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        var destination = new URL(String(url));
        var allowed = ['ws:', 'wss:'].includes(destination.protocol);
        var relay = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/atlas-websocket?token=' + AtlasUrlCrypto.seal({url:destination.href,source:targetUrl,kind:'socket'},proxyDescriptor);
        super(allowed ? relay : url, protocols);
      }
    };

  function unwrapProxyUrl(u) {
    if (!u || typeof u !== 'string') return u;
    try {
      var cur = u;
      var safety = 0;
      while (typeof cur === 'string' && safety < 5 && ['/view?','/resource?','/proxy?','/proxy-raw?'].some(function(prefix){return cur.indexOf(prefix)!==-1;})) {
        safety++;
        var parsed = new URL(cur, window.location.origin);
        var inner = parsed.searchParams.get('url');
        if(parsed.searchParams.has('token')) {
          try { inner=AtlasUrlCrypto.open(parsed.searchParams.get('token'),proxyDescriptor).url; }
          catch (_) {
            if(typeof documentProxyToken !== 'undefined' && parsed.searchParams.get('token')===documentProxyToken)inner=documentTargetUrl;
            else break;
          }
        }
        if (inner && inner !== cur) {
          cur = inner;
        } else {
          break;
        }
      }
      return cur;
    } catch(e) {}
    return u;
  }

  function resolveTarget(u) {
    if (!u || typeof u !== 'string') return u;
    u = unwrapProxyUrl(u);
    try {
      var resolved = new URL(u, targetUrl);
      if (resolved.host === window.location.host) {
        return new URL(resolved.pathname + resolved.search + resolved.hash, targetUrl).href;
      }
      return resolved.href;
    } catch(e) {
      return u;
    }
  }

  function toProxy(u, isNav) {
    if (!u || typeof u !== 'string') return u;
    var trimmed = u.trim();
    try {
      var atlasAsset = new URL(trimmed, window.location.origin);
      if(['/view','/resource','/proxy','/proxy-raw'].includes(atlasAsset.pathname)&&atlasAsset.searchParams.has('token'))return atlasAsset.href;
    } catch (_) {}
    if (trimmed.startsWith('#') || trimmed.startsWith('javascript:') || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') || trimmed.startsWith('about:')) {
      return u;
    }
    trimmed = unwrapProxyUrl(trimmed);
    try {
      var abs = resolveTarget(trimmed);
      if (abs.startsWith('http://') || abs.startsWith('https://')) {
        var ep = isNav ? '/view' : '/resource';
        var key = JSON.stringify([abs,Boolean(isNav),wispEndpoint,blockAdsEnabled,blockFingerprintEnabled]);
        if (proxyAddresses.has(key)) return proxyAddresses.get(key);
        var address = AtlasProxyOrigin.originFor(abs, proxyOriginTemplate, window.location.origin) + ep + '?token=' + AtlasUrlCrypto.seal({url:abs,wisp:wispEndpoint,kind:isNav?'document':'resource',blockAds:blockAdsEnabled,blockFingerprint:blockFingerprintEnabled},proxyDescriptor);
        if (proxyAddresses.size < 2048) proxyAddresses.set(key,address);
        return address;
      }
    } catch(e) {}
    return u;
  }

  window.__atlasImport = function(base, specifier, options) {
    var value = String(specifier);
    if (!/^(?:\\.{0,2}\\/|https?:)/.test(value)) return import(value, options);
    return import(toProxy(new URL(value, base).href, false), options);
  };
  var isAdOrTracker = function(url) { return (${isAdOrTracker.toString()})(url, targetUrl); };

  window.addEventListener('error', function(event) {
    var script = event.target;
    if (script instanceof HTMLScriptElement && isAdOrTracker(unwrapProxyUrl(script.src))) event.stopImmediatePropagation();
  }, true);

  var _origFetch = window.fetch;
  if (_origFetch) {
    window.fetch = function(resource, init) {
      var urlStr = (typeof resource === 'string') ? resource : (resource && (resource.url || resource.href) ? String(resource.url || resource.href) : '');
      if (blockAdsEnabled && isAdOrTracker(urlStr)) {
        return Promise.resolve(new Response(null, { status: 204, statusText: 'Blocked by AdBlock' }));
      }
      try {
        if (urlStr) {
          var proxied = toProxy(urlStr, false);
          if (proxied !== urlStr) {
            if (typeof resource === 'string' || resource instanceof URL) {
              resource = proxied;
            } else if (resource && resource.url) {
              resource = new Request(proxied, resource);
            }
          }
        }
      } catch(e) {}
      return _origFetch.call(this, resource, init);
    };
  }

  var _origXHROpen = XMLHttpRequest.prototype.open;
  if (_origXHROpen) {
    XMLHttpRequest.prototype.open = function(method, url) {
      if (blockAdsEnabled && isAdOrTracker(url)) {
        this._isBlockedAd = true;
        return;
      }
      try {
        if (url) url = toProxy(url, false);
      } catch(e) {}
      return _origXHROpen.call(this, method, url, ...Array.prototype.slice.call(arguments, 2));
    };
    var _origXHRSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function() {
      if (this._isBlockedAd) {
        try {
          Object.defineProperty(this, 'readyState', { value: 4, writable: false });
          Object.defineProperty(this, 'status', { value: 204, writable: false });
        } catch(e) {}
        var self = this;
        setTimeout(function() {
          if (typeof self.onreadystatechange === 'function') self.onreadystatechange();
          if (typeof self.onload === 'function') self.onload();
        }, 0);
        return;
      }
      return _origXHRSend.apply(this, arguments);
    };
  }

  try {
    var _realParent = window.parent;
    Object.defineProperty(window, 'top', { get: function() { return window; }, configurable: true });
  } catch(e) {}

  try {
    function patchAttrProp(proto, propName, isNav) {
      var desc = Object.getOwnPropertyDescriptor(proto, propName);
      if (desc && desc.set) {
        var origSet = desc.set;
        Object.defineProperty(proto, propName, {
          set: function(val) {
            if (blockAdsEnabled && isAdOrTracker(val)) return;
            try { val = toProxy(val, isNav); } catch(e) {}
            if (this.tagName === 'SCRIPT' || this.tagName === 'LINK') this.removeAttribute('integrity');
            return origSet.call(this, val);
          },
          get: desc.get,
          configurable: true,
          enumerable: true
        });
      }
    }

    function patchIntegrity(proto) {
      var desc = Object.getOwnPropertyDescriptor(proto, 'integrity');
      if (desc && desc.set) Object.defineProperty(proto, 'integrity', {
        get: desc.get, set: function() { this.removeAttribute('integrity'); }, configurable: true, enumerable: true
      });
      var set = proto.setAttribute;
      proto.setAttribute = function(name, value) {
        if (String(name).toLowerCase() === 'integrity') { this.removeAttribute('integrity'); return; }
        return set.call(this, name, value);
      };
    }
    if (typeof HTMLScriptElement !== 'undefined') patchIntegrity(HTMLScriptElement.prototype);
    if (typeof HTMLLinkElement !== 'undefined') patchIntegrity(HTMLLinkElement.prototype);
    if (typeof HTMLScriptElement !== 'undefined') patchAttrProp(HTMLScriptElement.prototype, 'src', false);
    if (typeof HTMLLinkElement !== 'undefined') patchAttrProp(HTMLLinkElement.prototype, 'href', false);
    if (typeof HTMLImageElement !== 'undefined') patchAttrProp(HTMLImageElement.prototype, 'src', false);
    if (typeof HTMLIFrameElement !== 'undefined') patchAttrProp(HTMLIFrameElement.prototype, 'src', true);
  } catch(e) {}

  var _origCreateElement = document.createElement;
  document.createElement = function(tagName) {
    var el = _origCreateElement.apply(document, arguments);
    var lower = String(tagName).toLowerCase();
    var _origSetAttr = el.setAttribute;
    el.setAttribute = function(name, val) {
      var attrLower = String(name).toLowerCase();
      if (blockAdsEnabled && (attrLower === 'src' || attrLower === 'data-src') && isAdOrTracker(val)) {
        return;
      }
      if (attrLower === 'src') {
        val = toProxy(val, lower === 'iframe');
      } else if (attrLower === 'href') {
        val = toProxy(val, lower === 'a');
      }
      return _origSetAttr.call(this, name, val);
    };
    return el;
  };

  if (blockFingerprintEnabled) {
    try {
      if (HTMLCanvasElement.prototype.toDataURL) {
        var _origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function() {
          try {
            var ctx = this.getContext('2d');
            if (ctx) {
              var img = ctx.getImageData(0, 0, Math.min(this.width, 10), Math.min(this.height, 10));
              for (var i = 0; i < img.data.length; i += 4) {
                img.data[i] = (img.data[i] + (Math.random() > 0.5 ? 1 : -1)) & 255;
              }
              ctx.putImageData(img, 0, 0);
            }
          } catch(e) {}
          return _origToDataURL.apply(this, arguments);
        };
      }
    } catch(e) {}
  }

  function notifyAtlasFrameFocus() {
    try {
      if (typeof window.parent.handleAtlasFramePointer === 'function') {
        window.parent.handleAtlasFramePointer(window);
        return;
      }
    } catch (_) {}
    window.parent.postMessage({ type: '__atlas_frame_pointer' }, atlasParentOrigin || '*');
  }
  window.addEventListener('pointerdown', notifyAtlasFrameFocus, true);
  document.addEventListener('focusin', notifyAtlasFrameFocus, true);
  window.addEventListener('message', function(e) {
    if (e.source !== window.parent || e.origin !== atlasParentOrigin || !e.data) return;
    if (e.data.type === '__atlas_navigation') {
      if (e.data.action === 'back') history.back();
      if (e.data.action === 'forward') history.forward();
      if (e.data.action === 'reload') location.reload();
      return;
    }
  });

  var lastAtlasMetadata = '';
  function reportNav() {
    try {
      var t = document.title;
      document.documentElement.setAttribute('data-atlas-url', targetUrl);
      var icons = Array.from(document.querySelectorAll('link[rel~="icon" i]')).filter(function(icon) { return !icon.media || matchMedia(icon.media).matches; });
      function iconScore(icon) {
        var sizes = icon.getAttribute('sizes') || '';
        if (sizes === 'any' || /svg/i.test(icon.type)) return 100;
        if (/(?:^| )32x32(?: |$)/.test(sizes)) return 90;
        if (/(?:^| )16x16(?: |$)/.test(sizes)) return 80;
        return 70;
      }
      icons.sort(function(a,b) { return iconScore(b) - iconScore(a); });
      var icon = icons[0];
      var iconUrl = resolveTarget(icon?.getAttribute('href') || '/favicon.ico');
      var signature = JSON.stringify([targetUrl,t,iconUrl,!!icon]);
      if (signature === lastAtlasMetadata) return;
      lastAtlasMetadata = signature;
      window.parent.postMessage({ type: '__network_metadata', url: targetUrl, title:t, icon:iconUrl, iconDeclared:!!icon }, atlasParentOrigin || '*');
    } catch(err) {}
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', reportNav);
  } else {
    reportNav();
  }
  window.addEventListener('load', reportNav);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', reportNav);
  window.addEventListener('popstate', function() {
    try { targetUrl = resolveTarget(location.href) || targetUrl; } catch (_) {}
    reportNav();
  });
  try {
    new MutationObserver(function(changes) {
      if (changes.some(function(change) {
        return ['TITLE','LINK'].includes(change.target.nodeName) || change.target.parentNode?.nodeName === 'TITLE' || Array.from(change.addedNodes || []).some(function(node) { return ['TITLE','LINK'].includes(node.nodeName); });
      })) reportNav();
    }).observe(document.head || document.documentElement, { subtree:true, characterData:true, childList:true, attributes:true, attributeFilter:['href','rel','sizes','type','media'] });
  } catch(err) {}

  try {
    var _origPushState = history.pushState;
    var _origReplaceState = history.replaceState;
    history.pushState = function(state, title, url) {
      if (url) {
        var unwrapped = unwrapProxyUrl(url);
        var resolved = resolveTarget(unwrapped);
        targetUrl = resolved;
        reportNav();
        var proxied = toProxy(resolved, true);
        return _origPushState.call(history, state, title, proxied);
      }
      return _origPushState.apply(history, arguments);
    };
    history.replaceState = function(state, title, url) {
      if (url) {
        var unwrapped = unwrapProxyUrl(url);
        var resolved = resolveTarget(unwrapped);
        targetUrl = resolved;
        reportNav();
        var proxied = toProxy(resolved, true);
        return _origReplaceState.call(history, state, title, proxied);
      }
      return _origReplaceState.apply(history, arguments);
    };
  } catch(e) {}

  Object.defineProperty(window, '__atlasLinkDestination', {value: function(anchor) { return unwrapProxyUrl(anchor.getAttribute('href') || anchor.getAttribute('data-atlas-href') || ''); }});
  var anchorGet = Element.prototype.getAttribute;
  var anchorSet = Element.prototype.setAttribute;
  var anchorRemove = Element.prototype.removeAttribute;
  function prepareAtlasLink(a) {
    var href = anchorGet.call(a, 'href');
    if (href !== null) {
      anchorSet.call(a, 'data-atlas-href', toProxy(href, true));
      anchorRemove.call(a, 'href');
    }
    if (anchorGet.call(a, 'data-atlas-href') !== null) {
      if (!a.hasAttribute('role')) anchorSet.call(a, 'role', 'link');
      if (!a.hasAttribute('tabindex')) anchorSet.call(a, 'tabindex', '0');
    }
  }
  HTMLAnchorElement.prototype.getAttribute = function(name) {
    if (String(name).toLowerCase() === 'href') return anchorGet.call(this, 'data-atlas-href') ?? anchorGet.call(this, name);
    return anchorGet.call(this, name);
  };
  HTMLAnchorElement.prototype.setAttribute = function(name, value) {
    if (String(name).toLowerCase() === 'href') {
      anchorSet.call(this, 'data-atlas-href', toProxy(String(value), true));
      prepareAtlasLink(this);
      return;
    }
    return anchorSet.call(this, name, value);
  };
  HTMLAnchorElement.prototype.removeAttribute = function(name) {
    if (String(name).toLowerCase() === 'href') anchorRemove.call(this, 'data-atlas-href');
    return anchorRemove.call(this, name);
  };
  var anchorHas = Element.prototype.hasAttribute;
  HTMLAnchorElement.prototype.hasAttribute = function(name) {
    if (String(name).toLowerCase() === 'href') return anchorHas.call(this, 'data-atlas-href') || anchorHas.call(this, name);
    return anchorHas.call(this, name);
  };
  Object.defineProperty(HTMLAnchorElement.prototype, 'href', {
    configurable: true, enumerable: true,
    get: function() {
      var href = this.getAttribute('href');
      try { return href === null ? '' : new URL(href, location.href).href; } catch (_) { return href || ''; }
    },
    set: function(value) { this.setAttribute('href', value); }
  });
  function prepareAtlasLinks(root) {
    if (root.nodeType !== 1 && root.nodeType !== 9) return;
    if (root.matches && root.matches('a')) prepareAtlasLink(root);
    root.querySelectorAll('a').forEach(prepareAtlasLink);
  }
  prepareAtlasLinks(document);
  new MutationObserver(function(changes) {
    changes.forEach(function(change) {
      if (change.type === 'attributes') prepareAtlasLink(change.target);
      else change.addedNodes.forEach(prepareAtlasLinks);
    });
  }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
  function atlasLinkAt(target) { return target && target.closest ? target.closest('a[data-atlas-href]') : null; }
  function reportAtlasLink(a) {
    var href = a ? a.getAttribute('href') : '';
    var url = href && !/^javascript:/i.test(href) ? resolveTarget(href) : '';
    window.parent.postMessage({ type: '__atlas_link_preview', url: url }, atlasParentOrigin || '*');
  }
  document.addEventListener('pointerover', function(e) { reportAtlasLink(atlasLinkAt(e.target)); }, true);
  document.addEventListener('pointerout', function(e) { reportAtlasLink(atlasLinkAt(e.relatedTarget)); }, true);
  document.addEventListener('focusin', function(e) { reportAtlasLink(atlasLinkAt(e.target)); }, true);
  document.addEventListener('focusout', function(e) { reportAtlasLink(atlasLinkAt(e.relatedTarget)); }, true);
  window.addEventListener('blur', function() { reportAtlasLink(null); });
  window.addEventListener('pagehide', function() { reportAtlasLink(null); });
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === '__atlas_link_preview' && Array.from(document.querySelectorAll('iframe')).some(function(frame) { return frame.contentWindow === e.source; })) {
      window.parent.postMessage(e.data, atlasParentOrigin || '*');
    }
  });
  document.addEventListener('keydown', function(e) {
    var a = atlasLinkAt(e.target);
    if (a && e.key === 'Enter') { e.preventDefault(); a.click(); }
  });
  function openAtlasLink(e) {
    var a = atlasLinkAt(e.target);
    if (!a || (e.type === 'auxclick' && e.button !== 1)) return;
    var href = a.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    reportAtlasLink(null);
    if (/^(javascript:|mailto:|tel:|#)/i.test(href)) { window.location.href = href; return; }
    if (e.button === 1 || e.ctrlKey || e.metaKey || a.getAttribute('target') === '_blank') {
      window.open(toProxy(href, true), '_blank');
    } else window.location.href = toProxy(href, true);
  }

  document.addEventListener("click", function(e) {
    openAtlasLink(e);
  }, true);
  document.addEventListener('auxclick', openAtlasLink, true);

  document.addEventListener("submit", function(e) {
    if (e.defaultPrevented) return;
    var form = e.target;
    if (form) {
      e.preventDefault();
      var action = e.submitter?.getAttribute('formaction') || form.getAttribute("action") || "";
      var resolvedAction = resolveTarget(action || targetUrl);
      var method = (e.submitter?.getAttribute('formmethod') || form.getAttribute("method") || "GET").toUpperCase();
      var formData = new FormData(form, e.submitter || undefined);
      if (method === "GET") {
        var params = new URLSearchParams();
        for (var pair of formData) params.append(pair[0], typeof pair[1] === 'string' ? pair[1] : pair[1].name);
        var actionUrl = new URL(resolvedAction);
        actionUrl.search = params.toString();
        var navUrl = toProxy(actionUrl.href, true);
        window.location.href = navUrl;
      } else {
        form.action = toProxy(resolvedAction, true);
        form.method = method;
        if (e.submitter?.hasAttribute('formenctype')) form.enctype = e.submitter.getAttribute('formenctype');
        var submitted;
        if (e.submitter?.name) {
          submitted = document.createElement('input'); submitted.type = 'hidden';
          submitted.name = e.submitter.name; submitted.value = e.submitter.value; form.appendChild(submitted);
        }
        HTMLFormElement.prototype.submit.call(form);
        if (submitted) setTimeout(function(){ submitted.remove(); }, 0);
      }
    }
  });

  var atlasNativeOpen = window.open;
  window.open = function() {
    var args = Array.prototype.slice.call(arguments);
    if (args[0] != null && String(args[0]) && !/^(?:about:|blob:|data:|javascript:)/i.test(String(args[0]))) args[0] = toProxy(String(args[0]), true);
    return atlasNativeOpen.apply(window, args);
  };

})();
</script>
`;

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
    '<script src="/atlas-origin.js"></script><script src="/atlas-url-crypto.js"></script><script src="/atlas-page-storage.js"></script>';

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
  if (await proxyEngines(req, res, reqUrl)) return;
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
        return;
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
        return;
      }
    } catch {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Isolated content hosting must be configured before browsing.');
      return;
    }
  } else if (
    (isolated || !deployment.proxyOriginTemplate) &&
    !['/atlas-origin.js', '/proxy-origin.js', '/atlas-url-crypto.js', '/atlas-page-storage.js'].includes(
      reqUrl.pathname
    )
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
      return;
    } catch {
      if (isolated) {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }
  }
  if (!isolated && req.headers.origin && req.headers.origin !== (deployment.requestOrigin || reqUrl.origin)) {
    res.writeHead(403);
    res.end('Cross-origin application request refused');
    return;
  }

  if (reqUrl.pathname === '/api/favicon' || reqUrl.pathname === '/favicon.ico') {
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
    return;
  }

  if (req.method === 'OPTIONS' && !isolated) {
    res.writeHead(204);
    res.end();
    return;
  }

  if (reqUrl.pathname === '/api/suggestions') {
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
    return;
  }

  if (reqUrl.pathname === '/api/site-cookies') {
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
    return;
  }

  if (reqUrl.pathname === '/api/clock') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ time: Date.now() }));
    return;
  }

  if (reqUrl.pathname === '/api/status') {
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
    return;
  }

  if (reqUrl.pathname === '/resource') {
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
    return;
  }

  if (reqUrl.pathname === '/view') {
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
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Connection Timed Out</title>
          <meta name="atlas-error-page" content="connection">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
              outline: none;
              font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif !important;
            }
            body {
              background-color: var(--bg, #141414);
              background-image:
                linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px);
              background-size: 38px 38px;
              color: #ffffff;
              padding: 24px;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              overflow: hidden;
            }
            .error-content {
              max-width: 540px;
              width: 100%;
              text-align: center;
              animation: fadeIn 0.2s ease-out;
              transition: opacity 0.14s ease;
              background: transparent !important;
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
            }
            h2 {
              color: #ffffff;
              margin-bottom: 10px;
              font-size: 24px;
              font-weight: 700;
              letter-spacing: -0.5px;
            }
            .sub-msg {
              color: #9b9fa3;
              font-size: 15px;
              line-height: 1.5;
              margin-bottom: 12px;
            }
            .err-detail {
              font-size: 12.5px;
              color: #73787c;
              line-height: 1.5;
              margin-bottom: 24px;
            }
            .btn {
              background: var(--btn-bg, #363636);
              color: #ffffff;
              border-radius: 9999px;
              padding: 10px 28px;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: background-color 0.18s ease, color 0.18s ease;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              border: none !important;
            }
            .btn:hover {
              background: var(--btn-hover, #464646);
              color: #ffffff;
            }
            @keyframes fadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
            @media (prefers-reduced-motion: reduce) {
              .error-content { animation: none; transition: none; }
            }
          </style>
        </head>
        <body>
          <div class="error-content">
            <h2>Connection Timed Out</h2>
            <p class="sub-msg">Try again later, or check your Wisp Configuration</p>
            <p class="err-detail">${escapeHtml(err.message)}</p>
            <button class="btn" id="retryBtn" onclick="doRetry()">Retry</button>
            <script>
              try {
                var theme = getComputedStyle(window.parent.document.documentElement);
                ['--bg', '--btn-bg', '--btn-hover'].forEach(function(name) {
                  document.documentElement.style.setProperty(name, theme.getPropertyValue(name));
                });
                var newTab = window.parent.document.getElementById('newTabScreen');
                if (newTab) {
                  document.body.style.backgroundImage = newTab.style.backgroundImage;
                  document.body.style.backgroundSize = newTab.style.backgroundSize;
                }
              } catch (_) {}
              window.parent.postMessage({type:"__network_error_page"},"*");
              function doRetry() {
                var btn = document.getElementById("retryBtn");
                if (btn) {
                  btn.textContent = "Retrying...";
                  btn.disabled = true;
                }
                document.querySelector('.error-content').style.opacity = '0';
                setTimeout(function() {
                  if (window.parent !== window) {
                    window.parent.postMessage({ type: "__network_retry_tab" }, "*");
                    return;
                  }
                  try {
                    window.location.reload();
                  } catch(e) {
                    var u = new URL(window.location.href);
                    window.location.replace(u.href);
                  }
                }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 140);
              }
            </script>
          </div>
        </body>
        </html>
      `);
    }
    return;
  }

  try {
    const isAppPage = ['/', '/home', '/apps', '/settings'].includes(reqUrl.pathname);
    if (!isAppPage && !isPublicAtlasFile(reqUrl.pathname)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    const staticRoot = reqUrl.pathname.startsWith('/assets/') ? __dirname : path.join(__dirname, 'public');
    let filePath = path.join(
      staticRoot,
      isAppPage ? 'index.html' : reqUrl.pathname === '/atlas-origin.js' ? '/proxy-origin.js' : reqUrl.pathname
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
      const config = JSON.stringify({
        build: atlasBuild,
        production: deployment.production,
        defaultWisp: (deployment.requestOrigin || reqUrl.origin).replace(/^http/, 'ws') + '/wisp/',
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
