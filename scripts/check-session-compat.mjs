// Run from a checkout with Playwright installed, or set ATLAS_PLAYWRIGHT_MODULE to its module path.
// BROWSER=firefox selects Firefox; Chromium uses the installed system browser.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocketServer } from 'ws';
const playwright = await import(process.env.ATLAS_PLAYWRIGHT_MODULE || 'playwright');
const browserType = playwright[process.env.BROWSER || 'chromium'];
const scratch = await mkdtemp(path.join(tmpdir(), 'atlas-session-'));
const fixture = http.createServer((req, res) => {
  const authenticated = (req.headers.cookie || '').includes('server=retained');
  if (req.url.startsWith('/echo')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ authenticated, clientCookie: (req.headers.cookie || '').includes('client=retained') }));
  } else if (req.url.startsWith('/events')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.end(
      'retry: 50\nid: 1\ndata: ' +
        JSON.stringify({ authenticated, resumed: req.headers['last-event-id'] === '1' }) +
        '\n\n'
    );
  } else {
    if (req.url.includes('seed')) res.setHeader('Set-Cookie', 'server=retained; Path=/; Max-Age=86400; HttpOnly');
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><title>Atlas session fixture</title><h1>Atlas session fixture</h1>');
  }
});
const sockets = new WebSocketServer({ server: fixture });
sockets.on('connection', (socket, req) =>
  socket.send(JSON.stringify({ authenticated: (req.headers.cookie || '').includes('server=retained') }))
);
await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve));
const fixtureOrigin = 'http://127.0.0.1:' + fixture.address().port;
const reserve = http.createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const appPort = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const appOrigin = 'http://127.0.0.1:' + appPort;
const app = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(appPort),
    HOST: '127.0.0.1',
    NODE_ENV: 'development',
    WISP_ALLOW_PRIVATE_IPS: 'true',
  },
  stdio: ['ignore', 'ignore', 'pipe'],
});
let context;
const storage = async (frame, write = false) =>
  frame.evaluate(async write => {
    if (write) {
      localStorage.setItem('saved', 'retained');
      sessionStorage.setItem('saved', 'retained');
      document.cookie = 'client=retained; Path=/; Max-Age=86400';
    }
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('session-fixture', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('saved');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const indexed = await new Promise((resolve, reject) => {
      const transaction = database.transaction('saved', write ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('saved');
      if (write) store.put('retained', 'value');
      const request = store.get('value');
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
    return {
      local: localStorage.getItem('saved'),
      session: sessionStorage.getItem('saved'),
      indexed,
      client: document.cookie.includes('client=retained'),
      httpOnlyHidden: !document.cookie.includes('server='),
      echo: await (await fetch('/echo')).json(),
    };
  }, write);
function verify(saved, session) {
  assert.equal(saved.local, 'retained');
  assert.equal(saved.indexed, 'retained');
  assert.equal(saved.client, true);
  assert.equal(saved.httpOnlyHidden, true);
  assert.equal(saved.echo.authenticated, true);
  assert.equal(saved.echo.clientCookie, true);
  if (session) assert.equal(saved.session, 'retained');
}
async function launch(profile, mode, seed) {
  context = await browserType.launchPersistentContext(
    profile,
    process.env.BROWSER === 'firefox'
      ? {}
      : process.env.ATLAS_BROWSER_EXECUTABLE
        ? { executablePath: process.env.ATLAS_BROWSER_EXECUTABLE }
        : process.platform === 'linux'
          ? { executablePath: '/usr/bin/chromium' }
          : { channel: 'chrome' }
  );
  // The launcher's redirect is unrelated to this local regression.
  await context.route('https://www.google.com/**', route =>
    route.fulfill({ body: '<title>Launcher destination</title>' })
  );
  const page = context.pages()[0] || (await context.newPage());
  const target = fixtureOrigin + '/page' + (seed ? '?seed=1' : '');
  await page.goto(appOrigin + '/home');
  let owner = page.mainFrame();
  if (mode === 'blank') {
    const opened = context.waitForEvent('page');
    await page.evaluate(() => {
      void openAtlasBlank();
    });
    const popup = await opened;
    await popup.frameLocator('#atlasBlankApp').locator('#homeSearchInput').waitFor();
    owner = await (await popup.locator('#atlasBlankApp').elementHandle()).contentFrame();
    await owner.waitForFunction(() => typeof navigateActiveTab === 'function', {}, { timeout: 30000 });
  }
  if (mode === 'native') {
    await page.goto(appOrigin + '/view?url=' + encodeURIComponent(target));
    return { frame: page.mainFrame(), owner: page.mainFrame(), page };
  }
  await owner.evaluate(
    ({ mode, target }) => {
      localStorage.setItem('setting_proxy_engine', mode === 'blank' ? 'scramjet' : mode);
      navigateActiveTab(target);
    },
    { mode, target }
  );
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    for (const frame of owner.page().frames()) {
      if (frame === owner || frame === owner.page().mainFrame()) continue;
      try {
        if ((await frame.title()) === 'Atlas session fixture') return { frame, owner, page };
      } catch {}
    }
    await page.waitForTimeout(100);
  }
  throw Error('Fixture did not load: ' + mode);
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(appOrigin + '/api/status')).ok) {
        ready = true;
        break;
      }
    } catch {}
    if (app.exitCode !== null) throw Error('Test server exited before readiness');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Test server readiness');
  for (const mode of ['native', 'scramjet', 'ultraviolet', 'blank']) {
    const profile = path.join(scratch, mode);
    const loaded = await launch(profile, mode, true);
    verify(await storage(loaded.frame, true), true);
    await Promise.all([
      loaded.frame.waitForNavigation({ waitUntil: 'load' }),
      loaded.frame.evaluate(() => location.reload()),
    ]);
    verify(await storage(loaded.frame), true);
    if (mode === 'native') {
      const live = await loaded.frame.evaluate(async () => {
        const socket = await new Promise((resolve, reject) => {
          const ws = new WebSocket('/live');
          const timer = setTimeout(() => {
            ws.close();
            reject(Error('Socket timeout'));
          }, 8000);
          ws.onmessage = event => {
            clearTimeout(timer);
            ws.close();
            resolve(JSON.parse(event.data));
          };
          ws.onerror = () => {
            clearTimeout(timer);
            reject(Error('Socket failed'));
          };
        });
        const events = await new Promise((resolve, reject) => {
          const source = new EventSource('/events', { withCredentials: true });
          const timer = setTimeout(() => {
            source.close();
            reject(Error('EventSource reconnect timeout'));
          }, 8000);
          source.onmessage = event => {
            const value = JSON.parse(event.data);
            if (value.resumed) {
              clearTimeout(timer);
              source.close();
              resolve(value);
            }
          };
        });
        return { socket, events };
      });
      assert.equal(live.socket.authenticated, true);
      assert.equal(live.events.authenticated, true);
      assert.equal(live.events.resumed, true);
      console.log('Native authenticated WebSocket and EventSource reconnect passed.');
    }
    await context.close();
    context = null;
    const reopened = await launch(profile, mode, false);
    verify(await storage(reopened.frame), false);
    await context.close();
    context = null;
    console.log(mode + ': cookies, localStorage and IndexedDB survived reload and browser restart.');
  }
} finally {
  await context?.close();
  app.kill();
  if (app.exitCode === null) await new Promise(resolve => app.once('exit', resolve));
  sockets.close();
  fixture.closeAllConnections();
  await new Promise(resolve => fixture.close(resolve));
  await rm(scratch, { recursive: true, force: true });
}
