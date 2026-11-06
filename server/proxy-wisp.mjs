import { Duplex } from 'node:stream';
import { close_reasons } from '../src/packet.mjs';

export function createWispDuplex(stream) {
  let remoteEnded = false;
  let timer;
  const touch = () => {
    clearTimeout(timer);
    if (socket.timeout > 0) timer = setTimeout(() => socket.emit('timeout'), socket.timeout).unref();
  };
  const socket = new Duplex({
    allowHalfOpen: false,
    read() {
      stream.resume();
    },
    write(chunk, encoding, callback) {
      touch();
      if (remoteEnded) {
        callback();
        return;
      }
      try {
        stream.send(chunk);
        stream.wait_for_drain().then(() => callback(), callback);
      } catch (error) {
        callback(error);
      }
    },
    destroy(error, callback) {
      clearTimeout(timer);
      try {
        stream.close();
      } catch {}
      callback(error);
    },
  });

  socket.setKeepAlive = socket.setNoDelay = socket.ref = socket.unref = () => socket;
  socket.timeout = 0;
  socket.setTimeout = (ms, callback) => {
    if (socket.destroyed) return socket;
    socket.timeout = ms;
    if (callback) {
      if (ms === 0) socket.removeListener('timeout', callback);
      else socket.once('timeout', callback);
    }
    touch();
    return socket;
  };
  stream.onmessage = bytes => {
    if (socket.destroyed) return;
    touch();
    if (!socket.push(Buffer.from(bytes))) stream.pause();
  };
  stream.onclose = reason => {
    if (socket.destroyed) return;
    if (reason !== close_reasons.Voluntary) {
      const error = new Error(`Wisp upstream closed (reason ${Number(reason)})`);
      error.code = 'ERR_WISP_UPSTREAM';
      socket.destroy(error);
      return;
    }
    remoteEnded = true;
    socket.push(null);
  };
  return socket;
}
