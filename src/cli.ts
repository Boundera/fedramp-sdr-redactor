#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { redact } from './redact.js';
import { TOOL_NAME, TOOL_VERSION } from './generated/meta.js';
import type { DatesMode, NumbersMode, RedactOptions, Report } from './types.js';

const HELP = `${TOOL_NAME} ${TOOL_VERSION}

Redact a FedRAMP Security Decision Record for public sharing.
Keeps statuses, FedRAMP identifiers, dates, and counts. Replaces narrative
text, links, and resource, account, run, and people identifiers.

Usage:
  sdr-redact redact <input.json|-> [options]

Options:
  -o, --out <file>          Write the redacted document here (default: stdout)
  --report <file>           Write the JSON report here
  --dates <mode>            keep | month | year | drop        (default: keep)
  --numbers <mode>          keep | coarse                      (default: keep)
  --keep-test-names         Keep the schema's list of test names verbatim
  --keep-values <p=v1,v2>   Keep exact values under one path (repeatable)
  --strip-unknown           Drop every key the schema does not define
  --map-out <file>          Write the token map (contains originals; keep private)
  -q, --quiet               No summary on stderr
  -h, --help                Show this help
  -v, --version             Show the version

Exit codes: 0 done, 1 bad arguments, 2 unreadable input.
`;

interface Args {
  command?: string;
  input?: string;
  out?: string;
  report?: string;
  dates?: string;
  numbers?: string;
  keepTestNames: boolean;
  keepValues: Record<string, string[]>;
  stripUnknown: boolean;
  mapOut?: string;
  quiet: boolean;
  help: boolean;
  version: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: string[]): Args {
  const a: Args = { keepTestNames: false, keepValues: {}, stripUnknown: false, quiet: false, help: false, version: false };
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i]!;
    if (!raw.startsWith('-') || raw === '-') {
      positional.push(raw);
      continue;
    }
    const eq = raw.indexOf('=');
    const flag = eq >= 0 ? raw.slice(0, eq) : raw;
    const take = (): string => {
      if (eq >= 0) return raw.slice(eq + 1);
      const next = argv[i + 1];
      if (next === undefined) throw new UsageError(`${flag} needs a value`);
      i += 1;
      return next;
    };
    switch (flag) {
      case '-o':
      case '--out':
        a.out = take();
        break;
      case '--report':
        a.report = take();
        break;
      case '--dates':
        a.dates = take();
        break;
      case '--numbers':
        a.numbers = take();
        break;
      case '--keep-test-names':
        a.keepTestNames = true;
        break;
      case '--keep-values': {
        const spec = take();
        const j = spec.indexOf('=');
        if (j <= 0) throw new UsageError('--keep-values expects <path>=<v1,v2>');
        const path = spec.slice(0, j);
        const values = spec
          .slice(j + 1)
          .split(',')
          .filter((v) => v !== '');
        a.keepValues[path] = [...(a.keepValues[path] ?? []), ...values];
        break;
      }
      case '--strip-unknown':
        a.stripUnknown = true;
        break;
      case '--map-out':
        a.mapOut = take();
        break;
      case '-q':
      case '--quiet':
        a.quiet = true;
        break;
      case '-h':
      case '--help':
        a.help = true;
        break;
      case '-v':
      case '--version':
        a.version = true;
        break;
      default:
        throw new UsageError(`Unknown option ${flag}`);
    }
  }
  a.command = positional[0];
  a.input = positional[1];
  return a;
}

function summarize(report: Report): string {
  const s = report.summary;
  const n = (k: string): number => s[k] ?? 0;
  const kept =
    n('kept-enum') + n('kept-fedramp-id') + n('kept-fedramp-url') + n('kept-date') + n('kept-version') +
    n('kept-number') + n('kept-literal') + n('kept-empty') + n('kept-redacted') + n('kept-by-option');
  const replaced =
    n('text') + n('token') + n('uri') + n('pseudonym-key') + n('masked-number') + n('coarsened-number') +
    n('coarsened-date') + n('dropped-date') + n('stripped');
  const sections = Object.entries(report.input.sections)
    .map(([k, v]) => `${v} ${k}`)
    .join(', ');
  const lines = [
    `${report.tool} ${report.version}`,
    `Input: ${report.input.bytes} bytes, ${report.input.looksLikeSdr ? 'looks like an SDR' : 'does not look like an SDR'}${sections ? `, ${sections}` : ''}`,
    `Kept ${kept} values: ${n('kept-enum')} schema words, ${n('kept-fedramp-id')} FedRAMP ids, ${n('kept-date')} dates, ${n('kept-number')} numbers`,
    `Replaced ${replaced} values: ${n('text')} texts, ${n('token')} identifiers, ${n('uri')} links, ${n('pseudonym-key')} keys, ${n('masked-number')} large numbers`,
  ];
  for (const w of report.warnings) lines.push(`Warning: ${w.code}${w.path ? ` at ${w.path}` : ''} (${w.count})`);
  if (report.candidates.length) lines.push(`Candidates to review: ${report.candidates.length} paths (see the report)`);
  return lines.join('\n');
}

function main(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    process.stderr.write(`${(e as Error).message}\n\n${HELP}`);
    return 1;
  }
  if (args.version) {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return 0;
  }
  if (args.help || args.command === undefined) {
    process.stdout.write(HELP);
    return args.help ? 0 : 1;
  }
  if (args.command !== 'redact' || args.input === undefined) {
    process.stderr.write(HELP);
    return 1;
  }
  let text: string;
  try {
    text = args.input === '-' ? readFileSync(0, 'utf8') : readFileSync(args.input, 'utf8');
  } catch (e) {
    process.stderr.write(`Cannot read ${args.input}: ${(e as Error).message}\n`);
    return 2;
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch (e) {
    process.stderr.write(`Input is not JSON: ${(e as Error).message}\n`);
    return 2;
  }
  const options: RedactOptions = {
    keepTestNames: args.keepTestNames,
    keepValues: args.keepValues,
    stripUnknown: args.stripUnknown,
    inputBytes: Buffer.byteLength(text, 'utf8'),
  };
  if (args.dates !== undefined) options.dates = args.dates as DatesMode;
  if (args.numbers !== undefined) options.numbers = args.numbers as NumbersMode;
  const result = redact(doc, options);
  const out = `${JSON.stringify(result.doc, null, 2)}\n`;
  if (args.out) writeFileSync(args.out, out);
  else process.stdout.write(out);
  if (args.report) writeFileSync(args.report, `${JSON.stringify(result.report, null, 2)}\n`);
  if (args.mapOut) {
    writeFileSync(args.mapOut, `${JSON.stringify(result.map, null, 2)}\n`);
    if (!args.quiet) process.stderr.write(`Token map written to ${args.mapOut}. It contains original values. Keep it private.\n`);
  }
  if (!args.quiet) {
    const wrote = [args.out, args.report].filter(Boolean).join(', ');
    process.stderr.write(`${summarize(result.report)}${wrote ? `\nWrote ${wrote}` : ''}\n`);
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
