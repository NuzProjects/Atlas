import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { isPublicAtlasFile } from '../../server/config/deployment-config.mjs';

const source = await readFile(new URL('../../public/js/app/atlas-recommended.js', import.meta.url), 'utf8');

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
    values,
  };
}

function load(store, extra = {}) {
  const calls = { blank: 0, confirmLeave: [], branding: 0 };
  const context = {
    localStorage: store,
    setTimeout: () => 0,
    window: { top: null, self: null, addEventListener() {} },
    document: { readyState: 'complete', querySelector: () => null, addEventListener() {} },
    AtlasConsent: { termsAccepted: () => true },
    customTitleEnabled: false,
    customSiteTitle: 'Atlas',
    customSiteFavicon: '/assets/atlas.png',
    autoCloakEnabled: false,
    panicKeyEnabled: false,
    refreshBranding: () => calls.branding++,
    applyConfirmLeave: enabled => calls.confirmLeave.push(enabled),
    openAtlasBlank: () => {
      calls.blank++;
      return false;
    },
    getComputedStyle: () => ({ display: 'none' }),
    Promise,
    ...extra,
  };
  context.window.top = context.window;
  context.window.self = context.window;
  vm.runInNewContext(`${source};globalThis.__exported=AtlasRecommended;`, context);
  return { api: context.__exported, context, calls };
}

test('Enable turns on cloak, about:blank, anti-close and the panic key', () => {
  const store = storage();
  const { api, context, calls } = load(store);
  api.enable();
  for (const key of [
    'setting_custom_title_enabled',
    'setting_auto_cloak',
    'setting_about_blank',
    'setting_confirm_leave',
    'setting_panic_enabled',
  ])
    assert.equal(store.getItem(key), 'true', key);
  assert.equal(store.getItem('setting_custom_title'), 'Google');
  assert.equal(store.getItem('setting_custom_favicon'), '/assets/official/google.ico');
  assert.equal(context.customSiteTitle, 'Google');
  assert.equal(context.autoCloakEnabled, true);
  assert.equal(store.getItem('atlas_recommended_settings'), 'enabled');
  assert.equal(calls.blank, 1);
  assert.deepEqual(calls.confirmLeave, [true], 'anti-close applies here when about:blank could not open');
});

test('a custom title someone already chose is kept', () => {
  const store = storage({ setting_custom_title: 'Classes' });
  const { api, context } = load(store, { customSiteTitle: 'Classes', customSiteFavicon: 'https://example.com/i.ico' });
  api.enable();
  assert.equal(store.getItem('setting_custom_title'), 'Classes');
  assert.equal(context.customSiteTitle, 'Classes');
  assert.equal(store.getItem('setting_auto_cloak'), 'true');
});

test('inside about:blank it does not try to open another about:blank window', () => {
  const store = storage();
  const { api, calls } = load(store, { window: { __atlasBlankBoot: { embedded: true }, addEventListener() {} } });
  api.enable();
  assert.equal(calls.blank, 0);
  assert.deepEqual(calls.confirmLeave, [true]);
});

test('dismissing is remembered and the card is served by Atlas', () => {
  const store = storage();
  const { api } = load(store);
  api.dismiss();
  assert.equal(store.getItem('atlas_recommended_settings'), 'dismissed');
  assert.equal(isPublicAtlasFile('/js/app/atlas-recommended.js'), true);
});
