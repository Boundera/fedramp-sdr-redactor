/**
 * Invariant I5, checked on the built page: no network capability, no
 * third-party script or stylesheet, and the Content Security Policy present.
 * Exit 1 on any finding.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist-web');
const NETWORK = /\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts|serviceWorker)\b/g;
const TAG = /<(script|link)\b[^>]*>/gi;
const EXTERNAL_REF = /\b(src|href)\s*=\s*["']?(https?:)?\/\//i;
const CANONICAL = /\brel\s*=\s*["']?canonical\b/i;

/** A script or a link that would load something from another origin. A canonical link loads nothing. */
function loadsExternal(html: string): boolean {
  for (const m of html.matchAll(TAG)) {
    if (EXTERNAL_REF.test(m[0]) && !CANONICAL.test(m[0])) return true;
  }
  return false;
}

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...files(p));
    else out.push(p);
  }
  return out;
}

const findings: string[] = [];
const all = files(DIST);
for (const f of all) {
  if (!/\.(js|html)$/.test(f)) continue;
  const text = readFileSync(f, 'utf8');
  const rel = relative(ROOT, f);
  for (const m of text.matchAll(NETWORK)) {
    const at = m.index ?? 0;
    findings.push(`${rel}: "${m[0]}" near "${text.slice(Math.max(0, at - 40), at + 40).replace(/\s+/g, ' ')}"`);
  }
  if (f.endsWith('.html')) {
    if (loadsExternal(text)) findings.push(`${rel}: loads a script or stylesheet from another origin`);
    if (!text.includes('http-equiv="Content-Security-Policy"')) findings.push(`${rel}: no Content-Security-Policy meta tag`);
    if (!text.includes("connect-src 'none'")) findings.push(`${rel}: CSP does not refuse every connection`);
    if (text.includes('__BUNDLE_HASH__')) findings.push(`${rel}: bundle hash was not stamped`);
  }
}
if (findings.length) {
  console.error('web bundle check failed:');
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`web bundle check passed (${all.length} files)`);
