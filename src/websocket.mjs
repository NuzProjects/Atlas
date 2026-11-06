import * as compat from './compat.mjs';
import { WispPacket } from './packet.mjs';

export function get_conn_id() {
  return compat.crypto.randomUUID().split('-')[0];
}

export class AsyncQueue {
  constructor(max_size) {
    this.max_size = max_size;
    this.queue = [];
    this.put_callbacks = [];
    this.get_callbacks = [];
    this.closed = false;
  }
  put_now(data) {
    if (this.closed || this.size >= this.max_size) return false;
    this.queue.push(data);
    this.get_callbacks.shift()?.();
    return true;
  }
  async put(data) {
    while (!this.closed) {
      if (this.put_now(data)) return true;
      await new Promise(resolve => this.put_callbacks.push(resolve));
    }
    return false;
  }
  get_now() {
    const data = this.queue.shift();
    this.put_callbacks.shift()?.();
    return data;
  }
  async get() {
    while (!this.size && !this.closed) await new Promise(resolve => this.get_callbacks.push(resolve));
    return this.size ? this.get_now() : null;
  }
  close({ drain = false } = {}) {
    this.closed = true;
    if (!drain) this.queue = [];
    this.get_callbacks.splice(0).forEach(resolve => resolve());
    this.put_callbacks.splice(0).forEach(resolve => resolve());
  }
  get size() {
    return this.queue.length;
  }
}

export class AsyncWebSocket {
  send_buffer_size = 1024 * 1024;
  constructor(ws) {
    this.ws = ws;
    this.connected = false;
    this.closed = false;
    this.queued_bytes = 0;
    this.data_queue = new AsyncQueue(256);
  }
  async connect() {
    this.ws.binaryType = 'arraybuffer';
    await new Promise((resolve, reject) => {
      this.ws.onopen = () => {
        this.connected = true;
        resolve();
      };
      this.ws.onmessage = event => {
        const bytes = event.data.byteLength ?? event.data.length ?? 0;
        if (
          typeof event.data === 'string' ||
          this.queued_bytes + bytes > 4 * 1024 * 1024 ||
          !this.data_queue.put_now(event.data)
        ) {
          this.close(1009, 'Receive queue exceeded');
          return;
        }
        this.queued_bytes += bytes;
        if (this.data_queue.size >= 128 || this.queued_bytes >= 2 * 1024 * 1024) this.ws.pause?.();
      };
      this.ws.onerror = () => {
        if (!this.connected) reject(new Error('WebSocket connection failed'));
      };
      this.ws.onclose = () => {
        this.closed = true;
        if (!this.connected) reject(new Error('WebSocket closed before connecting'));
        this.connected = false;
        this.data_queue.close({ drain: true });
      };
      if (this.ws.readyState === 1) {
        this.connected = true;
        resolve();
      } else if (this.ws.readyState >= 2) reject(new Error('WebSocket is closed'));
    });
  }
  async recv() {
    const data = await this.data_queue.get();
    if (data != null) this.queued_bytes -= data.byteLength ?? data.length ?? 0;
    if (this.data_queue.size < 128 && this.queued_bytes < 2 * 1024 * 1024) this.ws.resume?.();
    return data;
  }
  async send(data) {
    if (data instanceof WispPacket) data = data.serialize().bytes;
    if (this.closed || this.ws.readyState !== 1) throw new Error('WebSocket is closed');
    this.ws.send(data);
    const deadline = Date.now() + 30000;
    if (this.ws.bufferedAmount <= this.send_buffer_size) return;
    while (this.ws.bufferedAmount > this.send_buffer_size / 2) {
      if (this.closed || this.ws.readyState !== 1) throw new Error('WebSocket closed while draining');
      if (Date.now() > deadline) {
        this.close(1011, 'Send timeout');
        throw new Error('WebSocket send timeout');
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }
  close(code, reason) {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.data_queue.close();
    this.queued_bytes = 0;
    this.ws.resume?.();
    this.ws.close(code, reason);
  }
  get buffered_amount() {
    return this.ws.bufferedAmount;
  }
}
