import * as logging from '../logging.mjs';
import * as filter from './filter.mjs';
import { stream_types } from '../packet.mjs';
import { AsyncWebSocket } from '../websocket.mjs';
import { NodeTCPSocket } from './net.mjs';

export class WSProxyConnection {
  constructor(ws, path) {
    let [hostname, port] = path.split('/').pop().split(':');
    this.hostname = hostname.trim();
    this.port = parseInt(port);
    this.ws = new AsyncWebSocket(ws);
  }

  async setup() {
    await this.ws.connect();

    const resolved = {};
    let err_code = await filter.is_stream_allowed(null, stream_types.TCP, this.hostname, this.port, resolved);
    if (err_code !== 0) {
      logging.info(`Refusing to create a wsproxy connection to ${this.hostname}:${this.port}`);
      this.ws.close();
      throw new filter.AccessDeniedError();
    }

    this.socket = new NodeTCPSocket(this.hostname, this.port);
    this.socket.resolved_ip = resolved.address;
    await this.socket.connect();

    const cleanup = async () => {
      await Promise.allSettled([this.socket.close(), this.ws.close()]);
    };
    for (const task of [this.tcp_to_ws(), this.ws_to_tcp()]) {
      task
        .catch(() => logging.error('wsproxy transport task failed'))
        .finally(cleanup)
        .catch(() => {});
    }
  }

  async tcp_to_ws() {
    while (true) {
      let data = await this.socket.recv();
      if (data == null) {
        break;
      }
      this.socket.pause();
      await this.ws.send(data);
      this.socket.resume();
    }
    await this.ws.close();
  }

  async ws_to_tcp() {
    while (true) {
      let data;
      data = await this.ws.recv();
      if (data == null) {
        break;
      }
      await this.socket.send(data);
    }
    await this.socket.close();
  }
}
