/**
 * After `vite build web`: hash the built JavaScript, print the hash into the
 * page footer, and write BUNDLE_SHA256.txt beside it. The footer hash covers
 * every .js file under dist-web/assets, sorted by name and concatenated. A
 * deploy is verified by comparing the served files against this list.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist-web');
const ASSETS = join(DIST, 'assets');

const sha256 = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex');

const js = readdirSync(ASSETS)
  .filter((f) => f.endsWith('.js'))
  .sort();
if (js.length === 0) throw new Error('dist-web/assets has no JavaScript; run `vite build web` first');

const combined = createHash('sha256');
const lines: string[] = [];
for (const f of js) {
  const buf = readFileSync(join(ASSETS, f));
  combined.update(buf);
  lines.push(`${sha256(buf)}  assets/${f}`);
}
const all = combined.digest('hex');
lines.push(`${all}  (every .js above, sorted by name, concatenated; shown in the page footer)`);

const indexPath = join(DIST, 'index.html');
const html = readFileSync(indexPath, 'utf8');
if (!html.includes('__BUNDLE_HASH__')) throw new Error('index.html has no __BUNDLE_HASH__ placeholder');
writeFileSync(indexPath, html.replace('__BUNDLE_HASH__', all));
writeFileSync(join(DIST, 'BUNDLE_SHA256.txt'), `${lines.join('\n')}\n`);
console.log(`bundle sha256 ${all}`);
