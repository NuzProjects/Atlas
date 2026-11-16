import http from 'node:http';
import tls from 'node:tls';
import { createWispDuplex } from './proxy-wisp.mjs';

export function createWispAgent(getConnection, { secure = false, ca, idleTimeout = 10000 } = {}) {
  const sessions = new Map();
  const agent = new http.Agent({
    keepAlive: true,
    maxSockets: 8,
    maxTotalSockets: 16,
    maxFreeSockets: 2,
    timeout: idleTimeout,
    scheduling: 'lifo',
  });

  agent.on('free', () => {
    const idle = Object.values(agent.freeSockets).flat();
    while (idle.length > 4) idle.shift().destroy();
  });
  agent.createConnection = (options, callback) => {
    getConnection()
      .then(connection => {
        const duplex = createWispDuplex(connection.create_stream(options.host, Number(options.port)));
        if (!secure) {
          callback(null, duplex);
          return;
        }
        const sessionKey = JSON.stringify([options.host, options.port]);
        const socket = tls.connect({
          socket: duplex,
          servername: options.host,
          session: sessions.get(sessionKey),
          ALPNProtocols: ['http/1.1'],
          minVersion: 'TLSv1.2',
          rejectUnauthorized: true,
          ...(ca ? { ca } : {}),
        });
        socket.on('session', session => {
          sessions.delete(sessionKey);
          if (sessions.size >= 100) sessions.delete(sessions.keys().next().value);
          sessions.set(sessionKey, session);
        });
        const failed = error => {
          duplex.destroy();
          callback(error);
        };
        socket.once('error', failed);
        socket.once('secureConnect', () => {
          socket.removeListener('error', failed);
          callback(null, socket);
        });
      })
      .catch(callback);
  };
  const destroy = agent.destroy.bind(agent);
  agent.destroy = () => {
    sessions.clear();
    return destroy();
  };
  return agent;
}
