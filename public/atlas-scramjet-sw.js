importScripts('/vendor/scramjet/scramjet.all.js');
const { ScramjetServiceWorker } = $scramjetLoadWorker();
const engine = new ScramjetServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('message', event => {
  if (event.data?.type !== 'atlas-reload-cookies') return;
  event.waitUntil(
    new Promise(resolve => {
      const request = indexedDB.open('$scramjet');
      request.onupgradeneeded = () => request.transaction.abort();
      request.onerror = () => resolve();
      request.onsuccess = () => {
        const db = request.result;
        try {
          const read = db.transaction('cookies').objectStore('cookies').get('cookies');
          read.onsuccess = () => {
            engine.cookieStore.load(JSON.stringify(read.result || {}));
            resolve();
          };
          read.onerror = () => resolve();
        } catch {
          resolve();
        } finally {
          db.close();
        }
      };
    })
  );
});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith(
    (async () => {
      await engine.loadConfig();
      let request = event.request;
      if (request.referrer && !request.referrer.startsWith(self.location.origin + '/engine/scramjet/')) {
        request = new Request(request, { referrer: '' });
        for (const name of ['destination', 'mode'])
          Object.defineProperty(request, name, { value: event.request[name] });
      }
      const response = await (engine.route(event)
        ? engine.fetch({ request, clientId: event.clientId })
        : fetch(event.request));
      const headers = new Headers(response.headers);
      headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
      headers.set('Cross-Origin-Resource-Policy', 'same-origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    })()
  );
});
