import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

function listen(server) {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

async function freePort() {
  const probe = net.createServer();
  const port = await listen(probe);
  await new Promise(resolve => probe.close(resolve));
  return port;
}

async function ready(port) {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      if ((await fetch(`http://127.0.0.1:${port}/api/status`)).ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Atlas did not start');
}

test('a dropped connection is retried once for reads but never for uploads', { timeout: 60000 }, async () => {
  const hits = { '/flaky': 0, '/upload': 0 };
  const site = http.createServer((request, response) => {
    const path = new URL(request.url, 'http://site.test').pathname;
    hits[path] = (hits[path] || 0) + 1;
    if (hits[path] === 1) return request.socket.destroy();
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end('<!doctype html><title>second try</title>');
  });
  const sitePort = await listen(site);
  const port = await freePort();
  const atlas = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: 'development',
      PORT: String(port),
      HOST: '127.0.0.1',
      ENABLE_IPV4_MIRROR: 'false',
    },
    stdio: 'ignore',
  });
  const view = (path, init) =>
    fetch(`http://127.0.0.1:${port}/view?url=${encodeURIComponent(`http://127.0.0.1:${sitePort}${path}`)}`, init);
  try {
    await ready(port);
    const read = await view('/flaky');
    assert.equal(read.status, 200);
    assert.match(await read.text(), /second try/);
    assert.equal(hits['/flaky'], 2);
    const upload = await view('/upload', { method: 'POST', body: 'payload', redirect: 'manual' });
    const followed =
      upload.status === 307
        ? await fetch(new URL(upload.headers.get('location'), `http://127.0.0.1:${port}`), {
            method: 'POST',
            body: 'payload',
          })
        : upload;
    assert.equal(followed.status, 502);
    assert.equal(hits['/upload'], 1);
  } finally {
    atlas.kill();
    site.close();
  }
});
