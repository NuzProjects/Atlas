import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { isPublicAtlasFile } from '../../server/config/deployment-config.mjs';

const source = await readFile(new URL('../../public/js/proxy/atlas-blank-storage.js', import.meta.url), 'utf8');
const context = {
  Object,
  JSON,
  Math,
  Uint8Array,
  ArrayBuffer,
  Map,
  Set,
  Promise,
  setTimeout,
  clearTimeout,
  setInterval,
};
vm.runInNewContext(`${source};globalThis.__exported=AtlasBlankStorage;`, context);
const storage = context.__exported;

test('the about:blank mirror covers site data and cookies but not engine settings', () => {
  assert.equal(storage.plan('https://example.com@saves'), true);
  assert.equal(storage.plan('http://127.0.0.1:9556@kv'), true);
  assert.equal(storage.plan('atlas_' + 'a'.repeat(32) + '_games'), true);
  assert.deepEqual(Array.from(storage.plan('$scramjet')), ['cookies']);
  assert.deepEqual(Array.from(storage.plan('__op')), ['cookies']);
  assert.equal(storage.plan('bare-mux'), null);
  assert.equal(storage.plan('atlas_settings'), null);
});

test('a changed record changes the database signature, an identical one does not', () => {
  const snap = value => ({ version: 1, stores: [{ name: 'kv', records: [['slot', value]] }] });
  assert.equal(storage.signature(snap({ gold: 1 })), storage.signature(snap({ gold: 1 })));
  assert.notEqual(storage.signature(snap({ gold: 1 })), storage.signature(snap({ gold: 2 })));
  assert.notEqual(
    storage.signature(snap(new Uint8Array([1, 2, 3]))),
    storage.signature(snap(new Uint8Array([1, 2, 4])))
  );
});

test('the mirror script is served, loaded before the engines, and awaited before they start', async () => {
  assert.equal(isPublicAtlasFile('/js/proxy/atlas-blank-storage.js'), true);
  const html = await readFile(new URL('../../public/index.html', import.meta.url), 'utf8');
  assert.ok(html.indexOf('/js/proxy/atlas-blank-storage.js') > 0);
  assert.ok(html.indexOf('/js/proxy/atlas-blank-storage.js') < html.indexOf('/js/proxy/atlas-engines.js'));
  assert.match(html, /__atlasBlankStorageReady = AtlasBlankStorage\.start\(window\.parent\)/);
  const engines = await readFile(new URL('../../public/js/proxy/atlas-engines.js', import.meta.url), 'utf8');
  assert.match(engines, /await window\.__atlasBlankStorageReady;/);
});
