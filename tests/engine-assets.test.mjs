import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createProxyEngines, matchesEtag } from '../server/proxy-engines.mjs';
import { createUrlCodec } from '../server/proxy-url.mjs';

const dist = {
  '@mercuryworkshop/scramjet': ['scramjet.all.js', 'scramjet.sync.js', 'scramjet.wasm.wasm'],
  '@titaniumnetwork-dev/ultraviolet': ['uv.bundle.js', 'uv.client.js', 'uv.handler.js', 'uv.sw.js'],
  '@mercuryworkshop/bare-mux': ['index.js', 'worker.js'],
  '@mercuryworkshop/epoxy-transport': ['index.mjs'],
};

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-engines-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [pkg, names] of Object.entries(dist)) {
    await fs.mkdir(path.join(root, 'node_modules', pkg, 'dist'), { recursive: true });
    for (const name of names) await fs.writeFile(path.join(root, 'node_modules', pkg, 'dist', name), 'body of ' + name);
  }
  await fs.mkdir(path.join(root, 'public'), { recursive: true });
  await fs.writeFile(path.join(root, 'public', 'atlas-url-crypto.js'), 'crypto prefix');
  await fs.mkdir(path.join(root, '.cache'), { recursive: true });
  const handle = await createProxyEngines(root, createUrlCodec(Buffer.alloc(32, 3)));
  return {
    root,
    async get(pathname, headers = {}) {
      const response = { status: null, headers: null, body: '' };
      const res = {
        writeHead: (status, values) => Object.assign(response, { status, headers: values }),
        write: chunk => (response.body += chunk),
        end: chunk => (response.body += chunk ?? ''),
      };
      response.handled = await handle({ headers }, res, new URL('https://atlas.example' + pathname));
      return response;
    },
  };
}

test('engine files are served with a validator and answer conditional requests without a body', async t => {
  const site = await fixture(t);
  const first = await site.get('/vendor/scramjet/scramjet.all.js');
  assert.equal(first.status, 200);
  assert.equal(first.body, 'crypto prefix\nbody of scramjet.all.js');
  assert.match(first.headers.ETag, /^"[A-Za-z0-9_-]{27}"$/);
  const again = await site.get('/vendor/scramjet/scramjet.all.js', { 'if-none-match': first.headers.ETag });
  assert.equal(again.status, 304);
  assert.equal(again.body, '');
  assert.equal(again.headers.ETag, first.headers.ETag);
  assert.equal(again.headers['Cache-Control'], 'public, max-age=3600');
  assert.equal(again.headers['Cross-Origin-Resource-Policy'], 'same-origin');
});

test('the validator changes when the engine file or the injected prefix changes', async t => {
  const site = await fixture(t);
  const wasm = await site.get('/vendor/scramjet/scramjet.wasm.wasm');
  assert.equal(wasm.headers['Content-Type'], 'application/wasm');
  const before = await site.get('/vendor/scramjet/scramjet.all.js');
  await fs.writeFile(path.join(site.root, 'public', 'atlas-url-crypto.js'), 'a different crypto prefix');
  const afterPrefix = await site.get('/vendor/scramjet/scramjet.all.js', { 'if-none-match': before.headers.ETag });
  assert.equal(afterPrefix.status, 200);
  assert.notEqual(afterPrefix.headers.ETag, before.headers.ETag);
  const dir = path.join(site.root, 'node_modules', '@mercuryworkshop', 'scramjet', 'dist');
  await fs.writeFile(path.join(dir, 'scramjet.sync.js'), 'new sync worker');
  const sync = await site.get('/vendor/scramjet/scramjet.sync.js');
  assert.equal(sync.body, 'new sync worker');
});

test('validators survive weak and compression-suffixed forms added by a proxy in front', () => {
  const etag = '"abc123"';
  assert.ok(matchesEtag('"abc123"', etag));
  assert.ok(matchesEtag('W/"abc123"', etag));
  assert.ok(matchesEtag('"abc123-gzip"', etag));
  assert.ok(matchesEtag('"other", W/"abc123-zstd"', etag));
  assert.ok(matchesEtag('*', etag));
  assert.ok(!matchesEtag('"nope"', etag));
  assert.ok(!matchesEtag(undefined, etag));
});

test('paths outside the engine file list are left to the app', async t => {
  const site = await fixture(t);
  assert.equal((await site.get('/vendor/scramjet/unknown.js')).handled, false);
  assert.equal((await site.get('/vendor/other/scramjet.all.js')).handled, false);
});
