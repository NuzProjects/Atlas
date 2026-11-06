import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
const source = await fs.readFile(new URL('../public/atlas-game-ads.js', import.meta.url), 'utf8');
function fixture() {
  const window = {};
  vm.runInNewContext(source, { window, WeakMap, Reflect, queueMicrotask });
  return window.AtlasGameAds;
}
const tick = () => new Promise(resolve => queueMicrotask(resolve));

test('blocked between-match ads release the game on every attempt without starting ads or awarding rewards', async () => {
  const policy = fixture();
  let waiting = false,
    focus = false,
    starts = 0,
    rewards = 0,
    failures = 0;
  const sdk = {
    registered_events: {
      adError() {
        waiting = false;
        focus = true;
        failures++;
      },
      adFinished() {
        rewards++;
      },
    },
    requestAd() {
      starts++;
    },
  };
  const root = { WinterpixelAds: sdk };
  assert.equal(
    policy.install(root, () => true),
    true
  );
  for (let match = 0; match < 5; match++) {
    waiting = true;
    focus = false;
    sdk.requestAd('midgame');
    sdk.requestAd('midgame');
    await tick();
    assert.equal(waiting, false);
    assert.equal(focus, true);
  }
  sdk.requestAd('rewarded');
  await tick();
  assert.equal(starts, 0);
  assert.equal(rewards, 0);
  assert.equal(failures, 6);
});

test('allowing ads preserves SDK arguments, receiver, and return value; installing twice does not stack callbacks', async () => {
  const policy = fixture();
  let blocking = true,
    failures = 0;
  const sdk = {
    registered_events: {
      adError() {
        failures++;
      },
    },
    requestAd(...args) {
      assert.equal(this, sdk);
      return args.join(':');
    },
  };
  const root = { WinterpixelAds: sdk };
  policy.install(root, () => blocking);
  const wrapped = sdk.requestAd;
  policy.install(root, () => blocking);
  assert.equal(sdk.requestAd, wrapped);
  blocking = false;
  assert.equal(sdk.requestAd('midgame', 'next'), 'midgame:next');
  blocking = true;
  sdk.requestAd('midgame');
  await tick();
  assert.equal(failures, 1);
});

test('missing error callbacks and unrelated SDKs retain their native behavior', () => {
  const policy = fixture();
  let calls = 0;
  assert.equal(
    policy.install({}, () => true),
    false
  );
  const sdk = {
    registered_events: {},
    requestAd() {
      calls++;
    },
  };
  policy.install({ WinterpixelAds: sdk }, () => true);
  sdk.requestAd('midgame');
  assert.equal(calls, 1);
});

test('document loads install late SDKs and navigation cleans up old document listeners', async () => {
  const policy = fixture();
  const document = () => ({
    listeners: new Set(),
    defaultView: {},
    addEventListener(_, fn) {
      this.listeners.add(fn);
    },
    removeEventListener(_, fn) {
      this.listeners.delete(fn);
    },
  });
  const first = document(),
    second = document();
  const listeners = new Set();
  const frame = {
    contentDocument: first,
    addEventListener(_, fn) {
      listeners.add(fn);
    },
    removeEventListener(_, fn) {
      listeners.delete(fn);
    },
  };
  const dispose = policy.watch(frame, () => true);
  let failures = 0;
  first.defaultView.WinterpixelAds = {
    registered_events: {
      adError() {
        failures++;
      },
    },
    requestAd() {
      throw Error('Native stalled ad request should be skipped');
    },
  };
  for (const fn of first.listeners) fn();
  first.defaultView.WinterpixelAds.requestAd('midgame');
  await tick();
  assert.equal(failures, 1);
  frame.contentDocument = second;
  for (const fn of listeners) fn();
  assert.equal(first.listeners.size, 0);
  assert.equal(second.listeners.size, 1);
  dispose();
  assert.equal(second.listeners.size, 0);
  assert.equal(listeners.size, 0);
});
