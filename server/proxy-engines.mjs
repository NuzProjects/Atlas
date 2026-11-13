import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const packages = {
  scramjet: '@mercuryworkshop/scramjet',
  ultraviolet: '@titaniumnetwork-dev/ultraviolet',
  baremux: '@mercuryworkshop/bare-mux',
  epoxy: '@mercuryworkshop/epoxy-transport',
};
const files = {
  scramjet: ['scramjet.all.js', 'scramjet.sync.js', 'scramjet.wasm.wasm'],
  ultraviolet: ['uv.bundle.js', 'uv.client.js', 'uv.handler.js', 'uv.sw.js'],
  baremux: ['index.js', 'worker.js'],
  epoxy: ['index.mjs'],
};
export const proxyEngineAssets = [
  '/atlas-engine-config.js',
  '/atlas-scramjet-sw.js',
  '/atlas-ultraviolet-sw.js',
  ...Object.entries(files).flatMap(([name, entries]) => entries.map(file => '/vendor/' + name + '/' + file)),
];

const validators = new Map();
async function validator(filePath, prefixPath) {
  const stat = await fs.stat(filePath);
  const prefixStat = prefixPath ? await fs.stat(prefixPath) : null;
  const key = [filePath, stat.size, stat.mtimeMs, prefixStat?.size, prefixStat?.mtimeMs].join('|');
  let etag = validators.get(key);
  if (!etag) {
    const hash = createHash('sha256');
    if (prefixPath) hash.update(await fs.readFile(prefixPath)).update('\n');
    etag =
      '"' +
      hash
        .update(await fs.readFile(filePath))
        .digest('base64url')
        .slice(0, 27) +
      '"';
    validators.set(key, etag);
  }
  return etag;
}
const normalizeEtag = value =>
  value
    .trim()
    .replace(/^W\//, '')
    .replace(/-(?:gzip|zstd|br)"$/, '"');
export function matchesEtag(header, etag) {
  return String(header || '')
    .split(',')
    .some(value => value.trim() === '*' || normalizeEtag(value) === etag);
}

export async function createProxyEngines(root, urlCodec) {
  for (const [name, entries] of Object.entries(files))
    for (const file of entries) {
      try {
        await fs.access(path.join(root, 'node_modules', packages[name], 'dist', file));
      } catch {
        throw new Error('Missing proxy engine asset ' + name + '/' + file + '. Run npm ci before starting Atlas.');
      }
    }
  const state = path.join(root, '.cache', 'engine-url.json');
  let descriptor;
  try {
    descriptor = JSON.parse(await fs.readFile(state, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error;
  }
  if (
    !descriptor ||
    !/^[A-Za-z0-9_-]{22}$/.test(descriptor.id) ||
    !/^[A-Za-z0-9_-]{43}$/.test(descriptor.key) ||
    !Number.isInteger(descriptor.expires) ||
    descriptor.expires < Date.now() / 1000 + 3600
  ) {
    descriptor = urlCodec.issue();
    await fs.writeFile(state, JSON.stringify(descriptor), { mode: 0o600 });
  }
  const value = JSON.stringify(descriptor);
  const config = `globalThis.AtlasEngineConfig={codec:{encode:function(url){if(!url)return url;return globalThis.AtlasUrlCrypto.seal({url:String(url)},${value});},decode:function(token){if(!token)return token;const index=token.search(/[?#]/);const suffix=index<0?'':token.slice(index);token=index<0?token:token.slice(0,index);return globalThis.AtlasUrlCrypto.open(token,${value}).url+suffix;}}};\nself.__uv$config={prefix:'/engine/ultraviolet/',encodeUrl:AtlasEngineConfig.codec.encode,decodeUrl:AtlasEngineConfig.codec.decode,handler:'/vendor/ultraviolet/uv.handler.js',client:'/vendor/ultraviolet/uv.client.js',bundle:'/vendor/ultraviolet/uv.bundle.js',config:'/atlas-engine-config.js',sw:'/vendor/ultraviolet/uv.sw.js'};`;
  return async function handle(req, res, url) {
    if (url.pathname === '/atlas-engine-config.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      res.end(config);
      return true;
    }
    const match = /^\/vendor\/(scramjet|ultraviolet|baremux|epoxy)\/([^/]+)$/.exec(url.pathname);
    if (!match || !files[match[1]].includes(match[2])) return false;
    const [, name, file] = match;
    const filePath = path.join(root, 'node_modules', packages[name], 'dist', file);
    const prefixPath =
      file === 'scramjet.all.js' || file === 'uv.bundle.js' ? path.join(root, 'public', 'atlas-url-crypto.js') : null;
    const etag = await validator(filePath, prefixPath);
    const headers = {
      'Content-Type': file.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
      'Cache-Control': 'public, max-age=3600',
      'Cross-Origin-Resource-Policy': 'same-origin',
      ETag: etag,
    };
    if (matchesEtag(req.headers['if-none-match'], etag)) {
      res.writeHead(304, headers);
      res.end();
      return true;
    }
    const body = await fs.readFile(filePath);
    const prefix = prefixPath ? await fs.readFile(prefixPath) : null;
    res.writeHead(200, headers);
    if (prefix) res.write(prefix + '\n');
    res.end(body);
    return true;
  };
}
