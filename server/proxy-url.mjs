import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
const MAX_TOKEN = 16000;
export async function loadUrlKey(file) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    const key = await fs.readFile(file);
    if (key.length !== 32) throw new Error('Invalid URL key file');
    return key;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const temporary = file + '.' + randomBytes(8).toString('hex');
  await fs.writeFile(temporary, randomBytes(32), { flag: 'wx', mode: 0o600 });
  try {
    await fs.link(temporary, file);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  } finally {
    await fs.unlink(temporary);
  }
  const key = await fs.readFile(file);
  if (key.length !== 32) throw new Error('Invalid URL key file');
  return key;
}
export function createUrlCodec(master, { now = Date.now } = {}) {
  if (master.length !== 32) throw new Error('Invalid URL encryption key');
  const derive = header =>
    createHmac('sha256', master)
      .update('atlas-url|' + header)
      .digest();
  function issue() {
    const id = randomBytes(16).toString('base64url'),
      expires = Math.floor(now() / 1000) + 604800;
    const header = '1.' + expires + '.' + id;
    return { id, expires, key: derive(header).toString('base64url') };
  }
  function seal(value, descriptor = issue()) {
    const header = '1.' + descriptor.expires + '.' + descriptor.id,
      nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', derive(header), nonce);
    cipher.setAAD(Buffer.from(header));
    const bytes = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final(), cipher.getAuthTag()]);
    return header + '.' + nonce.toString('base64url') + '.' + bytes.toString('base64url');
  }
  function open(token) {
    try {
      if (typeof token !== 'string' || token.length > MAX_TOKEN) throw new Error();
      const parts = token.split('.');
      if (
        parts.length !== 5 ||
        parts[0] !== '1' ||
        !/^\d{10}$/.test(parts[1]) ||
        !/^[A-Za-z0-9_-]{22}$/.test(parts[2]) ||
        !/^[A-Za-z0-9_-]{16}$/.test(parts[3]) ||
        !/^[A-Za-z0-9_-]{24,}$/.test(parts[4])
      )
        throw new Error();
      if (Number(parts[1]) <= Math.floor(now() / 1000)) throw new Error();
      const header = parts.slice(0, 3).join('.'),
        bytes = Buffer.from(parts[4], 'base64url');
      const decipher = createDecipheriv('aes-256-gcm', derive(header), Buffer.from(parts[3], 'base64url'));
      decipher.setAAD(Buffer.from(header));
      decipher.setAuthTag(bytes.subarray(-16));
      const value = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0, -16)), decipher.final()]).toString());
      if (!value || typeof value.url !== 'string' || value.url.length > 4096) throw new Error();
      const url = new URL(value.url);
      if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password) throw new Error();
      return value;
    } catch {
      throw new Error('Invalid or expired proxy address');
    }
  }
  return { issue, seal, open };
}
