import ipaddr from 'ipaddr.js';

const cloudflareRanges = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
  '2400:cb00::/32',
  '2606:4700::/32',
  '2803:f800::/32',
  '2405:b500::/32',
  '2405:8100::/32',
  '2a06:98c0::/29',
  '2c0f:f248::/32',
].map(range => ipaddr.parseCIDR(range));

function parse(value) {
  const text = String(value || '').trim();
  if (!ipaddr.isValid(text)) return null;
  return ipaddr.process(text);
}

function isLocalProxy(address) {
  return ['loopback', 'private', 'uniqueLocal', 'linkLocal'].includes(address.range());
}

function isCloudflare(address) {
  return cloudflareRanges.some(([network, bits]) => address.kind() === network.kind() && address.match(network, bits));
}

export function clientKey(req) {
  const peer = parse(req.socket?.remoteAddress);
  if (!peer) return 'unknown';
  let client = peer;
  if (isLocalProxy(peer)) {
    const forwarded = String(req.headers?.['x-forwarded-for'] || '')
      .split(',')
      .map(part => part.trim())
      .filter(Boolean);
    const nearest = parse(forwarded.at(-1));
    if (!nearest) return peer.range() === 'loopback' ? 'local' : peer.toString();
    client = nearest;
  }
  if (isCloudflare(client)) client = parse(req.headers?.['cf-connecting-ip']) || client;
  if (client.kind() === 'ipv6')
    return (
      client.parts
        .slice(0, 4)
        .map(part => part.toString(16))
        .join(':') + '::/64'
    );
  return client.toString();
}

function positive(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function limitSettings(env = process.env) {
  return {
    socketsPerClient: positive(env.ATLAS_SOCKETS_PER_CLIENT, 600),
    socketsTotal: positive(env.ATLAS_SOCKETS_TOTAL, 1000),
    socketOpensPerMinute: positive(env.ATLAS_SOCKET_OPENS_PER_MINUTE, 1200),
    requestsPerMinute: positive(env.ATLAS_REQUESTS_PER_MINUTE, 12000),
    suggestionsPerMinute: positive(env.ATLAS_SUGGESTIONS_PER_MINUTE, 4800),
  };
}

export function createLimiter(settings = limitSettings(), { now = Date.now, maxClients = 50000 } = {}) {
  const windows = new Map();
  const sockets = new Map();
  let openSockets = 0;
  let requestsRefused = 0;
  let socketsRefused = 0;

  function take(bucket, key, limit) {
    if (key === 'local') return true;
    const id = bucket + '|' + key;
    const minute = Math.floor(now() / 60000);
    let entry = windows.get(id);
    if (!entry || entry.minute !== minute) {
      if (!entry && windows.size >= maxClients) {
        for (const [staleId, stale] of windows) if (stale.minute !== minute) windows.delete(staleId);
        if (windows.size >= maxClients) return false;
      }
      entry = { minute, count: 0 };
      windows.set(id, entry);
    }
    entry.count++;
    return entry.count <= limit;
  }

  return {
    allowRequest(key, kind = 'requests') {
      const allowed = take(
        kind,
        key,
        kind === 'suggestions' ? settings.suggestionsPerMinute : settings.requestsPerMinute
      );
      if (!allowed) requestsRefused++;
      return allowed;
    },
    openSocket(key) {
      if (key === 'local') return () => {};
      const current = sockets.get(key) || 0;
      if (openSockets >= settings.socketsTotal || current >= settings.socketsPerClient) {
        socketsRefused++;
        return null;
      }
      if (!take('socket-opens', key, settings.socketOpensPerMinute)) {
        socketsRefused++;
        return null;
      }
      sockets.set(key, current + 1);
      openSockets++;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        openSockets--;
        const remaining = (sockets.get(key) || 1) - 1;
        if (remaining > 0) sockets.set(key, remaining);
        else sockets.delete(key);
      };
    },
    stats: () => ({ openSockets, clients: sockets.size, windows: windows.size, requestsRefused, socketsRefused }),
  };
}
