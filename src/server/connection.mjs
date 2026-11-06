import * as logging from "../logging.mjs";
import * as filter from "./filter.mjs";
import { AsyncQueue, AsyncWebSocket, get_conn_id } from "../websocket.mjs";
import { NodeTCPSocket, NodeUDPSocket } from "./net.mjs";
import {
  WispBuffer,
  WispPacket,
  ContinuePayload,
  ClosePayload,
  ConnectPayload,
  DataPayload,
  InfoPayload,
  stream_types,
  close_reasons
} from "../packet.mjs";
import { options } from "./options.mjs";
import { MOTDExtension, UDPExtension, serialize_extensions, parse_extensions } from "../extensions.mjs";

export class HandshakeError extends Error {}

export class ServerStream {
  static buffer_size = 128;

  constructor(stream_id, conn, socket) {
    this.stream_id = stream_id;
    this.conn = conn;
    this.socket = socket;
    this.send_buffer = new AsyncQueue(ServerStream.buffer_size);
    this.packets_sent = 0;
    this.closed = false;
  }

  async setup() {
    if (this.closed) return;
    await this.socket.connect();
    if (this.closed) { await this.socket.close(); return; }

    this.tcp_to_ws().catch((error) => {
      logging.warn(`(${this.conn.conn_id}) upstream receive failed (${error.code || 'transport'})`);
      this.conn.close_stream(this.stream_id, close_reasons.NetworkError).catch(() => {});
    });
    this.ws_to_tcp().catch((error) => {
      logging.warn(`(${this.conn.conn_id}) upstream send failed (${error.code || 'transport'})`);
      this.conn.close_stream(this.stream_id, close_reasons.NetworkError).catch(() => {});
    });
  }

  async tcp_to_ws() {
    while (!this.closed) {
      let data = await this.socket.recv();
      if (data == null || this.closed) {
        break;
      }

      this.socket.pause();
      let packet = new WispPacket({
        type: DataPayload.type,
        stream_id: this.stream_id,
        payload: new DataPayload({
          data: new WispBuffer(new Uint8Array(data))
        })
      });
      await this.conn.ws.send(packet);
      this.socket.resume();
    }
    await this.conn.close_stream(this.stream_id, close_reasons.Voluntary);
  }

  async ws_to_tcp() {
    while (!this.closed) {
      let data = await this.send_buffer.get();
      if (data == null || this.closed) {
        break;
      }
      await this.socket.send(data);

      this.packets_sent++;
      if (this.packets_sent % (ServerStream.buffer_size / 2) !== 0) {
        continue;
      }
      let packet = new WispPacket({
        type: ContinuePayload.type,
        stream_id: this.stream_id,
        payload: new ContinuePayload({
          buffer_remaining: ServerStream.buffer_size - this.send_buffer.size
        })
      });
      await this.conn.ws.send(packet);
    }
    await this.close();
  }

  async close(reason = null) {
    if (this.closed) return;
    this.closed = true;
    this.send_buffer.close();
    await this.socket.close();
    if (reason == null) return;

    let packet = new WispPacket({
      type: ClosePayload.type,
      stream_id: this.stream_id,
      payload: new ClosePayload({
        reason: reason
      })
    });
    await this.conn.ws.send(packet);
  }

  async put_data(data) {
    if (this.closed) return;
    if (!this.send_buffer.put_now(data)) await this.conn.close_stream(this.stream_id, close_reasons.ConnThrottled);
  }
}

export class ServerConnection {
  constructor(ws, path, {TCPSocket, UDPSocket, ping_interval, wisp_version, wisp_extensions, handshake_timeout = 10000} = {}) {
    this.ws = new AsyncWebSocket(ws);
    this.path = path;
    this.TCPSocket = TCPSocket || NodeTCPSocket;
    this.UDPSocket = UDPSocket || NodeUDPSocket;
    this.ping_interval = ping_interval || 30;
    this.wisp_version = wisp_version || options.wisp_version;
    this.wisp_extensions = wisp_extensions || null;
    this.handshake_timeout = handshake_timeout;

    this.ping_task = null;
    this.streams = {};
    this.conn_id = get_conn_id();

    this.server_exts = {};
    this.client_exts = {};

    if (this.wisp_version === 2 && this.wisp_extensions === null) {
      this.add_extensions();
    }
  }

  add_extensions() {
    this.wisp_extensions = [];
    if (options.allow_udp_streams)
      this.wisp_extensions.push(new UDPExtension({server_config: {}}));
    if (options.wisp_motd)
      this.wisp_extensions.push(new MOTDExtension({server_config: {
        message: options.wisp_motd
      }}));
  }

  async setup() {
    logging.info(`setting up new wisp v${this.wisp_version} connection with id ${this.conn_id}`);

    await this.ws.connect();
    if (this.wisp_version == 2) {
      await this.setup_wisp_v2()
    }

    let continue_packet = new WispPacket({
      type: ContinuePayload.type,
      stream_id: 0,
      payload: new ContinuePayload({
        buffer_remaining: ServerStream.buffer_size
      })
    });
    await this.ws.send(continue_packet);

    if (typeof this.ws.ws.ping === "function") {
      this.pong_received = true;
      this.ws.ws.on('pong', () => { this.pong_received = true; });
      this.ping_task = setInterval(() => {
        if (!this.pong_received) { this.ws.ws.terminate(); return; }
        this.pong_received = false;
        if (this.ws.ws.readyState === 1) this.ws.ws.ping();
      }, this.ping_interval * 1000);
    }
  }

