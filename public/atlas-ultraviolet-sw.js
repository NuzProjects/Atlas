importScripts('/vendor/ultraviolet/uv.bundle.js', '/atlas-engine-config.js', '/vendor/ultraviolet/uv.sw.js');
const engine = new UVServiceWorker();
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', event => {
  event.respondWith(
    (async () => {
      let request = event.request;
      if (request.referrer && !request.referrer.startsWith(self.location.origin + '/engine/ultraviolet/')) {
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
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    })()
  );
});
