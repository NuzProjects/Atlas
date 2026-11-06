import WebSocket, { WebSocketServer } from 'ws';

export function createDefaultRelayGateway(target, fallbackTarget) {
  const server = new WebSocketServer({
    noServer: true,
    maxPayload: 1048576,
    perMessageDeflate: false,
    handleProtocols: (_protocols, req) => req.atlasRelayProtocol || false,
  });
  let connections = 0;
  let retryPrimaryAt = 0;
  return function upgrade(req, socket, head) {
    if (connections >= 128) {
      socket.destroy();
      return;
    }
    connections++;
    let client,
      upstream,
      closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      connections--;
      clearTimeout(timer);
      upstream?.terminate();
      client?.terminate();
      if (!client && !socket.writableEnded) socket.destroy();
    };
    const timer = setTimeout(close, 15000);
    socket.once('close', close);
    socket.once('error', close);
    try {
      const protocols = (req.headers['sec-websocket-protocol'] || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);
      const connect = (address, isFallback = false) => {
        const candidate = new WebSocket(address, protocols, {
          handshakeTimeout: 4000,
          maxPayload: 1048576,
          perMessageDeflate: false,
        });
        upstream = candidate;
        let opened = false,
          failed = false;
        const failedHandshake = () => {
          if (closed || failed || upstream !== candidate) return;
          failed = true;
          if (opened) {
            close();
            return;
          }
          if (isFallback || !fallbackTarget || fallbackTarget === target) {
            retryPrimaryAt = 0;
            if (!socket.destroyed && socket.writable) {
              const message = 'Atlas could not connect to either Wisp server. Reload this tab to retry.';
              socket.end(
                'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Length: ' +
                  Buffer.byteLength(message) +
                  '\r\n\r\n' +
                  message
              );
            }
            close();
            return;
          }
          retryPrimaryAt = Date.now() + 30000;
          candidate.terminate();
          connect(fallbackTarget, true);
        };
        candidate.on('error', failedHandshake);
        candidate.on('close', failedHandshake);
        candidate.once('open', () => {
          opened = true;
          if (closed) return;
          if (!isFallback) retryPrimaryAt = 0;
          upstream.pause();
          req.atlasRelayProtocol = upstream.protocol;
          server.handleUpgrade(req, socket, head, accepted => {
            client = accepted;
            clearTimeout(timer);
            client.on('error', close);
            client.on('close', close);
            client.on('message', (data, binary) => {
              if (upstream.readyState !== WebSocket.OPEN) {
                close();
                return;
              }
              client.pause();
              upstream.send(data, { binary }, error => (error ? close() : client.resume()));
            });
            upstream.on('message', (data, binary) => {
              if (client.readyState !== WebSocket.OPEN) {
                close();
                return;
              }
              upstream.pause();
              client.send(data, { binary }, error => (error ? close() : upstream.resume()));
            });
            upstream.resume();
          });
        });
      };
      const useFallback = !!fallbackTarget && Date.now() < retryPrimaryAt;
      connect(useFallback ? fallbackTarget : target, useFallback);
    } catch {
      close();
    }
  };
}
