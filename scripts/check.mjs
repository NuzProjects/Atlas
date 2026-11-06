import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
const ignored = new Set(['.git', 'node_modules', 'artifacts', 'assets', 'dist']);
const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(?:m?js|html|json|yml|sh)$/.test(file)) files.push(file);
  }
}
walk('.');
let failed = false,
  checked = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (/\.(?:m?js)$/.test(file)) {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) {
      console.error(result.stderr);
      failed = true;
    }
    checked++;
  }
  if (file.endsWith('.html'))
    for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc=/.test(match[1])) continue;
      try {
        new vm.Script(match[2], { filename: file });
      } catch (error) {
        console.error(error.message);
        failed = true;
      }
      checked++;
    }

  if (
    !file.startsWith('tests' + path.sep) &&
    /(?:\b(?:gsk|ghp)_[A-Za-z0-9]{20,}|-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----)/.test(text)
  ) {
    console.error('Credential-like material detected in ' + file);
    failed = true;
  }
}
console.log(`Static checks: ${checked} JavaScript sources and inline scripts checked.`);
if (failed) process.exit(1);
