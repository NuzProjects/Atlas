import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const WEEK = 7 * 24 * 60 * 60 * 1000;
export function createFaviconCache({ directory, fallbackPath, fetchImage = fetch }) {
  const pending = new Map();
  return async function favicon(domain) {
    domain = String(domain || '')
      .trim()
      .toLowerCase();
    if (!/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(domain)) throw new Error('Invalid favicon domain');
    if (pending.has(domain)) return pending.get(domain);
    const operation = (async () => {
      const key = createHash('sha256').update(domain).digest('hex');
      const imagePath = path.join(directory, key + '.image');
      const metadataPath = path.join(directory, key + '.json');
      let stale;
      try {
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
        const data = await fs.readFile(imagePath);
        stale = { data, contentType: metadata.contentType };
        if (Date.now() - metadata.savedAt < WEEK) return stale;
      } catch {}

      if (domain.includes('.') && !/^(?:localhost|127\.|0\.)/.test(domain)) {
        try {
          const response = await fetchImage(`https://icons.duckduckgo.com/ip3/${domain}.ico`, {
            signal: AbortSignal.timeout(5000),
          });
          const contentType = response.headers.get('content-type') || '';
          if (!response.ok || !contentType.startsWith('image/')) throw new Error('Icon unavailable');
          const data = Buffer.from(await response.arrayBuffer());
          if (!data.length || data.length > 2 * 1024 * 1024) throw new Error('Invalid icon size');
          await fs.mkdir(directory, { recursive: true });
          await fs.writeFile(imagePath, data);
          await fs.writeFile(metadataPath, JSON.stringify({ contentType, savedAt: Date.now() }));
          return { data, contentType };
        } catch {
          if (stale) return stale;
        }
      }
      return {
        data: await fs.readFile(fallbackPath),
        contentType: path.extname(String(fallbackPath)) === '.png' ? 'image/png' : 'image/svg+xml',
        fallback: true,
      };
    })();
    pending.set(domain, operation);
    try {
      return await operation;
    } finally {
      pending.delete(domain);
    }
  };
}
