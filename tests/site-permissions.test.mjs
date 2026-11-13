import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

function storage() {
  const values = new Map();
  return {
    getItem: key => (values.has(key) ? values.get(key) : null),
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

async function load(file, name, extra = {}) {
  const source = await readFile(new URL(`../public/${file}`, import.meta.url), 'utf8');
  const context = { localStorage: storage(), URL, JSON, ...extra };
  vm.runInNewContext(`${source};globalThis.__exported=${name};`, context);
  return context.__exported;
}

test('sites get no camera, microphone or location until that site is allowed', async () => {
  const permissions = await load('atlas-site-permissions.js', 'AtlasSitePermissions');
  assert.match(
    permissions.allowFor('https://meet.example/room'),
    /camera 'none'.*microphone 'none'.*geolocation 'none'/
  );
  permissions.set('https://www.meet.example/room', 'media', true);
  assert.deepEqual({ ...permissions.get('https://meet.example/other') }, { media: true, location: false });
  assert.match(
    permissions.allowFor('https://meet.example/'),
    /camera \*; microphone \*; display-capture \*; geolocation 'none'/
  );
  assert.match(permissions.allowFor('https://other.example/'), /camera 'none'/);
  assert.equal(permissions.site('atlas://new'), null);
});

test('changing a frame policy reports whether the tab must reload to apply it', async () => {
  const permissions = await load('atlas-site-permissions.js', 'AtlasSitePermissions');
  const attributes = {};
  const frame = {
    getAttribute: name => attributes[name] ?? null,
    setAttribute: (name, value) => (attributes[name] = value),
  };
  assert.equal(permissions.apply(frame, 'https://maps.example/'), true);
  assert.equal(permissions.apply(frame, 'https://maps.example/'), false);
  permissions.set('https://maps.example/', 'location', true);
  assert.equal(permissions.apply(frame, 'https://maps.example/'), true);
  assert.match(attributes.allow, /geolocation \*/);
});

test('the first-run agreement is remembered per version, and the old ad choice is cleared', async () => {
  const store = storage();
  store.setItem('atlas_ad_consent', JSON.stringify({ choice: 'rejected', version: '1' }));
  const consent = await load('atlas-consent.js', 'AtlasConsent', {
    localStorage: store,
    window: { dispatchEvent() {} },
    document: { readyState: 'loading', addEventListener() {} },
  });
  assert.equal(store.getItem('atlas_ad_consent'), null);
  assert.equal(consent.termsAccepted(), false);
  store.setItem('atlas_terms_accepted', JSON.stringify({ version: '2026-11-11' }));
  assert.equal(consent.termsAccepted(), false, 'an older agreement must be shown again');
  store.setItem('atlas_terms_accepted', JSON.stringify({ version: '2026-11-13' }));
  assert.equal(consent.termsAccepted(), true);
  assert.deepEqual(Object.keys(consent), ['termsAccepted'], 'there is no ad opt-in or opt-out any more');
});

test('ads are shown to everyone once the agreement is accepted, with no ad-consent gate', async () => {
  const { readFile } = await import('node:fs/promises');
  const ads = await readFile(new URL('../public/ads.js', import.meta.url), 'utf8');
  assert.match(ads, /AtlasConsent\.termsAccepted\(\)/);
  assert.doesNotMatch(ads, /adsAllowed|atlas-ad-consent/);
  const settings = await readFile(new URL('../public/atlas-ui.js', import.meta.url), 'utf8');
  assert.doesNotMatch(settings, /Ad Cookies|settingAdConsent/);
  const policy = await readFile(new URL('../public/privacy.html', import.meta.url), 'utf8');
  assert.match(policy, /cannot be turned off in Atlas/);
  assert.doesNotMatch(policy, /only load after you accept|reject ad cookies/i);
});
