// Packages dist/ into attendly-vX.Y.Z.zip for upload to the Chrome Web Store.
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('[Attendly] dist/manifest.json not found. Run `npm run build` first.');
  process.exit(1);
}

const files = {};
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (!name.endsWith('.map'))
      files[relative(dist, full).split(sep).join('/')] = readFileSync(full);
  }
};
walk(dist);

const out = join(root, `attendly-v${version}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`[Attendly] wrote ${relative(root, out)} (${Object.keys(files).length} files)`);
