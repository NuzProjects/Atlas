import test from 'node:test';
import assert from 'node:assert/strict';
import { isAdOrTracker, stripTrackerTags } from '../server/proxy-trackers.mjs';

test('Google analytics loaders are classified in server and injected browser code', () => {
  const browserCheck = Function('return (' + isAdOrTracker.toString() + ')')();
  for (const check of [isAdOrTracker, browserCheck]) {
    assert.equal(check('https://www.googletagmanager.com/gtag/js?l=dataLayer&id=G-9QZ1HGBJR6'), true);
    assert.equal(check('//www.googletagmanager.com/gtag/js', 'https://game.example/'), true);
    assert.equal(check('/gtag/js', 'https://www.googletagmanager.com/'), true);
    assert.equal(check('https://game.example/Build/game.framework.js'), false);
    assert.equal(check('https://game.example/googletagmanager.com.js'), false);
    assert.equal(check('https://googletagmanager.com.example/gtag/js'), false);
  }
});

test('optional tracker tags are removed without altering game and inline scripts', () => {
  const inline = '<script>const example="googletagmanager.com";</script>';
  const game = '<script src="/Build/game.loader.js"></script>';
  const html =
    '<script async src="https://www.googletagmanager.com/gtag/js?id=G-EXAMPLE"></script>' +
    inline +
    game +
    "<script SRC = '//www.google-analytics.com/analytics.js'></script>" +
    '<iframe src=https://ad.doubleclick.net/ads>fallback</iframe>';
  assert.equal(stripTrackerTags(html, 'https://game.example/'), inline + game);
  assert.equal(
    stripTrackerTags(
      '<script data-src="https://www.googletagmanager.com/gtag/js">keep()</script>',
      'https://game.example/'
    ),
    '<script data-src="https://www.googletagmanager.com/gtag/js">keep()</script>'
  );
});
