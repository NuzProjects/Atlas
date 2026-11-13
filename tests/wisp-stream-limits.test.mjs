import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { server as wisp } from '../src/index.mjs';
import { client } from '../src/entrypoints/client.mjs';
import { stats } from '../src/server/stats.mjs';
import { applyWispLimits, wispLimits } from '../server/wisp-limits.mjs';

const THROTTLED = 0x49;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function startRelay(t, limits) {
  const saved = { ...wisp.options };
  Object.assign(wisp.options, { allow_loopback_ips: true, allow_private_ips: true });
  applyWispLimits(wisp.options, limits);
  const echo = net.createServer(socket => socket.pipe(socket).on('error', () => {}));
  echo.listen(0, '0.0.0.0');
  await once(echo, 'listening');
  const relay = http.createServer();
  relay.on('upgrade', (req, socket, head) => wisp.routeRequest(req, socket, head));
  relay.listen(0, '127.0.0.1');
  await once(relay, 'listening');
  const connections = [];
  t.after(async () => {
    for (const connection of connections) connection.close();
    relay.closeAllConnections?.();
    relay.close();
    echo.close();
    Object.assign(wisp.options, saved);
    await pause(50);
  });
  return {
    echoPort: echo.address().port,
    async connect() {
      const connection = new client.ClientConnection(`ws://127.0.0.1:${relay.address().port}/wisp/`);
      const opened = new Promise((resolve, reject) => {
        connection.onopen = resolve;
        connection.onerror = reject;
      });
      connection.connect_ws();
      await opened;
      connections.push(connection);
      return connection;
    },
  };
}

async function openStreams(connection, echoPort, hosts) {
  const result = { opened: 0, throttled: 0, streams: [] };
  for (const host of hosts) {
    const stream = connection.create_stream(host, echoPort);
    let echoed = false;
    stream.onmessage = () => {
      if (!echoed) result.opened++;
      echoed = true;
    };
    stream.onclose = reason => {
      if (reason === THROTTLED) result.throttled++;
    };
    stream.send(new Uint8Array([1]));
    result.streams.push(stream);
  }
  await pause(900);
  return result;
}

const same = (host, count) => Array(count).fill(host);
const unlimited = { streamsTotal: -1, streamsPerHost: -1, streamsGlobal: -1 };

test('streams beyond the per-site cap are refused while others to that site stay open', async t => {
  const relay = await startRelay(t, { ...unlimited, streamsPerHost: 4 });
  const result = await openStreams(await relay.connect(), relay.echoPort, same('127.0.0.1', 6));
  assert.equal(result.opened, 4);
  assert.equal(result.throttled, 2);
});

test('the per-connection total cap spans all sites', async t => {
  const relay = await startRelay(t, { ...unlimited, streamsTotal: 5 });
  const hosts = [...same('127.0.0.1', 3), ...same('127.0.0.2', 3)];
  const result = await openStreams(await relay.connect(), relay.echoPort, hosts);
  assert.equal(result.opened, 5);
  assert.equal(result.throttled, 1);
});

test('the global budget is shared by every connection and refused streams are counted', async t => {
  const relay = await startRelay(t, { ...unlimited, streamsGlobal: 4 });
  const before = stats.throttled_streams;
  const first = await openStreams(await relay.connect(), relay.echoPort, same('127.0.0.1', 3));
  const second = await openStreams(await relay.connect(), relay.echoPort, same('127.0.0.2', 3));
  assert.equal(first.opened + second.opened, 4);
  assert.equal(first.throttled + second.throttled, 2);
  assert.equal(stats.throttled_streams - before, 2);
});

test('the open stream count returns to zero once connections close', async t => {
  const relay = await startRelay(t, unlimited);
  const connection = await relay.connect();
  await openStreams(connection, relay.echoPort, same('127.0.0.1', 5));
  assert.equal(stats.open_streams, 5);
  connection.close();
  for (let attempt = 0; attempt < 20 && stats.open_streams !== 0; attempt++) await pause(50);
  assert.equal(stats.open_streams, 0);
});

test('production limits default to 256 per connection, 32 per site and 1000 overall, and can be tuned', () => {
  assert.deepEqual({ ...wispLimits({}) }, { streamsTotal: 256, streamsPerHost: 32, streamsGlobal: 1000 });
  assert.deepEqual(
    {
      ...wispLimits({
        ATLAS_WISP_STREAMS_TOTAL: '512',
        ATLAS_WISP_STREAMS_PER_HOST: 'x',
        ATLAS_WISP_STREAMS_GLOBAL: '-3',
      }),
    },
    { streamsTotal: 512, streamsPerHost: 32, streamsGlobal: 1000 }
  );
  const options = {};
  applyWispLimits(options, wispLimits({}));
  assert.deepEqual(options, { stream_limit_total: 256, stream_limit_per_host: 32, stream_limit_global: 1000 });
});
