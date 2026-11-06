import { createGunzip, createInflate, createBrotliDecompress } from 'node:zlib';

export function decodeResponse(response) {
  const factories = { gzip: createGunzip, 'x-gzip': createGunzip, deflate: createInflate, br: createBrotliDecompress };
  const encodings = String(response.headers['content-encoding'] || '')
    .toLowerCase()
    .split(',')
    .map(value => value.trim())
    .filter(value => value && value !== 'identity');
  if (encodings.some(value => !factories[value])) throw new Error('Unsupported upstream content encoding');
  let body = response;
  for (const encoding of encodings.reverse()) {
    const previous = body,
      decoder = factories[encoding]();
    previous.once('error', error => decoder.destroy(error));
    body = previous.pipe(decoder);
  }
  if (body !== response) {
    response.once('aborted', () => body.destroy(new Error('Upstream response was interrupted')));
    delete response.headers['content-encoding'];
    delete response.headers['content-length'];
  }
  return body;
}
