import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));

const page = bytes =>
  '<!doctype html><title>big</title><body>' +
  Array.from(
    { length: Math.ceil(bytes / 40) },
    (_, index) => `<p>line ${index} ${Math.random().toString(36)}</p>`
  ).join('') +
  '</body>';

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

test('compressed pages do not use up the buffered-response budget', { timeout: 120000 }, async () => {
  const small = page(1.5 * 1024 * 1024);
  const huge = page(5 * 1024 * 1024);
  const encoded = {
    gzip: zlib.gzipSync(small),
    br: zlib.brotliCompressSync(small),
    identity: Buffer.from(small),
  };
  const site = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://site.test');
    if (url.pathname === '/huge') {
      response.writeHead(200, { 'Content-Type': 'text/html' });
      return response.end(huge);
    }
    const encoding = url.pathname.slice(1);
    if (!encoded[encoding]) {
      response.writeHead(404);
      return response.end();
    }
    const headers = { 'Content-Type': 'text/html' };
    if (encoding !== 'identity') headers['Content-Encoding'] = encoding;
    response.writeHead(200, headers);
    response.end(encoded[encoding]);
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
      ATLAS_BUFFER_BUDGET_MB: '3',
    },
    stdio: 'ignore',
  });
  const view = async path => {
    const response = await fetch(
      `http://127.0.0.1:${port}/view?url=${encodeURIComponent(`http://127.0.0.1:${sitePort}${path}`)}`
    );
    return { status: response.status, text: await response.text() };
  };
  try {
    await ready(port);
    for (const encoding of ['gzip', 'br', 'identity'])
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await view('/' + encoding);
        assert.equal(result.status, 200, `${encoding} request ${attempt + 1} was refused`);
      }
    const refused = await view('/huge');
    assert.equal(refused.status, 502);
    assert.match(refused.text, /Atlas is busy/);
    assert.equal((await view('/gzip')).status, 200, 'the budget must recover after a refused response');
  } finally {
    atlas.kill();
    site.close();
  }
});
