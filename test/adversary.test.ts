import { describe, expect, it } from 'vitest';
import { SAFE_URL_PREFIX } from '../src/index.js';
import { collectStrings, fixture, run, shapeMismatches } from './helpers.js';
import type { Any } from './helpers.js';

const ENUM = new Set(['Implemented', 'Not Implemented', 'Partially Implemented', 'Log', 'Report', 'Screenshot', 'Configuration', 'Policy', 'Procedure', 'Audit Record']);
const ID = /^([A-Z]{3}-[A-Z]{3}-[A-Z]{3}|KSI-[A-Z]{2,4}-[A-Z0-9]{1,4}|[A-Z]{2}-\d{1,2}(\(\d{1,2}\))?|[a-z]{2}-\d{1,2}(\.\d{1,2})?(_(odp|prm)([._]\d{1,2})?)?)$/;
const DATE = /^\d{4}-\d{2}-\d{2}/;
const VERSION = /^v?\d+(\.\d+){1,3}$/;

describe('adversary cases', () => {
  it('A1 an account identifier used as an object key becomes a pseudonymized key', () => {
    const r = run(fixture());
    const keys = Object.keys(r.out.accountsInScope);
    expect(keys).toEqual(['redacted-key-1', 'redacted-key-2']);
    expect(JSON.stringify(r.out)).not.toContain('123456789012');
    expect(r.report.paths.find((p) => p.path === 'accountsInScope.{key}.alias')?.actions.token).toBe(2);
  });

  it('A2 a resource name repeated forty-six times becomes one token; repetition never keeps it', () => {
    const doc = { items: Array.from({ length: 46 }, () => ({ resourceName: 'payments-primary' })) };
    const r = run(doc);
    const names = new Set(r.out.items.map((i: Any) => i.resourceName));
    expect(names).toEqual(new Set(['token-1']));
    expect(JSON.stringify(r.out)).not.toContain('payments-primary');
  });

  it('A3 a lower-case status is normalized and reported; N/A under a status key is replaced and warned', () => {
    const r = run(fixture());
    expect(r.out.securityControls[0].controlImplementationStatus).toBe('Implemented');
    expect(r.report.paths.find((p) => p.path === 'securityControls[].controlImplementationStatus')?.actions).toEqual({ 'kept-enum': 1, 'normalized-enum': 1 });
    const na = run({ keySecurityIndicators: [{ ksiId: 'KSI-IAM-MFA', ksiImplementationStatus: 'N/A' }] });
    expect(na.out.keySecurityIndicators[0].ksiImplementationStatus).toBe('token-1');
    expect(na.report.warnings).toContainEqual({ code: 'status-not-in-schema', path: 'keySecurityIndicators[].ksiImplementationStatus', count: 1 });
  });

  it('A4 an ARN inside a statement disappears with the statement', () => {
    const r = run(fixture());
    const text = JSON.stringify(r.out);
    expect(text).not.toContain('arn:aws');
    expect(text).not.toContain('example-cloud.test');
    expect(text).not.toContain('Alex Example');
    expect(text).not.toContain('555-0143');
    expect(r.out.keySecurityIndicators[0].ksiEvidence[2].evidenceDescription).toMatch(/^\[redacted text #\d+, \d+ chars\]$/);
  });

  it('A5 a two-megabyte data URI becomes a placeholder and raises large-text', () => {
    const doc = { keySecurityIndicators: [{ ksiEvidence: [{ evidenceType: 'Screenshot', evidenceText: `data:image/png;base64,${'A'.repeat(2_000_000)}` }] }] };
    const r = run(doc);
    expect(r.out.keySecurityIndicators[0].ksiEvidence[0].evidenceText).toBe('https://redacted.invalid/1');
    expect(r.report.warnings).toContainEqual({ code: 'large-text', path: 'keySecurityIndicators[].ksiEvidence[].evidenceText', count: 1 });
  });

  it('A6 a redacted document run again is byte-identical except redaction.previous', () => {
    const first = run(fixture());
    const second = run(first.out);
    const { previous: p1, ...m1 } = first.out.redaction;
    const { previous: p2, ...m2 } = second.out.redaction;
    expect(p1).toEqual([]);
    expect(p2).toEqual([{ tool: m1.tool, version: m1.version, redactedAt: m1.redactedAt, options: m1.options, schemaSeen: m1.schemaSeen }]);
    expect(m2).toEqual(m1);
    const strip = (d: Any): Any => {
      const { redaction: _r, ...rest } = d;
      return rest;
    };
    expect(JSON.stringify(strip(second.out))).toBe(JSON.stringify(strip(first.out)));
  });

  it('A7 a package.json runs through and is reported as not an SDR', () => {
    const doc = { name: 'pkg', version: '1.0.0', scripts: { test: 'vitest run' }, dependencies: { ajv: '^8.0.0' } };
    const r = run(doc);
    expect(r.report.input.looksLikeSdr).toBe(false);
    expect(r.report.warnings).toContainEqual({ code: 'not-an-sdr', count: 1 });
    expect(r.out.version).toBe('1.0.0');
    expect(r.out.scripts.test).toMatch(/^\[redacted text/);
  });

  it('A8 a whole SDR nested inside an extension key is walked like anything else', () => {
    const doc = { vendorCopy: fixture() };
    const r = run(doc);
    const inner = r.out.vendorCopy;
    expect(inner.fedRampRequirements[0].frrID).toBe('CDS-CSO-RIS');
    expect(inner.fedRampRequirements[0].frrImplementationStatus).toBe('Implemented');
    expect(JSON.stringify(inner)).not.toContain('arn:aws');
    expect(r.report.paths.find((p) => p.path === 'vendorCopy.fedRampRequirements[].frrID')?.inSchema).toBe(false);
  });

  it('A9 a $schema on a non-FedRAMP host becomes a placeholder URI and raises schema-not-fedramp', () => {
    const r = run({ ...fixture(), $schema: 'https://schemas.example.test/sdr.json' });
    expect(r.out.$schema).toBe('https://redacted.invalid/1');
    expect(r.out.redaction.schemaSeen).toBeNull();
    expect(r.report.warnings).toContainEqual({ code: 'schema-not-fedramp', path: '$schema', count: 1 });
    expect(r.report.input.looksLikeSdr).toBe(true);
  });

  it('A10 a digit string becomes a number token and a large JSON number is masked at the same length', () => {
    const r = run({ s: '123456789012', n: 123456789012 });
    expect(r.out.s).toBe('number-1');
    expect(typeof r.out.n).toBe('number');
    expect(r.out.n).not.toBe(123456789012);
    expect(String(r.out.n)).toHaveLength(12);
  });

  it('A11 an email address under any key becomes an email token', () => {
    const r = run({ sourceOfUpdate: 'ops@example.test', nested: { owner: 'ops@example.test' } });
    expect(r.out.sourceOfUpdate).toBe('email-1');
    expect(r.out.nested.owner).toBe('email-1');
  });

  it('A12 fifty thousand evidence entries complete with lengths preserved', () => {
    const entries = Array.from({ length: 50_000 }, (_, i) => ({
      evidenceType: 'Audit Record',
      evidenceDescription: `check ${i % 7}: arn:aws:ec2:us-east-1:123456789012:instance/i-${i} passing.`,
      resourceId: `arn:aws:ec2:us-east-1:123456789012:instance/i-${i}`,
      lastUpdated: '2026-08-31',
    }));
    const doc = { keySecurityIndicators: [{ ksiId: 'KSI-CNA-RNT', ksiEvidence: entries }] };
    const started = Date.now();
    const r = run(doc);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(r.out.keySecurityIndicators[0].ksiEvidence).toHaveLength(50_000);
    expect(r.report.summary['kept-enum']).toBe(50_000);
    expect(r.report.summary.token).toBe(50_000);
  });

  it('A13 keepValues keeps only the listed values under the listed path', () => {
    const r = run(fixture(), { keepValues: { 'keySecurityIndicators[].ksiEvidence[].assurance': ['platform_verified'] } });
    const rows = r.out.keySecurityIndicators[0].ksiEvidence.map((e: Any) => e.assurance);
    expect(rows).toEqual([undefined, undefined, 'platform_verified', 'platform_verified', expect.stringMatching(/^token-\d+$/)]);
    expect(r.out.keySecurityIndicators[0].ksiEvidence[2].provider).toMatch(/^token-\d+$/);
    expect(JSON.stringify(r.out)).not.toContain('platform_derived');
  });

  it('A14 a value that already has the redactor\'s token form is kept, and a second pass proves I7', () => {
    const r = run({ a: 'token-4', b: 'https://redacted.invalid/9' });
    expect(r.out.a).toBe('token-4');
    expect(r.out.b).toBe('https://redacted.invalid/9');
    const again = run(r.out);
    const { redaction: _x, ...one } = r.out;
    const { redaction: _y, ...two } = again.out;
    expect(two).toEqual(one);
  });

  it('A15 legacy wrapped items are walked generically', () => {
    const doc = { keySecurityIndicators: [{ keySecurityIndicator: { ksiId: 'KSI-IAM-MFA', ksiImplementationStatus: 'Implemented', ksiImplementation: ['Alex Example set it up.'] } }] };
    const r = run(doc);
    const inner = r.out.keySecurityIndicators[0].keySecurityIndicator;
    expect(inner.ksiId).toBe('KSI-IAM-MFA');
    expect(inner.ksiImplementationStatus).toBe('Implemented');
    expect(inner.ksiImplementation[0]).toMatch(/^\[redacted text/);
  });

  it('A16 property: no string from the input reaches the report unless it is safe vocabulary', () => {
    const input = fixture();
    const r = run(input);
    const report = JSON.stringify(r.report);
    for (const s of collectStrings(input)) {
      if (s.trim() === '' || ENUM.has(s) || ID.test(s) || DATE.test(s) || VERSION.test(s) || s.startsWith(SAFE_URL_PREFIX)) continue;
      if (/^[A-Za-z$][A-Za-z0-9_]*$/.test(s) && s.length <= 40 && !/\d{4,}/.test(s)) continue; // ordinary key names appear as paths
      expect(report, `report leaks ${JSON.stringify(s)}`).not.toContain(s);
    }
    expect(report).not.toContain('123456789012');
    expect(report).not.toContain('example-cloud');
    expect(report).not.toContain('Alex');
  });

  it('A17 property: two runs are byte-identical', () => {
    const a = run(fixture(), { dates: 'month', numbers: 'coarse' });
    const b = run(fixture(), { dates: 'month', numbers: 'coarse' });
    expect(JSON.stringify(a.out)).toBe(JSON.stringify(b.out));
    expect(JSON.stringify(a.report)).toBe(JSON.stringify(b.report));
  });

  it('A18 property: key sets, types, and array lengths match at every path except pseudonymized keys and the marker', () => {
    const input = fixture();
    const r = run(input);
    expect(shapeMismatches(input, r.out)).toEqual([]);
    expect(Object.keys(r.out).at(-1)).toBe('redaction');
  });

  it('never mutates the input', () => {
    const input = fixture();
    const before = JSON.stringify(input);
    run(input, { dates: 'drop', numbers: 'coarse', stripUnknown: true });
    expect(JSON.stringify(input)).toBe(before);
  });

  it('keeps the claim on the sample: every status, id, date, and count survives', () => {
    const r = run(fixture());
    expect(r.out.fedRampRequirements.map((f: Any) => [f.frrID, f.frrImplementationStatus ?? f.frrStatus])).toEqual([
      ['CDS-CSO-RIS', 'Implemented'],
      ['SCN-CSO-EVA', 'Partially Implemented'],
      ['MKT-CSO-PML', expect.stringMatching(/^token-\d+$/)],
    ]);
    expect(r.out.keySecurityIndicators.map((k: Any) => [k.ksiId, k.ksiImplementationStatus, k.ksiTests.length, k.ksiEvidence.length])).toEqual([
      ['KSI-IAM-MFA', 'Implemented', 2, 5],
      ['KSI-CNA-RNT', 'Not Implemented', 0, 0],
    ]);
    expect(r.out.ksiMetricsWindow).toEqual({ from: '2026-03-04', to: '2026-08-31', evaluations: 181, cadence: expect.stringMatching(/^token-\d+$/) });
    expect(r.out.keySecurityIndicators[0].ksiMetrics.points[1]).toEqual({ date: '2026-08-15', status: 'Partially Implemented' });
    expect(r.out.fleet).toMatchObject({ instanceCount: 1234, hardened: true, notes: null });
    expect(r.out.securityControls[0].parameterValues[0].parameterId).toBe('ac-02_odp.01');
    expect(r.out.certificationPackageOverviewUri).toMatch(/^https:\/\/redacted\.invalid\/\d+$/);
  });
});
