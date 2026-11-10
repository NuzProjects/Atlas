import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = new URL('../deploy/ad-origin/banner-unit.js', import.meta.url);
const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
for (const [unit, width, height] of [
  ['atlas-rectangle', 300, 250],
  ['side', 160, 300],
  ['side2', 160, 300],
  ['side3', 160, 300],
  ['wide', 728, 90],
  ['mobile', 320, 50],
]) {
  test(`${unit} preserves its dimensions and writes one provider loader`, { skip: !source }, () => {
    const writes = [];
    const window = {};
    vm.runInNewContext(source, {
      window,
      URLSearchParams,
      location: { search: '?unit=' + unit },
      document: { write: text => writes.push(text) },
    });
    assert.equal(window.atOptions.width, width);
    assert.equal(window.atOptions.height, height);
    assert.equal(window.atOptions.format, 'iframe');
    assert.equal(writes.length, 1);
    assert.ok(writes[0].includes('https://bauval.org/22/' + window.atOptions.key));
  });
}

test('unknown and prototype unit names never execute a provider loader', { skip: !source }, () => {
  for (const unit of ['', 'unknown', '__proto__', 'constructor', 'toString', '<script>']) {
    const window = {};
    vm.runInNewContext(source, {
      window,
      URLSearchParams,
      location: { search: '?unit=' + encodeURIComponent(unit) },
      document: { write: () => assert.fail('Unexpected loader') },
    });
    assert.equal(window.atOptions, undefined);
  }
});

test('the main controller contains only isolated frame URLs, not the provider snippet', () => {
  const ads = fs.readFileSync(new URL('../public/ads.js', import.meta.url), 'utf8');
  assert.ok(ads.includes('window.__atlasConfig.ads'));
  assert.ok(ads.includes('allow-scripts allow-popups allow-same-origin'));
  for (const text of ['bauval.org', 'atOptions', 'document.write', 'srcdoc', 'fcf4eb96']) {
    assert.ok(!ads.includes(text), 'Provider code leaked into the main controller');
  }
});
