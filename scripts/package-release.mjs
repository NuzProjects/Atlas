import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { buildInfo } from '../server/proxy-build.mjs';
export async function packageRelease(
  root = process.cwd(),
  output = path.join(root, 'artifacts', 'atlas-release.tar.gz')
) {
  const names = [
    'LICENSE',
    'package.json',
    'package-lock.json',
    'server.mjs',
    'server',
    'public',
    'src',
    'assets',
    'dist',
    'deploy/health.mjs',
  ];
  const files = [];
  async function walk(relative) {
    const stat = await fs.lstat(path.join(root, relative));
    if (stat.isSymbolicLink()) throw new Error('Release contains a symbolic link');
    if (stat.isDirectory()) {
      for (const name of await fs.readdir(path.join(root, relative))) await walk(relative + '/' + name);
    } else if (stat.isFile()) {
      if (/(?:^|\/)(?:\.env|\.git|\.cache)|\.(?:key|pem|pfx|db|sqlite|secrets|log)$/i.test(relative))
        throw new Error('Release contains a forbidden file');
      files.push(relative);
    }
  }
  for (const name of names) await walk(name);
  await fs.mkdir(path.dirname(output), { recursive: true });

  const info = buildInfo(root);
  const buildRoot = path.join(path.dirname(output), 'release-runtime');
  await fs.mkdir(buildRoot, { recursive: true });
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(buildRoot, file)), { recursive: true });
    await fs.copyFile(path.join(root, file), path.join(buildRoot, file));
  }
  await fs.writeFile(path.join(buildRoot, 'build-info.json'), JSON.stringify(info) + '\n');
  files.push('build-info.json');

  await fs.writeFile(
    path.join(buildRoot, 'index.html'),
    '<!doctype html><!-- Atlas application: public/index.html -->\n'
  );
  files.push('index.html');
  const manifest = path.join(path.dirname(output), 'release-files.txt');
  await fs.writeFile(manifest, files.sort().join('\n') + '\n');
  const result = spawnSync('tar', ['-czf', output, '-C', buildRoot, '-T', manifest], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('Release packaging failed: ' + result.stderr);
  const digest = createHash('sha256')
    .update(await fs.readFile(output))
    .digest('hex');
  await fs.writeFile(output + '.sha256', digest + '\n');
  console.log(`Release packaged: ${files.length} files, SHA-256 ${digest}`);
  return { output, digest, files };
}
if (process.argv[1]?.endsWith('package-release.mjs')) await packageRelease();
