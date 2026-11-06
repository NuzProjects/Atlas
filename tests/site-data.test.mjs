import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import origins from '../public/proxy-origin.js';
import { siteCookieNames, siteCookiePrefix } from '../server/proxy-security.mjs';

const source = await fs.readFile(new URL('../public/atlas-site-data.js', import.meta.url), 'utf8');
function load() {
  const context = { URL, AtlasProxyOrigin: origins };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.AtlasSiteData;
}

test('sites group subdomains and common two-part suffixes', () => {
  const { siteOf } = load();
  assert.equal(siteOf('www.google.com'), 'google.com');
  assert.equal(siteOf('.accounts.google.com'), 'google.com');
  assert.equal(siteOf('news.bbc.co.uk'), 'bbc.co.uk');
  assert.equal(siteOf('example.com:8443'), 'example.com');
  assert.equal(siteOf('127.0.0.1'), '127.0.0.1');
});

test('engine storage keys map to the host that owns them', () => {
  const { classifyStorageKey } = load();
  const builtIn = [[siteCookiePrefix('https://www.example.com'), 'www.example.com']];
  assert.equal(classifyStorageKey('www.example.com@theme', builtIn), 'www.example.com');
  assert.equal(classifyStorageKey('__uv$https://docs.example.com@draft', builtIn), 'docs.example.com');
  assert.equal(classifyStorageKey(siteCookiePrefix('https://www.example.com') + 'cart', builtIn), 'www.example.com');
  assert.equal(classifyStorageKey('atlas_browsing_history', builtIn), '');
  assert.equal(classifyStorageKey('setting_proxy_engine', builtIn), '');
  assert.equal(classifyStorageKey('plainkey', builtIn), '');
});

test('engine database names map to the host that owns them', () => {
  const { classifyDatabase } = load();
  assert.equal(classifyDatabase('https://app.example.com@keyval', []), 'app.example.com');
  assert.equal(classifyDatabase('$scramjet', []), '');
  assert.equal(classifyDatabase('__op', []), '');
});

test('site cookie names include only the requested sites', () => {
  const site = siteCookiePrefix('https://www.example.com');
  const other = siteCookiePrefix('https://other.test');
  const header = `${site}sid=1; ${site}pref=2; ${other}sid=3; atlas_unrelated=4`;
  assert.deepEqual(siteCookieNames(header, ['https://www.example.com']), [`${site}sid`, `${site}pref`]);
  assert.deepEqual(siteCookieNames(header, []), []);
  assert.deepEqual(siteCookieNames(undefined, ['https://www.example.com']), []);
});
