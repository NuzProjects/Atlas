import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const iconDirectory = path.join(path.dirname(require.resolve('lucide-static/package.json')), 'icons');
const { version } = require('lucide-static/package.json');

const runtimeIcons = ['chevron-down', 'globe', 'history', 'rotate-cw', 'trash-2', 'x'];
const htmlFiles = ['public/index.html'];
const imageIcons = {
  'assets/tab-globe.svg': ['globe', '#9b9fa3'],
  'assets/atlas-history.svg': ['history', '#ffffff'],
};
const attributes =
  'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

function markup(name) {
  const file = path.join(iconDirectory, `${name}.svg`);
  if (!/^[a-z0-9-]+$/.test(name) || !fs.existsSync(file)) throw new Error(`Unknown Lucide icon: ${name}`);
  const svg = fs.readFileSync(file, 'utf8');
  return svg
    .slice(svg.indexOf('>', svg.indexOf('<svg')) + 1, svg.lastIndexOf('</svg>'))
    .replace(/\s*\n\s*/g, '')
    .replace(/\s+\/>/g, ' />')
    .trim();
}

async function writeFormatted(file, text) {
  const target = path.join(root, file);
  const options = await prettier.resolveConfig(target);
  fs.writeFileSync(target, await prettier.format(text, { ...options, filepath: target }));
}

const used = new Set(runtimeIcons);
for (const file of htmlFiles) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const updated = source.replace(
    /<svg\b([^>]*?)\bdata-icon="([a-z0-9-]+)"([^>]*)>[\s\S]*?<\/svg\s*>/g,
    (match, before, name, after) => {
      used.add(name);
      const kept = [...` ${before} ${after}`.matchAll(/\s((?:class|id|width|height|style)="[^"]*")/g)].map(
        found => found[1]
      );
      return `<svg ${[...kept, `data-icon="${name}"`, attributes].join(' ')}>${markup(name)}</svg>`;
    }
  );
  if (updated !== source) await writeFormatted(file, updated);
}

const table = [...used]
  .sort()
  .map(name => `  '${name}': '${markup(name)}',`)
  .join('\n');
const output = `/*! Icons from Lucide v${version} (https://lucide.dev), ISC License, Copyright (c) Lucide Icons and Contributors */
const ATLAS_ICONS = {
${table}
};
function atlasIcon(name, className = '') {
  return \`<svg class="\${className}" data-icon="\${name}" ${attributes}>\${ATLAS_ICONS[name] || ''}</svg>\`;
}
`;
await writeFormatted('public/atlas-icons.js', output);
for (const [file, [name, color]] of Object.entries(imageIcons)) {
  const image = `<svg xmlns="http://www.w3.org/2000/svg" ${attributes.replace('currentColor', color)}>${markup(name)}</svg>\n`;
  fs.writeFileSync(path.join(root, file), image);
}
console.log(`Generated ${used.size} Lucide icons.`);
