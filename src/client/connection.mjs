import * as compat from "../compat.mjs";

import {
  packet_classes,
  packet_types,
  stream_types,
  WispBuffer,
  WispPacket,
  ConnectPayload,
  DataPayload,
  ClosePayload,
  InfoPayload
} from "../packet.mjs";

import { MOTDExtension, UDPExtension, serialize_extensions, parse_extensions } from "../extensions.mjs";

class ClientStream {
  constructor(hostname, port, websocket, connection, stream_id, stream_type, buffer_size) {
    this.hostname = hostname;
    this.port = port;
    this.ws = websocket;
    this.connection = connection;
    this.stream_id = stream_id;
    this.stream_type = stream_type;
    this.buffer_size = buffer_size;
    this.send_buffer = [];
    this.queued_bytes = 0;
    this.open = true;

    this.onopen = () => {};
    this.onclose = () => {};
    this.onmessage = () => {};
  }

  send(data) {
    if (!this.open) throw new Error('Wisp stream is closed');
    if (!(data instanceof Uint8Array)) data = new Uint8Array(data);
    if (data.byteLength > 65536 && this.stream_type === stream_types.TCP) {
      for (let offset = 0; offset < data.byteLength; offset += 65536) this.send(data.subarray(offset, offset + 65536));
      return;
    }
    if (data.byteLength > 65536) throw new Error('UDP datagram is too large');
    if (this.ws.readyState != null && this.ws.readyState !== 1) throw new Error('Wisp WebSocket is closed');
    if ((this.ws.bufferedAmount || 0) > 8 * 1024 * 1024) throw new Error('Wisp connection send buffer exceeded');

    if (this.buffer_size > 0 || this.stream_type === stream_types.UDP) {
      let packet = new WispPacket({
        type: packet_types.DATA,
        stream_id: this.stream_id,
        payload: new DataPayload({
          data: new WispBuffer(data)
        })
      });
      this.ws.send(packet.serialize().bytes);
      if (this.stream_type === stream_types.TCP) this.buffer_size--;
    }
    else {
      if (this.queued_bytes + data.byteLength > 4 * 1024 * 1024) throw new Error('Wisp stream send buffer exceeded');
      this.send_buffer.push(data.slice());
      this.queued_bytes += data.byteLength;
    }
  }

  continue_received(buffer_size) {
    if (buffer_size > 65536) throw new Error('Invalid Wisp flow-control credit');
    this.buffer_size = buffer_size;

    while (this.buffer_size > 0 && this.send_buffer.length > 0) {
      const data = this.send_buffer.shift();
      this.queued_bytes -= data.byteLength;
      this.send(data);
    }
  }

  close(reason = 0x01) {
    if (!this.open) return;
    let packet = new WispPacket({
      type: packet_types.CLOSE,
      stream_id: this.stream_id,
      payload: new ClosePayload({
        reason: reason
      })
    });
    this.open = false;
    this.send_buffer = [];
    this.queued_bytes = 0;
    delete this.connection.active_streams[this.stream_id];
    this.resume();
    if (this.ws.readyState == null || this.ws.readyState === 1) this.ws.send(packet.serialize().bytes);
  }

