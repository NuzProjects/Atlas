import test from 'node:test';
import assert from 'node:assert/strict';
import { clientKey, createLimiter, limitSettings } from '../server/proxy-ratelimit.mjs';

const request = (remoteAddress, headers = {}) => ({ socket: { remoteAddress }, headers });

test('direct clients are identified by their own address and cannot spoof headers', () => {
  assert.equal(clientKey(request('203.0.113.9')), '203.0.113.9');
  assert.equal(
    clientKey(request('203.0.113.9', { 'x-forwarded-for': '198.51.100.1', 'cf-connecting-ip': '198.51.100.2' })),
    '203.0.113.9'
  );
  assert.equal(clientKey(request('::ffff:203.0.113.9')), '203.0.113.9');
});

test('requests through a local reverse proxy use the address it forwarded', () => {
  assert.equal(clientKey(request('127.0.0.1', { 'x-forwarded-for': '203.0.113.9' })), '203.0.113.9');
  assert.equal(clientKey(request('172.18.0.3', { 'x-forwarded-for': 'spoofed, 203.0.113.9' })), '203.0.113.9');
  assert.equal(clientKey(request('127.0.0.1')), 'local');
});

test('Cloudflare traffic uses CF-Connecting-IP only when the hop really is Cloudflare', () => {
  assert.equal(
    clientKey(request('127.0.0.1', { 'x-forwarded-for': '172.70.1.1', 'cf-connecting-ip': '203.0.113.9' })),
    '203.0.113.9'
  );
  assert.equal(clientKey(request('104.16.0.5', { 'cf-connecting-ip': '203.0.113.9' })), '203.0.113.9');
  assert.equal(
    clientKey(request('127.0.0.1', { 'x-forwarded-for': '198.51.100.7', 'cf-connecting-ip': '203.0.113.9' })),
    '198.51.100.7'
  );
});

test('IPv6 clients are grouped by /64 so address rotation does not bypass limits', () => {
  assert.equal(clientKey(request('2001:db8:1:2:aaaa::1')), '2001:db8:1:2::/64');
  assert.equal(clientKey(request('2001:db8:1:2:bbbb::9')), '2001:db8:1:2::/64');
});

test('request limits reset each minute and never apply to Atlas itself', () => {
  let time = 0;
  const limiter = createLimiter(
    { ...limitSettings({}), requestsPerMinute: 2, suggestionsPerMinute: 1 },
    { now: () => time }
  );
  assert.equal(limiter.allowRequest('a'), true);
  assert.equal(limiter.allowRequest('a'), true);
  assert.equal(limiter.allowRequest('a'), false);
  assert.equal(limiter.allowRequest('b'), true);
  assert.equal(limiter.allowRequest('a', 'suggestions'), true);
  assert.equal(limiter.allowRequest('a', 'suggestions'), false);
  for (let i = 0; i < 10; i++) assert.equal(limiter.allowRequest('local'), true);
  time += 60000;
  assert.equal(limiter.allowRequest('a'), true);
});

test('socket caps apply per client and in total, and release exactly once', () => {
  const limiter = createLimiter({
    ...limitSettings({}),
    socketsPerClient: 2,
    socketsTotal: 3,
    socketOpensPerMinute: 100,
  });
  const first = limiter.openSocket('a');
  const second = limiter.openSocket('a');
  assert.ok(first && second);
  assert.equal(limiter.openSocket('a'), null);
  const third = limiter.openSocket('b');
  assert.ok(third);
  assert.equal(limiter.openSocket('c'), null);
  first();
  first();
  assert.equal(limiter.stats().openSockets, 2);
  assert.ok(limiter.openSocket('c'));
  assert.equal(typeof limiter.openSocket('local'), 'function');
});

test('limits come from the environment with safe defaults', () => {
  assert.deepEqual(limitSettings({ ATLAS_SOCKETS_PER_CLIENT: '50', ATLAS_REQUESTS_PER_MINUTE: 'nope' }), {
    socketsPerClient: 50,
    socketsTotal: 1000,
    socketOpensPerMinute: 1200,
    requestsPerMinute: 12000,
    suggestionsPerMinute: 4800,
  });
});
