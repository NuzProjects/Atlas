import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/atlas-scramjet-sw.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

class CookieStore {
  cookies = {};
  load(cookies) {
    if (typeof cookies === 'object') return cookies;
    this.cookies = JSON.parse(cookies);
  }
  dump() {
    return JSON.stringify(this.cookies);
  }
  header() {
    return Object.values(this.cookies)
      .map(cookie => cookie.name + '=' + cookie.value)
      .join('; ');
  }
}

function fakeIndexedDB(stored) {
  return {
    open() {
      const request = {};
      setTimeout(() => {
        if (!stored) return request.onerror?.();
        request.result = {
          close() {},
          transaction() {
            const transaction = {
              objectStore: () => ({
                get(key) {
                  const read = {};
                  setTimeout(() => {
                    read.result = stored[key] && structuredClone(stored[key]);
                    read.onsuccess?.();
                    transaction.oncomplete?.();
                  });
                  return read;
                },
                put(value, key) {
                  stored[key] = structuredClone(value);
                  setTimeout(() => transaction.oncomplete?.());
                },
              }),
            };
            return transaction;
          },
        };
        request.onsuccess();
      });
      return request;
    },
  };
}

function startWorker(stored, respond) {
  const listeners = {};
  const engine = {
    cookieStore: new CookieStore(),
    loadConfig: async () => {},
    route: () => true,
    fetch: async ({ request }) => respond(engine, request),
  };
  const self = {
    location: { origin: 'https://atlas.example' },
    addEventListener: (type, listener) => (listeners[type] = listener),
    clients: { claim: async () => {} },
    skipWaiting() {},
  };
  vm.runInNewContext(source, {
    self,
    importScripts() {},
    $scramjetLoadWorker: () => ({
      ScramjetServiceWorker: function () {
        return engine;
      },
    }),
    indexedDB: fakeIndexedDB(stored),
    Headers,
    Response,
    Request,
    Promise,
    JSON,
    Object,
  });
  const pending = [];
  const fetch = url =>
    new Promise(resolve => {
      listeners.fetch({
        request: new Request(url),
        clientId: 'client',
        respondWith: response => resolve(response),
        waitUntil: promise => pending.push(promise),
      });
    }).then(async response => {
      await Promise.all(pending);
      return response;
    });
  const message = data =>
    new Promise(resolve => listeners.message({ data, waitUntil: promise => promise.then(resolve) }));
  return { engine, fetch, message };
}

const sessionJar = { '.site.example@/@session': { name: 'session', value: 'abc', domain: '.site.example', path: '/' } };

test('a restarted worker sends the saved session cookie on its first request', async () => {
  const stored = { cookies: structuredClone(sessionJar) };
  const worker = startWorker(stored, engine => new Response(engine.cookieStore.header() || 'none'));
  const response = await worker.fetch('https://atlas.example/engine/scramjet/https%3A%2F%2Fsite.example%2F');
  assert.equal(await response.text(), 'session=abc');
});

test('cookies a site sets in a response are saved for the next worker', async () => {
  const stored = { cookies: {} };
  const worker = startWorker(stored, engine => {
    engine.cookieStore.cookies['.site.example@/@session'] = sessionJar['.site.example@/@session'];
    return new Response('ok');
  });
  await worker.fetch('https://atlas.example/engine/scramjet/https%3A%2F%2Fsite.example%2Flogin');
  assert.deepEqual(stored.cookies, sessionJar);
});

test('a new cookie keeps the cookies saved by an earlier worker', async () => {
  const stored = { cookies: structuredClone(sessionJar) };
  const worker = startWorker(stored, engine => {
    engine.cookieStore.cookies['.site.example@/@pref'] = {
      name: 'pref',
      value: 'dark',
      domain: '.site.example',
      path: '/',
    };
    return new Response('ok');
  });
  await worker.fetch('https://atlas.example/engine/scramjet/https%3A%2F%2Fsite.example%2Fpref');
  assert.deepEqual(Object.keys(stored.cookies).sort(), ['.site.example@/@pref', '.site.example@/@session']);
});

test('Site Data clearing reloads the jar so deleted cookies stop being sent', async () => {
  const stored = { cookies: structuredClone(sessionJar) };
  const worker = startWorker(stored, engine => new Response(engine.cookieStore.header() || 'none'));
  const url = 'https://atlas.example/engine/scramjet/https%3A%2F%2Fsite.example%2F';
  assert.equal(await (await worker.fetch(url)).text(), 'session=abc');
  stored.cookies = {};
  await worker.message({ type: 'atlas-reload-cookies' });
  assert.equal(await (await worker.fetch(url)).text(), 'none');
});

test('a worker with no saved data starts with an empty jar', async () => {
  const worker = startWorker(null, engine => new Response(engine.cookieStore.header() || 'none'));
  await tick();
  assert.equal(await (await worker.fetch('https://atlas.example/engine/scramjet/x')).text(), 'none');
});

test('engine pages keep the Atlas opener policy so sign-in pop-ups can reach their opener', async () => {
  const worker = startWorker({ cookies: {} }, () => new Response('ok'));
  const response = await worker.fetch('https://atlas.example/engine/scramjet/x');
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
});

test('Ultraviolet pages keep the Atlas opener policy too', async () => {
  const uv = await readFile(new URL('../public/atlas-ultraviolet-sw.js', import.meta.url), 'utf8');
  const listeners = {};
  vm.runInNewContext(uv, {
    self: {
      location: { origin: 'https://atlas.example' },
      addEventListener: (t, l) => (listeners[t] = l),
      clients: { claim: async () => {} },
      skipWaiting() {},
    },
    importScripts() {},
    UVServiceWorker: function () {
      return { route: () => true, fetch: async () => new Response('ok') };
    },
    Headers,
    Response,
    Request,
    Object,
  });
  const response = await new Promise(resolve =>
    listeners.fetch({
      request: new Request('https://atlas.example/engine/ultraviolet/x'),
      clientId: 'c',
      respondWith: resolve,
    })
  );
  assert.equal(response.headers.get('Cross-Origin-Opener-Policy'), 'same-origin');
});
