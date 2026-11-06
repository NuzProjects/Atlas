(function (root) {
  const compoundSuffixes = new Set(['ac', 'co', 'com', 'edu', 'gov', 'ne', 'net', 'or', 'org']);

  function siteOf(host) {
    const name = String(host || '')
      .toLowerCase()
      .replace(/^\./, '')
      .replace(/:\d+$/, '');
    if (!name || /^[\d.]+$/.test(name) || name.includes(':')) return name;
    const labels = name.split('.');
    if (labels.length <= 2) return name;
    const last = labels[labels.length - 1];
    const second = labels[labels.length - 2];
    return labels.slice(last.length === 2 && compoundSuffixes.has(second) ? -3 : -2).join('.');
  }

  function hostOfOrigin(origin) {
    try {
      const url = new URL(origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.host : '';
    } catch {
      return '';
    }
  }

  function bare(host) {
    return String(host || '')
      .toLowerCase()
      .replace(/:\d+$/, '');
  }

  function cookieHost(domain) {
    return String(domain || '')
      .toLowerCase()
      .replace(/^\./, '');
  }

  function builtInPrefix(origin) {
    return 'atlas_' + root.AtlasProxyOrigin.hash(origin).slice(0, 32) + '_';
  }

  function classifyStorageKey(key, builtIn) {
    const uv = /^__uv\$(https?:\/\/[^@/]+)@/.exec(key);
    if (uv) return hostOfOrigin(uv[1]);
    for (const [prefix, host] of builtIn) if (key.startsWith(prefix)) return host;
    if (/^atlas_|^setting_|^__/.test(key)) return '';
    const scramjet = /^([a-z0-9.-]+\.[a-z0-9-]+(?::\d+)?)@/i.exec(key);
    return scramjet ? scramjet[1].toLowerCase() : '';
  }

  function classifyDatabase(name, builtIn) {
    const engine = /^(https?:\/\/[^@/]+)@/.exec(name);
    if (engine) return hostOfOrigin(engine[1]);
    for (const [prefix, host] of builtIn) if (name.startsWith(prefix)) return host;
    return '';
  }

  function openExisting(name) {
    return new Promise(resolve => {
      let request;
      try {
        request = root.indexedDB.open(name);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => request.transaction.abort();
      request.onsuccess = () => resolve(request.result);
      request.onerror = event => {
        event.preventDefault();
        resolve(null);
      };
      request.onblocked = () => resolve(null);
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore(database, store, mode, task) {
    const db = await openExisting(database);
    if (!db) return null;
    try {
      if (!db.objectStoreNames.contains(store)) return null;
      const transaction = db.transaction(store, mode);
      const result = await task(transaction.objectStore(store));
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      return result;
    } finally {
      db.close();
    }
  }

  function storages() {
    const result = [];
    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        if (root[name]) result.push(root[name]);
      } catch {}
    }
    return result;
  }

  async function databaseNames() {
    try {
      return typeof root.indexedDB?.databases === 'function'
        ? (await root.indexedDB.databases()).map(db => db.name).filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  function candidateOrigins(pageUrl) {
    const url = new URL(pageUrl);
    return [...new Set([url.origin, 'https://' + url.host, 'http://' + url.host])];
  }

  async function builtInCookieCount(origins) {
    try {
      const query = origins.map(origin => 'origin=' + encodeURIComponent(origin)).join('&');
      const response = await fetch('/api/site-cookies?' + query, { cache: 'no-store' });
      if (!response.ok) return 0;
      return Number((await response.json()).count) || 0;
    } catch {
      return 0;
    }
  }

  async function collect(pageUrl) {
    const url = new URL(pageUrl);
    const site = siteOf(url.host);
    const origins = candidateOrigins(pageUrl);
    const builtIn = origins.map(origin => [builtInPrefix(origin), url.hostname]);
    const hosts = new Map();
    const entry = host => {
      const key = bare(host);
      if (!hosts.has(key)) hosts.set(key, { host: key, cookies: 0, items: 0, databases: 0 });
      return hosts.get(key);
    };
    const belongs = host => host && siteOf(host) === site;

    const scramjet = await withStore('$scramjet', 'cookies', 'readonly', store =>
      requestResult(store.get('cookies'))
    ).catch(() => null);
    for (const cookie of Object.values(scramjet || {})) {
      const host = cookieHost(cookie?.domain);
      if (belongs(host)) entry(host).cookies++;
    }

    const ultraviolet = await withStore('__op', 'cookies', 'readonly', store => requestResult(store.getAll())).catch(
      () => null
    );
    for (const cookie of ultraviolet || []) {
      const host = cookieHost(cookie?.domain);
      if (belongs(host)) entry(host).cookies++;
    }

    const legacyCookies = await builtInCookieCount(origins);
    if (legacyCookies) entry(url.hostname).cookies += legacyCookies;

    for (const storage of storages()) {
      for (const key of Object.keys(storage)) {
        const host = classifyStorageKey(key, builtIn);
        if (belongs(host)) entry(host).items++;
      }
    }

    for (const name of await databaseNames()) {
      const host = classifyDatabase(name, builtIn);
      if (belongs(host)) entry(host).databases++;
    }

    return [...hosts.values()]
      .filter(item => item.cookies || item.items || item.databases)
      .sort((a, b) => (a.host === url.hostname ? -1 : b.host === url.hostname ? 1 : a.host.localeCompare(b.host)));
  }

  function deleteDatabase(name) {
    return new Promise(resolve => {
      try {
        const request = root.indexedDB.deleteDatabase(name);
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  async function refreshScramjetWorker() {
    try {
      const registrations = await root.navigator.serviceWorker?.getRegistrations?.();
      for (const registration of registrations || []) {
        const worker = registration.active;
        if (worker && /atlas-scramjet-sw\.js/.test(worker.scriptURL))
          worker.postMessage({ type: 'atlas-reload-cookies' });
      }
    } catch {}
  }

  async function clear(pageUrl, host) {
    const target = bare(host);
    const url = new URL(pageUrl);
    const origins = target === url.hostname ? candidateOrigins(pageUrl) : candidateOrigins('https://' + target);
    const builtIn = origins.map(origin => [builtInPrefix(origin), target]);

    const removedScramjet = await withStore('$scramjet', 'cookies', 'readwrite', async store => {
      const jar = (await requestResult(store.get('cookies'))) || {};
      let removed = 0;
      for (const [id, cookie] of Object.entries(jar)) {
        if (bare(cookieHost(cookie?.domain)) === target) {
          delete jar[id];
          removed++;
        }
      }
      if (removed) store.put(jar, 'cookies');
      return removed;
    }).catch(() => 0);
    if (removedScramjet) await refreshScramjetWorker();

    await withStore('__op', 'cookies', 'readwrite', async store => {
      for (const cookie of (await requestResult(store.getAll())) || []) {
        if (bare(cookieHost(cookie?.domain)) === target) store.delete(cookie.id);
      }
    }).catch(() => {});

    try {
      await fetch('/api/site-cookies?' + origins.map(origin => 'origin=' + encodeURIComponent(origin)).join('&'), {
        method: 'POST',
        cache: 'no-store',
      });
    } catch {}

    for (const storage of storages()) {
      for (const key of Object.keys(storage))
        if (bare(classifyStorageKey(key, builtIn)) === target) storage.removeItem(key);
    }

    await Promise.all(
      (await databaseNames()).filter(name => bare(classifyDatabase(name, builtIn)) === target).map(deleteDatabase)
    );
  }

  root.AtlasSiteData = { siteOf, classifyStorageKey, classifyDatabase, collect, clear };
})(globalThis);
