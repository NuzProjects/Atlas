import { escapeHtml } from './proxy-security.mjs';
import { isAdOrTracker } from './proxy-trackers.mjs';
import { installLiveRequests } from './proxy-live-requests.mjs';
import { installDocumentAddress } from './proxy-document.mjs';

export function createProxyBootstrap({ deployment, contentFilterScript }) {
  const connectionErrorPage = message => `
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
            <p class="err-detail">${escapeHtml(message)}</p>
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
      `;

  function buildProxyStyle(blockAds) {
    return `
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
  }

  function buildContentFilterBootstrap(targetUrl) {
    return `<script>${contentFilterScript}
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
  }

  function buildMetadataBootstrap(targetUrl, metadataMarkup) {
    return `<script id="__atlas_initial_metadata">(function(){try{
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
  }

  function buildInterceptScript({ targetUrl, wispUrl, proxyDescriptor, blockAds, blockFingerprint, baseMarkup }) {
    return `
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
    (${installLiveRequests.toString()})(window, targetUrl, function(url) { return toProxy(url, false); }, function(url) {
      return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/atlas-websocket?token=' + AtlasUrlCrypto.seal({url:url,source:targetUrl,kind:'socket'},proxyDescriptor);
    });

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
  }

  return {
    buildContentFilterBootstrap,
    buildMetadataBootstrap,
    buildProxyStyle,
    buildInterceptScript,
    connectionErrorPage,
  };
}