  async wait_for_drain() {
    const deadline = Date.now() + 30000;
    while (this.send_buffer.length || this.ws.bufferedAmount > 1024 * 1024) {
      if (!this.open) throw new Error('Wisp stream closed while draining');
      if (Date.now() > deadline) throw new Error('Wisp stream send timeout');
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  pause() { this.connection.paused_streams?.add(this.stream_id); this.ws.pause?.(); }
  resume() {
    this.connection.paused_streams?.delete(this.stream_id);
    if (!this.connection.paused_streams?.size) this.ws.resume?.();
  }
}

export class ClientConnection {
  constructor(wisp_url, {wisp_version, wisp_extensions} = {}) {
    if (!wisp_url.endsWith("/")) {
      throw new TypeError("wisp endpoints must end with a trailing forward slash");
    }

    this.wisp_url = wisp_url;
    this.wisp_version = wisp_version || 2;
    this.wisp_extensions = wisp_extensions || null;

    this.max_buffer_size = null;
    this.active_streams = {};
    this.paused_streams = new Set();
    this.connected = false;
    this.connecting = false;
    this.next_stream_id = 1;

    this.server_exts = {};
    this.client_exts = {};
    this.info_received = false;
    this.server_motd = null;
    this.udp_enabled = true;

    this.onopen = () => {};
    this.onclose = () => {};
    this.onerror = () => {};
    this.onmessage = () => {};

    if (this.wisp_version === 2 && this.wisp_extensions === null) {
      this.add_extensions();
    }

    this.connect_ws();
  }

  add_extensions() {
    this.wisp_extensions = [];
    this.wisp_extensions.push(new UDPExtension({client_config: {}}));
    this.wisp_extensions.push(new MOTDExtension({client_config: {}}));
  }

  connect_ws() {
    this.info_received = false;
    this.server_exts = {}; this.client_exts = {};
    this.udp_enabled = this.wisp_version === 1;
    let subprotocol = this.wisp_version === 2 ? "wisp-v2" : undefined;
    this.ws = new compat.WebSocket(this.wisp_url, subprotocol);
    this.ws.binaryType = "arraybuffer";
    this.connecting = true;
    const ws = this.ws;
    clearTimeout(this.handshake_timer);
    this.handshake_timer = setTimeout(() => {
      if (this.ws !== ws || this.connected) return;
      this.cleanup(); ws.close(); this.onerror(new Error('Wisp handshake timeout'));
    }, 10000);
    this.handshake_timer.unref?.();

    this.ws.onmessage = (event) => {
      if (this.ws !== ws) return;
      try { this.on_ws_msg(event); }
      catch { this.cleanup(); ws.close(1002, 'Invalid Wisp packet'); this.onerror(new Error('Invalid Wisp packet')); return; }
      if (this.connected && this.connecting) {
        this.connecting = false;
        clearTimeout(this.handshake_timer);
        this.onopen();
      }
    };
    this.ws.onclose = () => {
      if (this.ws !== ws) return;
      this.cleanup();
      this.onclose();
    };
    this.ws.onerror = () => {
      if (this.ws !== ws) return;
      if (this.wisp_version === 2 && this.connecting && !this.info_received) {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
        this.cleanup();
        this.wisp_version = 1;
        this.connect_ws();
        return;
      }
      this.cleanup();
      this.onerror();
    };
  }

  on_ws_msg(event) {
    let buffer = new WispBuffer(new Uint8Array(event.data));
    if (buffer.size < WispPacket.min_size) {
      throw new Error('Wisp packet is too short');
    }
    let packet = WispPacket.parse_all(buffer);
    let stream = this.active_streams[packet.stream_id];
    if (packet.stream_id === 0 && this.connecting) {
      if (packet.type === packet_types.CONTINUE) {
        if (!packet.payload.buffer_remaining || packet.payload.buffer_remaining > 65536) throw new Error('Invalid initial Wisp credit');
        this.max_buffer_size = packet.payload.buffer_remaining;
        this.connected = true;
        if (!this.info_received) {
          this.wisp_version = 1;
        }
      }

      if (packet.type === packet_types.INFO && this.wisp_version === 2) {
        if (packet.payload.major_ver !== 2 || this.info_received) throw new Error('Invalid Wisp version');
        let server_extensions = parse_extensions(packet.payload.extensions, this.wisp_extensions, "server");
        for (let server_ext of server_extensions) {
          for (let client_ext of this.wisp_extensions) {
            if (server_ext.id === client_ext.id) {
              this.server_exts[server_ext.id] = server_ext;
              this.client_exts[client_ext.id] = client_ext;
            }
          }
        }

        this.info_received = true;
        this.server_motd = this.server_exts[MOTDExtension.id]?.payload?.message;
        this.udp_enabled = !!this.server_exts[UDPExtension.id];

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
        this.ws.send(info_packet.serialize().bytes);
      }
      return;
    }

    if (typeof stream === "undefined") {
      if (packet.type === packet_types.CLOSE) return;
      console.warn(`wisp client warning: received a ${packet_classes[packet.type].name} packet for a stream which doesn't exist`);
      return;
    }

    if (packet.type === packet_types.DATA) {
      stream.onmessage(packet.payload_bytes.bytes);
    }

    else if (packet.type === packet_types.CONTINUE) {
      stream.continue_received(packet.payload.buffer_remaining);
    }

    else if (packet.type === packet_types.CLOSE) {
      this.close_stream(stream, packet.payload.reason);
    }

    else {
      console.warn(`wisp client warning: received an invalid packet of type ${packet.type}`);
    }
  }

  close() {
    this.cleanup();
    this.ws.close();
  }

  cleanup() {
    clearTimeout(this.handshake_timer);
    this.connected = false;
    this.connecting = false;
    for (let stream_id of Object.keys(this.active_streams)) {
      this.close_stream(this.active_streams[stream_id], 0x03);
    }
  }

  create_stream(hostname, port, type=0x01) {
    if (!this.connected) throw new Error('Wisp connection is not ready');
    if (this.next_stream_id > 0xffffffff) throw new Error('Wisp stream IDs exhausted; reconnect required');
    let stream_type = type;
    if (typeof stream_type === "string")
      stream_type = type === "udp" ? stream_types.UDP : stream_types.TCP;

    if (stream_type == stream_types.UDP && !this.udp_enabled) {
      throw new Error("udp is not enabled for this wisp connection");
    }

    const stream_id = this.next_stream_id++;
    const stream = new ClientStream(hostname, port, this.ws, this, stream_id, stream_type, this.max_buffer_size);
    this.active_streams[stream_id] = stream;
    stream.open = this.connected;

    const packet = new WispPacket({
      type: packet_types.CONNECT,
      stream_id: stream_id,
      payload: new ConnectPayload({
        stream_type: stream_type,
        port: port,
        hostname: hostname
      })
    });
    this.ws.send(packet.serialize().bytes);
    return stream;
  }

  close_stream(stream, reason) {
    stream.resume();
    stream.open = false;
    stream.send_buffer = [];
    stream.queued_bytes = 0;
    delete this.active_streams[stream.stream_id];
    stream.onclose(reason);
  }
}

