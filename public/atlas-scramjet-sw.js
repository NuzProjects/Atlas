importScripts('/vendor/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const engine = new ScramjetServiceWorker();
let savedCookies = engine.cookieStore.dump();

function withCookieStore(mode, use) {
  return new Promise(resolve => {
    const request = indexedDB.open('$scramjet');
    request.onupgradeneeded = () => request.transaction.abort();
    request.onerror = () => resolve();
    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction('cookies', mode);
        use(transaction.objectStore('cookies'), resolve);
        transaction.oncomplete = transaction.onerror = transaction.onabort = () => resolve();
      } catch {
        resolve();
      } finally {
        db.close();
      }
    };
  });
}

const appPages = new Set(['/', '/home', '/apps', '/settings']);
let pendingJar = null;

function isAppClient(client) {
  try {
    const url = new URL(client.url);
    return url.origin === self.location.origin && appPages.has(url.pathname);
  } catch {
    return false;
  }
}

function appClients() {
  return Promise.resolve()
    .then(() => self.clients.matchAll({ includeUncontrolled: true, type: 'window' }))
    .then(clients => clients.filter(isAppClient))
    .catch(() => []);
}

function broadcastCookies(cookies) {
  appClients().then(clients => clients.forEach(client => client.postMessage({ type: 'atlas-cookies', data: cookies })));
}

function jarIsEmpty() {
  return !Object.keys(JSON.parse(engine.cookieStore.dump() || '{}')).length;
}

function applyJar(data) {
  engine.cookieStore.load(data);
  savedCookies = engine.cookieStore.dump();
}

function requestJar() {
  return appClients().then(
    clients =>
      new Promise(resolve => {
        if (!clients.length) return resolve();
        pendingJar = resolve;
        setTimeout(resolve, 600);
        clients.forEach(client => client.postMessage({ type: 'atlas-request-cookies' }));
      })
  );
}

function loadCookies() {
  return withCookieStore('readonly', store => {
    const read = store.get('cookies');
    read.onsuccess = () => {
      engine.cookieStore.load(JSON.stringify(read.result || {}));
      savedCookies = engine.cookieStore.dump();
    };
  }).then(() => (jarIsEmpty() ? requestJar() : undefined));
}

function saveCookies() {
  const cookies = engine.cookieStore.dump();
  if (cookies === savedCookies) return;
  savedCookies = cookies;
  broadcastCookies(cookies);
  return withCookieStore('readwrite', store => store.put(JSON.parse(cookies), 'cookies'));
}

let cookiesReady = loadCookies();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('message', event => {
  const message = event.data;
  if (message?.type !== 'atlas-reload-cookies') return;
  if (typeof message.data === 'string') {
    if (!isAppClient(event.source)) return;
    applyJar(message.data);
    if (pendingJar) pendingJar();
    pendingJar = null;
    event.source.postMessage({ type: 'atlas-cookies-loaded' });
    return;
  }
  if (message.data === null) {
    if (pendingJar) pendingJar();
    pendingJar = null;
    return;
  }
  cookiesReady = loadCookies().then(() => broadcastCookies(savedCookies));
  event.waitUntil(cookiesReady);
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith(
    (async () => {
      await Promise.all([engine.loadConfig(), cookiesReady]);
      let request = event.request;
      if (request.referrer && !request.referrer.startsWith(self.location.origin + '/engine/scramjet/')) {
        request = new Request(request, { referrer: '' });
        for (const name of ['destination', 'mode'])
          Object.defineProperty(request, name, { value: event.request[name] });
      }
      const routed = engine.route(event);
      const response = await (routed ? engine.fetch({ request, clientId: event.clientId }) : fetch(event.request));
      if (routed) event.waitUntil(Promise.resolve(saveCookies()));
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    })()
  );
});
