import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

export function buildInfo(root) {
  try {
    const info = JSON.parse(readFileSync(path.join(root, 'build-info.json'), 'utf8'));
    if (/^[a-f0-9]{40}$/.test(info.revision)) return { revision: info.revision, modified: false };
  } catch {}
  try {
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const modified = !!execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[a-f0-9]{40}$/.test(revision)) return { revision, modified };
  } catch {}
  return { revision: null, modified: false };
}
