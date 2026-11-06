(() => {
  const loaded = new Map();
  const nativePostMessage = window.postMessage;
  let connection, controller, controllerReady, lastRelay;
  const loadScript = (url, attempt = 0) =>
    new Promise((resolve, reject) => {
      const script = document.createElement('script');
      const timer = setTimeout(failed, 15000);
      function failed() {
        clearTimeout(timer);
        script.onload = script.onerror = null;
        script.remove();
        if (attempt === 0) {
          loadScript(url, 1).then(resolve, reject);
          return;
        }
        reject(Error('Could not load proxy engine file ' + url + '. Retry this tab or reload Atlas.'));
      }
      script.src = url;
      script.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      script.onerror = failed;
      document.head.append(script);
    });
  const scripts = url => {
    if (!loaded.has(url))
      loaded.set(
        url,
        loadScript(url).catch(error => {
          loaded.delete(url);
          throw error;
        })
      );
    return loaded.get(url);
  };
  const selected = () =>
    ['scramjet', 'ultraviolet'].includes(localStorage.getItem('setting_proxy_engine'))
      ? localStorage.getItem('setting_proxy_engine')
      : 'scramjet';
  const effective = () => (window.__atlasConfig.proxyOriginTemplate ? 'atlas' : selected());
  let transportQueue = Promise.resolve();
  async function prepare(engine, relay) {
    if (!navigator.serviceWorker || !window.isSecureContext) throw Error('This proxy engine needs HTTPS or localhost.');
    await scripts('/vendor/baremux/index.js');
    await scripts('/atlas-engine-config.js');
    if (!connection) connection = new BareMux.BareMuxConnection('/vendor/baremux/worker.js');
    transportQueue = transportQueue
      .catch(() => {})
      .then(async () => {
        const normalized = new URL(relay, location.href);
        if (!['ws:', 'wss:'].includes(normalized.protocol) || normalized.username || normalized.password)
          throw Error('Invalid Wisp address.');
        if (!normalized.pathname.endsWith('/')) normalized.pathname += '/';
        if (lastRelay !== normalized.href) {
          await connection.setTransport('/vendor/epoxy/index.mjs', [{ wisp: normalized.href }]);
          lastRelay = normalized.href;
        }
      });
    await transportQueue;
    if (engine === 'scramjet' && !controllerReady) {
      controllerReady = (async () => {
        await scripts('/vendor/scramjet/scramjet.all.js');
        const { ScramjetController } = $scramjetLoadController();
        const candidate = new ScramjetController({
          prefix: '/engine/scramjet/',
          files: {
            wasm: '/vendor/scramjet/scramjet.wasm.wasm',
            all: '/vendor/scramjet/scramjet.all.js',
            sync: '/vendor/scramjet/scramjet.sync.js',
          },
          codec: { ...AtlasEngineConfig.codec },
          flags: { syncxhr: crossOriginIsolated },
        });
        await candidate.init();
        controller = candidate;
      })().catch(error => {
        controllerReady = undefined;
        throw error;
      });
    }
    if (engine === 'scramjet') await controllerReady;
    if (engine === 'ultraviolet') await scripts('/vendor/ultraviolet/uv.bundle.js');
    const registration = await navigator.serviceWorker.register('/atlas-' + engine + '-sw.js', {
      scope: '/engine/' + engine + '/',
    });
    const worker = registration.installing || registration.waiting || registration.active;
    if (worker?.state !== 'activated')
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(Error('Proxy engine activation timed out.')), 15000);
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') {
            clearTimeout(timer);
            resolve();
          } else if (worker.state === 'redundant') {
            clearTimeout(timer);
            reject(Error('Proxy engine activation failed.'));
          }
        });
      });
  }
  async function navigate(tab, target, nativeAddress, relay) {
    const engine = effective(),
      generation = (tab.engineGeneration || 0) + 1;
    tab.engineGeneration = generation;
    tab.proxyEngine = engine;
    const wasFallback = !!tab.engineFallback;
    tab.engineFallback = null;
    if (wasFallback && tab.id === activeTabId) updateSiteInfo();
    if (engine === 'atlas') {
      tab.iframe.src = nativeAddress;
      return;
    }
    try {
      await prepare(engine, relay);
      if (tab.isClosing || generation !== tab.engineGeneration) return;
      if (engine === 'scramjet') {
        if (!tab.scramjetFrame) {
          tab.scramjetFrame = controller.createFrame(tab.iframe);
          tab.scramjetFrame.addEventListener('urlchange', event => {
            if (tab.proxyEngine !== 'scramjet' || tab.isClosing) return;
            try {
              const url = new URL(event.url);
              if (!['http:', 'https:'].includes(url.protocol)) return;
              tab.url = url.href;
              atlasRememberNavigation(tab, tab.url, tab.navigationLoading);
              if (tab.id === activeTabId) bottomAddressBar.value = tab.url;
              renderTabs();
            } catch {}
          });
        }
        tab.scramjetFrame.go(target);
      } else tab.iframe.src = '/engine/' + engine + '/' + AtlasEngineConfig.codec.encode(target);
    } catch (error) {
      if (tab.isClosing || generation !== tab.engineGeneration) return;
      let fallback;
      try {
        const origin = window.__atlasConfig.publicOrigin || location.origin;
        const address = new URL(nativeAddress, origin);
        if (address.origin === origin && address.pathname === '/view' && address.searchParams.has('token'))
          fallback = address.href;
      } catch {}
      if (fallback) {
        tab.engineFallback = { requested: engine, reason: error.message };
        tab.proxyEngine = 'atlas';
        tab.iframe.src = fallback;
        if (tab.id === activeTabId) updateSiteInfo();
        return;
      }
      tab.isLoading = false;
      const doc = tab.iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(
          '<!doctype html><meta name="atlas-error-page" content="true"><title>Proxy Engine Unavailable</title><body style="background:#131413;color:#eee;font:16px system-ui;padding:32px"><h1>Proxy Engine Unavailable</h1><p id="error"></p><p>Reload this tab to retry. If the engine file remains unavailable, reload Atlas or check the server installation.</p>'
        );
        doc.close();
        doc.getElementById('error').textContent = error.message;
      }
      if (tab.id === activeTabId) hideLoader();
    }
  }
  function metadata(frame) {
    try {
      const address = new URL(frame.contentWindow.location.href);
      if (!/^\/engine\/(scramjet|ultraviolet)\//.test(address.pathname)) return null;
      const target = new URL(
        AtlasEngineConfig.codec.decode(address.pathname.replace(/^\/engine\/[^/]+\//, '') + address.search)
      );
      if (address.hash) {
        const hash = address.hash.slice(1);
        target.hash = hash.startsWith('1.') ? AtlasEngineConfig.codec.decode(hash) : hash;
      }
      const url = target.href;
      const document = frame.contentDocument;
      document.documentElement.dataset.atlasUrl = url;
      let icon = document.querySelector('link[rel~="icon"]')?.getAttribute('href');
      if (icon) {
        const resolved = new URL(icon, address);
        icon = /^\/engine\/(scramjet|ultraviolet)\//.test(resolved.pathname)
          ? AtlasEngineConfig.codec.decode(resolved.pathname.replace(/^\/engine\/[^/]+\//, ''))
          : new URL(icon, url).href;
      }
      return { url, title: document.title, icon: icon || new URL('/favicon.ico', url).href };
    } catch {
      return null;
    }
  }
  function post(frame, data, origin) {
    Reflect.apply(nativePostMessage, frame.contentWindow, [data, origin]);
  }
  window.AtlasEngines = { selected, effective, navigate, metadata, post };
})();
