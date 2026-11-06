import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { rewriteLocations } from '../server/proxy-compat.mjs';
test('worker location reads retain the native worker URL without document bootstrap', () => {
  const self = {
    location: { href: 'https://atlas.example/resource?token=encrypted', origin: 'https://atlas.example' },
  };
  const source = 'self.scriptDirectory = self.location.href; self.workerOrigin = self.location.origin;';
  vm.runInNewContext(rewriteLocations(source), { self });
  assert.equal(self.scriptDirectory, self.location.href);
  assert.equal(self.workerOrigin, self.location.origin);
});
test('document location reads still prefer the virtual destination', () => {
  const window = {
    location: { href: 'https://atlas.example/view?token=encrypted' },
    __atlasLocation: { href: 'https://game.example/play' },
  };
  vm.runInNewContext(rewriteLocations('window.destination = window.location.href;'), { window });
  assert.equal(window.destination, 'https://game.example/play');
});
test('document location assignments retain navigation interception', () => {
  let destination;
  const window = {
    __atlasLocation: {
      set href(value) {
        destination = value;
      },
    },
  };
  vm.runInNewContext(rewriteLocations('window.location.href="https://game.example/next";'), { window });
  assert.equal(destination, 'https://game.example/next');
});
test('direct location assignments remain valid assignment targets', () => {
  let destination;
  const window = {
    set __atlasLocation(value) {
      destination = value;
    },
  };
  vm.runInNewContext(rewriteLocations('window.location="https://game.example/next";'), { window });
  assert.equal(destination, 'https://game.example/next');
});
