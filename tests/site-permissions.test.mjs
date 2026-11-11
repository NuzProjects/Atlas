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

test('ads stay off until the visitor accepts, and the choice can be withdrawn', async () => {
  const events = [];
  const consent = await load('atlas-consent.js', 'AtlasConsent', {
    window: {
      __atlasConfig: { ads: { origin: 'https://ads.example' } },
      dispatchEvent: event => events.push(event.detail),
    },
    document: { readyState: 'loading', addEventListener() {}, getElementById: () => null },
    CustomEvent: class {
      constructor(type, init) {
        this.detail = init.detail;
      }
    },
    Date,
  });
  assert.equal(consent.adsAllowed(), false);
  consent.set('accepted');
  assert.equal(consent.adsAllowed(), true);
  consent.set('rejected');
  assert.equal(consent.adsAllowed(), false);
  assert.deepEqual(events, ['accepted', 'rejected']);
});
