export const global_this = typeof globalThis === 'undefined' ? window : globalThis;

export const WebSocket = global_this.WebSocket;
export const crypto = global_this.crypto;
export const WebSocketServer = null;
export const net = null;
export const dgram = null;
export const dns = null;
export const http = null;
