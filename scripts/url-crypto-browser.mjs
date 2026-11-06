import { gcm } from '@noble/ciphers/aes.js';
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
const encode = bytes =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const decode = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), char => char.charCodeAt(0));
export function seal(value, descriptor) {
  if (typeof value.url !== 'string' || value.url.length > 4096) throw new Error('Invalid proxy address');
  const header = '1.' + descriptor.expires + '.' + descriptor.id,
    nonce = crypto.getRandomValues(new Uint8Array(12));
  const bytes = gcm(decode(descriptor.key), nonce, encoder.encode(header)).encrypt(
    encoder.encode(JSON.stringify(value))
  );
  return header + '.' + encode(nonce) + '.' + encode(bytes);
}
export function open(token, descriptor) {
  const parts = token.split('.');
  if (parts.length !== 5 || parts[0] !== '1' || parts[1] !== String(descriptor.expires) || parts[2] !== descriptor.id)
    throw new Error('Address belongs to another document');
  return JSON.parse(
    decoder.decode(
      gcm(decode(descriptor.key), decode(parts[3]), encoder.encode(parts.slice(0, 3).join('.'))).decrypt(
        decode(parts[4])
      )
    )
  );
}
