import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('../public/atlas-engines.js', import.meta.url), 'utf8');
function fixture({ engine = 'scramjet', failScript = () => false, failInit = false, failWorker = false } = {}) {
  const requests = [],
    navigations = [];
  let initializations = 0;
  const context = {
    Map,
    Promise,
    URL,
    Error,
    setTimeout,
    clearTimeout,
    crossOriginIsolated: false,
    location: { href: 'http://localhost/', origin: 'http://localhost' },
    localStorage: { getItem: () => engine },
    AtlasEngineConfig: { codec: { encode: x => 'encoded:' + x } },
    BareMux: {
      BareMuxConnection: class {
        async setTransport() {}
      },
    },
    navigator: {
      serviceWorker: {
        register: async () => {
          if (failWorker) throw Error('Service worker permission denied');
          return { active: { state: 'activated' } };
        },
      },
    },
    document: {
      createElement: () => ({ remove() {} }),
      head: {
        append(script) {
          requests.push(script.src);
          queueMicrotask(() => (failScript(script.src, requests) ? script.onerror() : script.onload()));
        },
      },
    },
    $scramjetLoadController: () => ({
      ScramjetController: class {
        async init() {
          initializations++;
          if (failInit && initializations === 1) throw Error('WASM initialization failed');
        }
        createFrame() {
          return {
            addEventListener() {},
            go(target) {
              navigations.push(target);
            },
          };
        }
      },
    }),
    activeTabId: 0,
    hideLoader() {},
    updateSiteInfo() {},
  };
  context.window = { __atlasConfig: {}, isSecureContext: true };
  vm.runInNewContext(source, context);
  function tab() {
    const doc = {
      open() {},
      write() {},
      close() {},
      getElementById: () => ({
        set textContent(value) {
          doc.error = value;
        },
      }),
    };
    return { id: 1, iframe: { contentDocument: doc } };
  }
  return {
    requests,
    navigations,
    tab,
    navigate: (t, address = 'native') =>
      context.window.AtlasEngines.navigate(t, 'https://example.com/', address, 'ws://localhost/wisp/'),
    selected: context.window.AtlasEngines.selected,
    initializations: () => initializations,
  };
}
test('Scramjet remains default and retries a transient script failure', async () => {
  const f = fixture({
    engine: null,
    failScript: (url, requests) => url.includes('baremux/index') && requests.length === 1,
  });
  await f.navigate(f.tab());
  assert.equal(f.requests.filter(x => x.includes('baremux/index')).length, 2);
  assert.deepEqual(f.navigations, ['https://example.com/']);
});
test('a persistent asset failure identifies the file and a later navigation can retry', async () => {
  let failing = true;
  const f = fixture({ failScript: () => failing }),
    tab = f.tab();
  await f.navigate(tab);
  assert.match(tab.iframe.contentDocument.error, /\/vendor\/baremux\/index.js/);
  assert.equal(f.requests.length, 2);
  failing = false;
  await f.navigate(tab);
  assert.equal(f.navigations.length, 1);
});
test('concurrent Scramjet navigations share controller initialization', async () => {
  const f = fixture();
  await Promise.all([f.navigate(f.tab()), f.navigate(f.tab())]);
  assert.equal(f.initializations(), 1);
  assert.equal(f.navigations.length, 2);
});
test('failed Scramjet initialization can recover on retry', async () => {
  const f = fixture({ failInit: true }),
    tab = f.tab();
  await f.navigate(tab);
  await f.navigate(tab);
  assert.equal(f.initializations(), 2);
  assert.equal(f.navigations.length, 1);
});
test('UV loads its bundle before navigating and remains selectable', async () => {
  const f = fixture({ engine: 'ultraviolet' }),
    tab = f.tab();
  await f.navigate(tab);
  assert.ok(f.requests.includes('/vendor/ultraviolet/uv.bundle.js'));
  assert.equal(tab.iframe.src, '/engine/ultraviolet/encoded:https://example.com/');
  assert.equal(f.initializations(), 0);
});

test('missing installed engine assets fail startup with an actionable error', async () => {
  const { createProxyEngines } = await import('../server/proxy-engines.mjs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await fs.mkdtemp(join(tmpdir(), 'atlas-engine-test-'));
  try {
    await assert.rejects(
      createProxyEngines(root, {}),
      /Missing proxy engine asset scramjet\/scramjet.all.js. Run npm ci/
    );
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

for (const engine of ['scramjet', 'ultraviolet'])
  test(engine + ' falls back to the original renderer when BareMux is blocked', async () => {
    let blocked = true;
    const f = fixture({ engine, failScript: url => blocked && url === '/vendor/baremux/index.js' }),
      tab = f.tab();
    await f.navigate(tab, '/view?token=encrypted-address');
    assert.equal(tab.iframe.src, 'http://localhost/view?token=encrypted-address');
    assert.equal(tab.proxyEngine, 'atlas');
    assert.equal(tab.engineFallback.requested, engine);
    assert.match(tab.engineFallback.reason, /baremux/);
    assert.equal(f.selected(), engine);
    blocked = false;
    await f.navigate(tab, '/view?token=encrypted-address');
    assert.equal(tab.proxyEngine, engine);
    assert.equal(tab.engineFallback, null);
  });

test('unavailable service workers use the original renderer', async () => {
  const f = fixture({ failWorker: true }),
    tab = f.tab();
  await f.navigate(tab, '/view?token=encrypted-address');
  assert.equal(tab.proxyEngine, 'atlas');
  assert.match(tab.engineFallback.reason, /permission denied/);
});

test('fallback refuses addresses outside the Atlas document renderer', async () => {
  const f = fixture({ failScript: () => true });
  for (const address of ['https://other.example/view?token=x', '/resource?token=x', '/view', 'javascript:alert(1)']) {
    const tab = f.tab();
    await f.navigate(tab, address);
    assert.equal(tab.iframe.src, undefined);
    assert.ok(tab.iframe.contentDocument.error);
  }
});

test('closing a tab cancels fallback navigation', async () => {
  const f = fixture({ failScript: () => true }),
    tab = f.tab();
  tab.isClosing = true;
  await f.navigate(tab, '/view?token=encrypted-address');
  assert.equal(tab.iframe.src, undefined);
});

test('a newer navigation supersedes a pending compatibility fallback', async () => {
  const f = fixture({ failScript: () => true }),
    tab = f.tab();
  await Promise.all([f.navigate(tab, '/view?token=older'), f.navigate(tab, '/view?token=newer')]);
  assert.equal(tab.iframe.src, 'http://localhost/view?token=newer');
});
