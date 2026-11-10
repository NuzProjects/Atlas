import test from 'node:test';
import assert from 'node:assert/strict';
import { installLiveRequests } from '../server/proxy-live-requests.mjs';

function setup() {
  class Socket {
    static OPEN = 1;
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
    }
  }
  class Events {
    static CONNECTING = 0;
    constructor(url, options) {
      this.url = url;
      this.options = options;
    }
  }
  const root = { WebSocket: Socket, EventSource: Events, DOMException };
  installLiveRequests(
    root,
    'https://site.example/account/',
    url => '/resource?url=' + encodeURIComponent(url),
    url => 'wss://atlas.example/socket?url=' + encodeURIComponent(url)
  );
  return root;
}

test('relative and HTTP WebSocket URLs use the upstream origin and encrypted socket route', () => {
  const root = setup();
  for (const input of ['/live', 'https://site.example/live', 'wss://site.example/live']) {
    const socket = new root.WebSocket(input, ['updates']);
    assert.equal(new URL(socket.url).searchParams.get('url'), 'wss://site.example/live');
    assert.deepEqual(socket.protocols, ['updates']);
    assert.equal(root.WebSocket.OPEN, 1);
  }
});

test('invalid WebSocket protocols and fragments fail before routing', () => {
  const root = setup();
  for (const input of ['ftp://site.example/live', '/live#fragment'])
    assert.throws(() => new root.WebSocket(input), { name: 'SyntaxError' });
});

test('EventSource resolves relative URLs and preserves credential options and native constants', () => {
  const root = setup();
  const options = { withCredentials: true };
  const events = new root.EventSource('../events?last=2', options);
  assert.equal(
    new URL(events.url, 'https://atlas.example').searchParams.get('url'),
    'https://site.example/events?last=2'
  );
  assert.equal(events.options, options);
  assert.equal(root.EventSource.CONNECTING, 0);
});
