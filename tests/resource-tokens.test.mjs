import test from 'node:test';
import assert from 'node:assert/strict';
import { createUrlCodec } from '../server/proxy-url.mjs';
import { createResourceTokens } from '../server/proxy-resource-tokens.mjs';
import { open as openInBrowser } from '../scripts/url-crypto-browser.mjs';
import { rewriteLocations } from '../server/proxy-compat.mjs';

const resource = url => ({ url, wisp: 'ws://relay.example/wisp/', kind: 'resource', blockAds: true, blockFingerprint: true });

test('circular module imports converge on the same encrypted module identities', () => {
  const codec = createUrlCodec(Buffer.alloc(32, 7));
  const seal = createResourceTokens(codec);
  const modules = {
    'https://site.example/a.js': 'import { b } from "./b.js"; export function a() { return b; }',
    'https://site.example/b.js': 'import { a } from "./a.js"; export function b() { return a; }',
  };
  const entry = seal(resource('https://site.example/a.js'), seal.descriptor());
  const pending = [entry], seen = new Set();
  while (pending.length && seen.size < 10) {
    const token = pending.pop();
    if (seen.has(token)) continue;
    seen.add(token);
    const { url } = codec.open(token);
    const output = rewriteLocations(modules[url], specifier =>
      '/resource?token=' + seal(resource(new URL(specifier, url).href), seal.descriptor()), url);
    for (const match of output.matchAll(/\/resource\?token=([^"']+)/g)) pending.push(match[1]);
  }
  assert.equal(seen.size, 2);
  assert.equal(pending.length, 0);
});

test('resource addresses preserve relay and privacy options and authenticate ciphertext', () => {
  const codec = createUrlCodec(Buffer.alloc(32, 7));
  const seal = createResourceTokens(codec);
  const value = resource('https://site.example/api/data');
  const token = seal(value);
  assert.deepEqual(codec.open(token), value);
  for (const change of [{ wisp: 'ws://other.example/' }, { blockAds: false }, { blockFingerprint: false }])
    assert.notEqual(seal({ ...value, ...change }), token);
  const parts = token.split('.');
  parts[4] = (parts[4][0] === 'A' ? 'B' : 'A') + parts[4].slice(1);
  assert.throws(() => codec.open(parts.join('.')), /Invalid/);
});

test('expired addresses refresh and the resource cache stays bounded', () => {
  let time = 1800000000000;
  const now = () => time;
  const codec = createUrlCodec(Buffer.alloc(32, 7), { now });
  const seal = createResourceTokens(codec, { now, limit: 2 });
  const a = resource('https://site.example/a.js');
  const first = seal(a);
  time += 604800000;
  const refreshed = seal(a);
  assert.notEqual(refreshed, first);
  assert.deepEqual(codec.open(refreshed), a);
  seal(resource('https://site.example/b.js'));
  seal(resource('https://site.example/c.js'));
  assert.notEqual(seal(a), refreshed);
});


test('HTML and rewritten dependencies remain decodable by the browser descriptor', () => {
  const codec = createUrlCodec(Buffer.alloc(32, 7));
  const seal = createResourceTokens(codec);
  const descriptor = seal.descriptor();
  const entry = resource('https://site.example/a.js');
  const dependency = resource('https://site.example/b.js');
  assert.deepEqual(openInBrowser(seal(entry, descriptor), descriptor), entry);
  assert.deepEqual(openInBrowser(seal(dependency), descriptor), dependency);
  assert.equal(seal.descriptor(), descriptor);
});
