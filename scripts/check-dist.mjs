// Release guard, run in CI after `npm run build`:
// - the manifest requests exactly the permissions we document;
// - no shipped JavaScript contains network APIs or remote script loading.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const failures = [];

const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
const expect = (label, actual, wanted) => {
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    failures.push(`${label}: expected ${JSON.stringify(wanted)}, got ${JSON.stringify(actual)}`);
  }
};
expect('permissions', manifest.permissions, ['storage']);
expect('host_permissions', manifest.host_permissions, ['https://meet.google.com/*']);
expect('optional_permissions', manifest.optional_permissions, undefined);
expect(
  'content script matches',
  manifest.content_scripts?.flatMap((c) => c.matches),
  ['https://meet.google.com/*'],
);
if (!manifest.content_security_policy?.extension_pages?.includes("connect-src 'self'")) {
  failures.push('production CSP for extension pages is missing');
}

const FORBIDDEN = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bsendBeacon\b/,
  /\bnew\s+WebSocket\b/,
  /\bEventSource\b/,
  /\bimportScripts\s*\(\s*['"`]https?:/,
  /\beval\s*\(/,
  /\bnew\s+Function\s*\(/,
];
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
for (const file of walk(dist).filter((f) => f.endsWith('.js'))) {
  const code = readFileSync(file, 'utf8');
  for (const re of FORBIDDEN) {
    if (re.test(code)) failures.push(`${relative(root, file)} matches forbidden pattern ${re}`);
  }
}

if (failures.length) {
  console.error('[Attendly] dist check failed:\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log(
  '[Attendly] dist check passed: permissions as documented, no network APIs in shipped code.',
);