  async setup_wisp_v2() {
    let ext_buffer = serialize_extensions(this.wisp_extensions);
    let info_packet = new WispPacket({
      type: InfoPayload.type,
      stream_id: 0,
      payload: new InfoPayload({
        major_ver: this.wisp_version,
        minor_ver: 0,
        extensions: ext_buffer
      })
    });
    await this.ws.send(info_packet);

    let timer;
    let data;
    try {
      data = await Promise.race([this.ws.recv(), new Promise((_, reject) => {
        timer = setTimeout(() => { this.ws.close(1002, 'Handshake timeout'); reject(new HandshakeError('Handshake timeout')); }, this.handshake_timeout);
      })]);
    } finally { clearTimeout(timer); }
    if (data == null) {
      logging.warn(`(${this.conn_id}) handshake error: ws closed before handshake complete`);
      await this.cleanup();
      throw new HandshakeError();
    }
    let buffer = new WispBuffer(new Uint8Array(data));
    let packet = WispPacket.parse_all(buffer);

    if (packet.type !== InfoPayload.type || packet.stream_id !== 0 || packet.payload.major_ver !== 2) {
      logging.warn(`(${this.conn_id}) handshake error: unexpected packet of type ${packet.type}`);
      await this.cleanup();
      throw new HandshakeError();
    }

    let client_extensions = parse_extensions(packet.payload.extensions, this.wisp_extensions, "client");
    for (let client_ext of client_extensions) {
      for (let server_ext of this.wisp_extensions) {
        if (server_ext.id === client_ext.id) {
          this.server_exts[server_ext.id] = server_ext;
          this.client_exts[client_ext.id] = client_ext;
        }
      }
    }
  }

  create_stream(stream_id, type, hostname, port) {
    if (!stream_id || this.streams[stream_id]) throw new TypeError('Invalid or duplicate stream ID');
    hostname = hostname.toLowerCase();
    let SocketImpl = type === stream_types.TCP ? this.TCPSocket : this.UDPSocket;
    let socket = new SocketImpl(hostname, port);
    let stream = new ServerStream(stream_id, this, socket);
    const existing = Object.values(this.streams);
    const overLimit = (options.stream_limit_total !== -1 && existing.length >= options.stream_limit_total) ||
      (options.stream_limit_per_host !== -1 && existing.filter(item => item.socket.hostname === hostname).length >= options.stream_limit_per_host);
    this.streams[stream_id] = stream;

    (async () => {
      const resolved = {};
      let close_reason = overLimit ? close_reasons.ConnThrottled : await filter.is_stream_allowed(null, type, hostname, port, resolved);
      socket.resolved_ip = resolved.address;
      if (type === stream_types.UDP && this.wisp_version === 2 && !this.client_exts[UDPExtension.id]) close_reason = close_reasons.IncompatibleExtensions;
      if (close_reason) {
        await this.close_stream(stream_id, close_reason, true);
        return;
      }
      try {
        if (stream.closed) return;
        await stream.setup();
      }
      catch (error) {
        logging.warn(`(${this.conn_id}) upstream connection failed (${error.code || 'transport'})`);
        await this.close_stream(stream_id, close_reasons.NetworkError);
      }
    })().catch(() => this.ws.close(1011, 'Stream setup failed'));
  }

  async close_stream(stream_id, reason = null, quiet = false) {
    let stream = this.streams[stream_id];
    if (stream == null) {
      return;
    }
    if (reason && !quiet) {
      logging.debug(`(${this.conn_id}) closing stream ${stream_id} for reason ${reason}`);
    }
    delete this.streams[stream_id];
    await stream.close(reason);
  }

  async route_packet(buffer) {
    let packet = WispPacket.parse_all(buffer);
    let stream = this.streams[packet.stream_id];

    if (stream == null && packet.type == DataPayload.type) {
      logging.debug(`(${this.conn_id}) ignored DATA for a closed stream`);
      return;
    }

    if (packet.type === ConnectPayload.type) {
      let type_info = packet.payload.stream_type === stream_types.TCP ? "TCP" : "UDP";
      logging.debug(`(${this.conn_id}) opening ${type_info} stream ${packet.stream_id}`);
      this.create_stream(
        packet.stream_id,
        packet.payload.stream_type,
        packet.payload.hostname.trim(),
        packet.payload.port
      )
    }

    else if (packet.type === DataPayload.type) {
      await stream.put_data(packet.payload.data.bytes);
    }

    else if (packet.type == ContinuePayload.type) {
      logging.warn(`(${this.conn_id}) client sent a CONTINUE packet, this should never be possible`);
    }

    else if (packet.type == ClosePayload.type) {
      await this.close_stream(packet.stream_id, packet.payload.reason);
    }
  }

  async run() {
    while (true) {
      let data;
      data = await this.ws.recv();
      if (data == null) {
        break;
      }
      if (typeof data === "string") {
        logging.warn(`(${this.conn_id}) routing a packet failed - unexpected ws text frame`);
        continue;
      }

      try {
        await this.route_packet(new WispBuffer(new Uint8Array(data)));
      }
      catch (error) {
        logging.warn(`(${this.conn_id}) invalid Wisp packet`);
        this.ws.close(1002, 'Invalid Wisp packet');
        break;
      }
    }

    await this.cleanup();
  }

  async cleanup() {
    for (let stream_id of Object.keys(this.streams)) {
      await this.close_stream(stream_id);
    }
    clearInterval(this.ping_task);
    logging.info(`(${this.conn_id}) wisp connection closed`);
    this.ws.close();
  }
}
