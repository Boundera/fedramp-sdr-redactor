import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redact } from '../src/index.js';
import type { RedactOptions, RedactResult } from '../src/index.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export function fixture(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(HERE, 'fixtures', 'sample-sdr.json'), 'utf8')) as Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Any = any;

export interface Run extends RedactResult {
  out: Any;
}

/** Redact with a fixed date so outputs are comparable. */
export function run(doc: unknown, options: RedactOptions = {}): Run {
  const r = redact(doc, { redactedAt: '2026-09-02', ...options });
  return { ...r, out: r.doc as Any };
}

export function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out);
  else if (typeof v === 'object' && v !== null) {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      collectStrings(x, out);
    }
  }
  return out;
}

function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/**
 * Structural comparison for invariant I1: same types, same array lengths, same
 * key sets except pseudonymized keys. Returns the mismatches as strings.
 */
export function shapeMismatches(a: unknown, b: unknown, path = ''): string[] {
  const out: string[] = [];
  if (jsonType(a) !== jsonType(b)) return [`${path || '(root)'}: type ${jsonType(a)} became ${jsonType(b)}`];
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) out.push(`${path}: length ${a.length} became ${b.length}`);
    for (let i = 0; i < Math.min(a.length, b.length); i += 1) out.push(...shapeMismatches(a[i], b[i], `${path}[]`));
    return out;
  }
  if (typeof a === 'object' && a !== null && typeof b === 'object' && b !== null) {
    const ak = Object.keys(a);
    const bk = Object.keys(b).filter((k) => !(path === '' && k === 'redaction'));
    if (ak.length !== bk.length) out.push(`${path || '(root)'}: ${ak.length} keys became ${bk.length}`);
    for (let i = 0; i < Math.min(ak.length, bk.length); i += 1) {
      const ka = ak[i]!;
      const kb = bk[i]!;
      if (ka !== kb && !/^redacted-key-\d+$/.test(kb)) out.push(`${path}: key ${JSON.stringify(ka)} became ${JSON.stringify(kb)}`);
      out.push(...shapeMismatches((a as Any)[ka], (b as Any)[kb], path ? `${path}.${kb}` : kb));
    }
  }
  return out;
}
