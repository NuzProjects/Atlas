import * as logging from "../logging.mjs";
import { AsyncQueue } from "../websocket.mjs";
import { options } from "./options.mjs";
import { net, dgram, dns } from "../compat.mjs";

export const is_node = (typeof process !== "undefined");

const dns_cache = new Map();
const dns_pending = new Map();
let dns_servers = null;
let resolver = null;

export function assert_on_node() {
  if (!is_node) {
    throw new Error("not running on node.js");
  }
}

function resolve4(hostname) {
  return resolver.resolve4(hostname);
}
function resolve6(hostname) {
  return resolver.resolve6(hostname);
}
async function resolve_with_fallback(resolve_first, resolve_after, hostname) {
  try {
    return (await resolve_first(hostname))[0];
  }
  catch {
    return (await resolve_after(hostname))[0];
  }
}

async function perform_lookup(hostname) {
  if (options.dns_method === "lookup") {
    let result = await dns.lookup(hostname, {order: options.dns_result_order});
    return result.address;
  }

  else if (options.dns_method === "resolve") {
    if (!resolver) resolver = new dns.Resolver();

    if (options.dns_servers !== dns_servers) {
      resolver.setServers(options.dns_servers || []);
      dns_servers = options.dns_servers;
    }

    if (options.dns_result_order === "verbatim" || options.dns_result_order === "ipv6first")
      return await resolve_with_fallback(resolve6, resolve4, hostname);
    else if (options.dns_result_order === "ipv4first")
      return await resolve_with_fallback(resolve4, resolve6, hostname);
    else
      throw new Error("Invalid result order. options.dns_result_order must be either 'ipv6first', 'ipv4first', or 'verbatim'.");
  }

  else if (typeof options.dns_method === "function") {
    return await options.dns_method(hostname);
  }

  throw new Error("Invalid DNS method. options.dns_method must either be 'lookup' or 'resolve'.");
}

export async function lookup_ip(hostname) {
  if (!is_node) {
    return hostname;
  }

  let ip_level = net.isIP(hostname);
  if (ip_level === 4 || ip_level === 6) {
    return hostname;
  }

  hostname = hostname.toLowerCase();
  let cache_entry = dns_cache.get(hostname);
  if (cache_entry && Date.now() - cache_entry.time < options.dns_ttl * 1000) {
    if (cache_entry.error)
      throw cache_entry.error
    return cache_entry.address;
  }

  if (dns_pending.has(hostname)) return dns_pending.get(hostname);
  const pending = (async () => {
    let timer;
    try {
      const address = await Promise.race([perform_lookup(hostname), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('DNS lookup timeout')), 10000);
      })]);
      if (!net.isIP(address)) throw new Error('DNS returned an invalid address');
      dns_cache.delete(hostname);
      if (dns_cache.size >= 1024) dns_cache.delete(dns_cache.keys().next().value);
      dns_cache.set(hostname, { time: Date.now(), address });
      return address;
    } finally { clearTimeout(timer); dns_pending.delete(hostname); }
  })();
  dns_pending.set(hostname, pending);
  return pending;
}

export class NodeTCPSocket {
  constructor(hostname, port) {
    assert_on_node();
    this.hostname = hostname;
    this.port = port;
    this.recv_buffer_size = 128;

    this.socket = null;
    this.paused = false;
    this.connected = false;
    this.closed = false;
    this.data_queue = new AsyncQueue(this.recv_buffer_size);
  }

  async connect() {
    let ip = this.resolved_ip || await lookup_ip(this.hostname);
    if (this.closed) throw new Error('TCP stream was closed before connecting');
    await new Promise((resolve, reject) => {
      const socket = this.socket = new net.Socket();
      const timer = setTimeout(() => socket.destroy(new Error('TCP connect timeout')), 15000);
      socket.setNoDelay(true);
      socket.on("connect", () => {
        if (this.closed) { socket.destroy(); reject(new Error('TCP stream was closed while connecting')); return; }
        this.connected = true;
        clearTimeout(timer);
        resolve();
      });
      socket.on("data", (data) => {
        if (!this.data_queue.put_now(data)) { socket.destroy(new Error('TCP receive queue exceeded')); return; }
        if (this.data_queue.size >= this.recv_buffer_size / 2) { socket.pause(); this.paused = true; }
      });
      socket.on("close", () => {
        if (!this.connected) reject(new Error('TCP connection closed before connecting'));
        this.connected = false;
        clearTimeout(timer);
        this.data_queue.close({ drain: true });
        this.closed = true;
        if (this.socket === socket) this.socket = null;
      });
      socket.on("error", (error) => {
        reject(error);
        clearTimeout(timer);
      });
      socket.on("end", () => {
        socket.destroy();
      });
      socket.connect({
        host: ip,
        port: this.port
      });
    });
  }

  async recv() {
    if (this.closed && this.data_queue.size === 0) return null;
    const data = await this.data_queue.get();
    this.resume();
    return data;
  }

  async send(data) {
    const socket = this.socket;
    if (this.closed || !socket || socket.destroyed || socket.writableEnded) return;
    await new Promise((resolve, reject) => {
      socket.write(data, error => error ? reject(error) : resolve());
    });
  }

  async close() {
    this.closed = true;
    this.connected = false;
    this.data_queue.close();
    this.socket?.destroy();
    this.socket = null;
  }

  pause() {
    if (this.socket && this.data_queue.size >= this.data_queue.max_size) {
      this.socket.pause();
      this.paused = true;
    }
  }
  resume() {
    if (!this.socket) return;
    if (this.paused && this.data_queue.size < this.recv_buffer_size / 2) {
      this.socket.resume();
      this.paused = false;
    }
  }
}

export class NodeUDPSocket {
  constructor(hostname, port) {
    assert_on_node();
    this.hostname = hostname;
    this.port = port;

    this.connected = false;
    this.closed = false;
    this.dropped_packets = 0;
    this.recv_buffer_size = 128;
    this.data_queue = new AsyncQueue(this.recv_buffer_size);
  }

  async connect() {
    let ip = this.resolved_ip || await lookup_ip(this.hostname);
    if (this.closed) throw new Error('UDP stream was closed before connecting');
    let ip_level = net.isIP(ip);
    await new Promise((resolve, reject) => {
      const socket = this.socket = dgram.createSocket(ip_level === 6 ? "udp6" : "udp4");
      socket.on("connect", () => {
        if (this.closed) { reject(new Error('UDP stream was closed while connecting')); return; }
        this.connected = true;
        resolve();
      });
      socket.on("message", (data) => {
        if (!this.data_queue.put_now(data)) this.dropped_packets++;
      });
      socket.on("error", error => {
        reject(error);
        this.close();
      });
      socket.on('close', () => {
        if (!this.connected) reject(new Error('UDP socket closed before connecting'));
        this.connected = false; this.closed = true;
        this.data_queue.close({ drain: true });
        if (this.socket === socket) this.socket = null;
      });
      socket.connect(this.port, ip);
    });
  }

  async recv() {
    return await this.data_queue.get();
  }

  async send(data) {
    if (this.closed || !this.connected || !this.socket) throw new Error('UDP stream is closed');
    await new Promise((resolve, reject) => this.socket.send(data, error => error ? reject(error) : resolve()));
  }

  async close() {
    this.closed = true;
    this.connected = false;
    this.data_queue.close();
    try { this.socket?.close(); } catch {}
    this.socket = null;
  }

  pause() {}
  resume() {}
}
