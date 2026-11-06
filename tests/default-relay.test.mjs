import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import { createDefaultRelayGateway } from '../server/default-relay.mjs';

test('unavailable default relay falls back without forwarding browser credentials or replaying established sessions', async t => {
  const servers = [],
    sockets = new Set();
  t.after(() => {
    for (const socket of sockets) socket.terminate();
    for (const server of servers) server.close();
  });
  async function listen(server) {
    servers.push(server);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return 'ws://127.0.0.1:' + server.address().port + '/';
  }
  let primaryAttempts = 0,
    fallbackConnections = 0;
  const primary = http.createServer();
  primary.on('upgrade', (_req, socket) => {
    primaryAttempts++;
    socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
  });
  const primaryUrl = await listen(primary);
  const fallback = http.createServer(),
    wss = new WebSocketServer({ server: fallback });
  let upstream;
  wss.on('connection', (socket, request) => {
    fallbackConnections++;
    upstream = socket;
    sockets.add(socket);
    for (const header of ['cookie', 'authorization', 'origin']) assert.equal(request.headers[header], undefined);
    socket.on('message', (data, binary) => socket.send(data, { binary }));
  });
  const fallbackUrl = await listen(fallback);
  const gateway = http.createServer();
  gateway.on('upgrade', createDefaultRelayGateway(primaryUrl, fallbackUrl));
  const url = await listen(gateway);
  for (let attempt = 0; attempt < 2; attempt++) {
    const client = new WebSocket(url, 'wisp-v2', {
      headers: { Cookie: 'fixture=private', Authorization: 'Bearer fixture', Origin: 'https://fixture.example' },
    });
    sockets.add(client);
    await once(client, 'open');
    assert.equal(client.protocol, 'wisp-v2');
    const message = once(client, 'message'),
      payload = Buffer.alloc(65536, 42);
    client.send(payload);
    const [data, binary] = await message;
    assert.deepEqual(data, payload);
    assert.equal(binary, true);
    const closed = once(client, 'close');
    upstream.close();
    await closed;
  }
  assert.equal(primaryAttempts, 1, 'failed primary is cooled down');
  assert.equal(fallbackConnections, 2, 'closed sessions are never replayed');
});

test('a healthy primary is used without contacting the fallback', async t => {
  const primary = http.createServer(),
    wss = new WebSocketServer({ server: primary });
  const gateway = http.createServer();
  t.after(() => {
    for (const socket of wss.clients) socket.terminate();
    primary.close();
    gateway.close();
  });
  primary.listen(0, '127.0.0.1');
  await once(primary, 'listening');
  gateway.on(
    'upgrade',
    createDefaultRelayGateway('ws://127.0.0.1:' + primary.address().port + '/', 'ws://127.0.0.1:1/')
  );
  gateway.listen(0, '127.0.0.1');
  await once(gateway, 'listening');
  const client = new WebSocket('ws://127.0.0.1:' + gateway.address().port + '/', 'wisp-v2');
  t.after(() => client.terminate());
  await once(client, 'open');
  assert.equal(client.protocol, 'wisp-v2');
});

test('both failed relays return an error after one attempt each and a later retry starts fresh', async t => {
  const servers = [],
    sockets = new Set(),
    attempts = [0, 0];
  t.after(() => {
    for (const socket of sockets) socket.destroy();
    for (const server of servers) server.close();
  });
  async function listen(server) {
    servers.push(server);
    server.on('connection', socket => {
      sockets.add(socket);
      socket.on('close', () => sockets.delete(socket));
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    return 'ws://127.0.0.1:' + server.address().port + '/';
  }
  const addresses = [];
  for (let i = 0; i < 2; i++) {
    const relay = http.createServer();
    relay.on('upgrade', (_req, socket) => {
      attempts[i]++;
      socket.end('HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
    });
    addresses.push(await listen(relay));
  }
  const gateway = http.createServer();
  gateway.on('upgrade', createDefaultRelayGateway(...addresses));
  const url = await listen(gateway);
  for (let attempt = 1; attempt <= 2; attempt++) {
    const client = new WebSocket(url);
    const response = await new Promise((resolve, reject) => {
      client.on('error', reject);
      client.on('unexpected-response', (_req, res) => {
        let body = '';
        res.on('data', data => (body += data));
        res.on('end', () => {
          resolve({ status: res.statusCode, body });
          client.terminate();
        });
      });
    });
    assert.equal(response.status, 503);
    assert.match(response.body, /either Wisp server/);
    assert.deepEqual(attempts, [attempt, attempt]);
  }
});
