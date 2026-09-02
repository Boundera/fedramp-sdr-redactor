import { describe, expect, it } from 'vitest';
import { NOTICE, TOOL_NAME, TOOL_VERSION } from '../src/index.js';
import { run } from './helpers.js';

describe('S0 to S10: string values', () => {
  it('S0 keeps empty and whitespace-only strings', () => {
    const r = run({ a: '', b: '   ' });
    expect(r.out.a).toBe('');
    expect(r.out.b).toBe('   ');
    expect(r.report.summary['kept-empty']).toBe(2);
  });

  it('S1 keeps the redactor\'s own forms unchanged', () => {
    const forms = ['token-4', 'uuid-1', 'arn-9', '[redacted text #3, 12 chars]', 'https://redacted.invalid/7', '[redacted date]'];
    const r = run({ list: forms });
    expect(r.out.list).toEqual(forms);
    expect(r.report.summary['kept-redacted']).toBe(forms.length);
  });

  it('S2 keeps schema enum words under any key and normalizes spelling', () => {
    const r = run({ status: 'implemented', deep: { evidenceType: 'audit record' }, exact: 'Not Implemented' });
    expect(r.out.status).toBe('Implemented');
    expect(r.out.deep.evidenceType).toBe('Audit Record');
    expect(r.out.exact).toBe('Not Implemented');
    expect(r.report.summary['kept-enum']).toBe(3);
    expect(r.report.summary['normalized-enum']).toBe(2);
  });

  it('warns when a status key holds a word the schema does not define, and still replaces it', () => {
    const r = run({ fedRampRequirements: [{ frrID: 'CDS-CSO-RIS', frrImplementationStatus: 'N/A' }] });
    expect(r.out.fedRampRequirements[0].frrImplementationStatus).toBe('token-1');
    expect(r.report.warnings).toContainEqual({
      code: 'status-not-in-schema',
      path: 'fedRampRequirements[].frrImplementationStatus',
      count: 1,
    });
  });

  it('S3 keeps FedRAMP identifiers by value', () => {
    const ids = ['CDS-CSO-RIS', 'KSI-IAM-MFA', 'KSI-IAM-1', 'AC-2(1)', 'AC-2', 'ac-2.1', 'ac-02_odp.01', 'ac-2_prm_1'];
    const r = run({ ids });
    expect(r.out.ids).toEqual(ids);
    expect(r.report.summary['kept-fedramp-id']).toBe(ids.length);
  });

  it('S4 keeps FedRAMP URLs and S7 replaces every other link consistently', () => {
    const r = run({
      $schema: 'https://fedramp.gov/schemas/fedramp-security-decision-record-schema-2026-06-24.json',
      a: 'https://trust.example.test/cpo',
      b: 'https://trust.example.test/cpo',
      c: 'mailto:alex@example.test',
      d: 'data:image/png;base64,AAAA',
      e: 'urn:uuid:3f2a9c1e-7b4d-4e8a-9c21-5d6e7f8a9b0c',
      f: 's3://bucket/key',
    });
    expect(r.out.$schema).toBe('https://fedramp.gov/schemas/fedramp-security-decision-record-schema-2026-06-24.json');
    expect(r.out.a).toBe('https://redacted.invalid/1');
    expect(r.out.b).toBe('https://redacted.invalid/1');
    expect(r.out.c).toBe('https://redacted.invalid/2');
    expect(r.out.d).toBe('https://redacted.invalid/3');
    expect(r.out.e).toBe('https://redacted.invalid/4');
    expect(r.out.f).toBe('https://redacted.invalid/5');
    expect(r.report.summary['kept-fedramp-url']).toBe(1);
    expect(r.report.summary.uri).toBe(6);
  });

  it('S5 applies the dates option to dates and datetimes', () => {
    const doc = { d: '2026-08-31', t: '2026-08-31T14:05:00Z', s: '2026-08-31 14:05' };
    expect(run(doc).out).toMatchObject(doc);
    expect(run(doc, { dates: 'month' }).out).toMatchObject({ d: '2026-08-01', t: '2026-08-01T00:00:00Z', s: '2026-08-01T00:00:00Z' });
    expect(run(doc, { dates: 'year' }).out).toMatchObject({ d: '2026-01-01', t: '2026-01-01T00:00:00Z' });
    expect(run(doc, { dates: 'drop' }).out).toMatchObject({ d: '[redacted date]', t: '[redacted date]' });
    expect(run(doc, { dates: 'month' }).report.summary['coarsened-date']).toBe(3);
    expect(run({ d: '2026-08-01' }, { dates: 'month' }).report.summary['kept-date']).toBe(1);
  });

  it('S6 keeps numeric versions but treats an IPv4 address as an identifier', () => {
    const r = run({ v: '1.4.2', w: 'v2.0', ip: '10.0.0.1' });
    expect(r.out.v).toBe('1.4.2');
    expect(r.out.w).toBe('v2.0');
    expect(r.out.ip).toBe('ip-1');
  });

  it('S8 classifies identifiers without whitespace', () => {
    const r = run({
      uuid: '3F2A9C1E-7B4D-4E8A-9C21-5D6E7F8A9B0C',
      arn: 'arn:aws:iam::123456789012:root',
      az: '/subscriptions/0000/resourceGroups/rg',
      gcp: 'projects/acme/instances/db',
      gcp2: '//compute.googleapis.com/projects/acme/zones/z/instances/i',
      email: 'alex@example.test',
      ip4: '192.168.1.10/24',
      ip6: '2001:db8::1',
      digits: '123456789012',
      dashed: '123-456-789-012',
      phone7: '555-0101',
    });
    expect(r.out.uuid).toBe('uuid-1');
    expect(r.out.arn).toBe('arn-1');
    expect(r.out.az).toBe('resource-1');
    expect(r.out.gcp).toBe('resource-2');
    expect(r.out.gcp2).toBe('resource-3');
    expect(r.out.email).toBe('email-1');
    expect(r.out.ip4).toBe('ip-1');
    expect(r.out.ip6).toBe('ip-2');
    expect(r.out.digits).toBe('number-1');
    expect(r.out.dashed).toBe('number-2');
    expect(r.out.phone7).toBe('token-1');
  });

  it('S9 gives the same word the same token everywhere', () => {
    const r = run({ a: 'payments-primary', b: { c: 'payments-primary' }, d: 'staging' });
    expect(r.out.a).toBe('token-1');
    expect(r.out.b.c).toBe('token-1');
    expect(r.out.d).toBe('token-2');
    expect(JSON.stringify(r)).not.toContain('payments-primary');
  });

  it('S10 replaces text with a numbered, length-preserving placeholder', () => {
    const s = 'These checks are re-evaluated on each continuous monitoring run.';
    const r = run({ a: s, b: s, c: `  ${s}  `, d: 'Something else entirely.' });
    expect(r.out.a).toBe(`[redacted text #1, ${s.length} chars]`);
    expect(r.out.b).toBe(r.out.a);
    expect(r.out.c).toBe(`[redacted text #1, ${s.length + 4} chars]`);
    expect(r.out.d).toBe('[redacted text #2, 24 chars]');
    expect(r.report.summary.text).toBe(4);
  });

  it('warns about a very large text', () => {
    const r = run({ evidenceText: 'x '.repeat(600_000) });
    expect(r.report.warnings).toContainEqual({ code: 'large-text', path: 'evidenceText', count: 1 });
  });
});

describe('N1 to N3 and B1: numbers and literals', () => {
  it('N1 masks integers of nine or more digits with a same-length number', () => {
    const r = run({ a: 123456789012, b: 123456789012, c: -987654321, d: 99999999 });
    expect(r.out.a).not.toBe(123456789012);
    expect(String(r.out.a)).toHaveLength(12);
    expect(r.out.b).toBe(r.out.a);
    expect(r.out.c).toBeLessThan(0);
    expect(String(Math.abs(r.out.c))).toHaveLength(9);
    expect(r.out.d).toBe(99999999);
    expect(r.report.summary['masked-number']).toBe(3);
    expect(JSON.stringify(r)).not.toContain('123456789012');
  });

  it('N3 rounds numbers down to one significant digit when asked', () => {
    const r = run({ a: 47, b: 1234, c: 0.0456, d: 9, e: 0, f: -1234, g: 10 }, { numbers: 'coarse' });
    expect(r.out).toMatchObject({ a: 40, b: 1000, c: 0.04, d: 9, e: 0, f: -1000, g: 10 });
    expect(r.report.summary['coarsened-number']).toBe(4);
    expect(r.report.summary['kept-number']).toBe(3);
  });

  it('B1 keeps booleans and null', () => {
    const r = run({ a: true, b: false, c: null });
    expect(r.out).toMatchObject({ a: true, b: false, c: null });
    expect(r.report.summary['kept-literal']).toBe(3);
  });
});

describe('K1 and K2: object keys', () => {
  it('pseudonymizes identifier-like keys and keeps ordinary keys', () => {
    const r = run({
      '123456789012': { alias: 'prod' },
      'db-01.internal.example': 1,
      'Alex Example': 2,
      'alex@example.test': 3,
      alias: 4,
      '1.2.3': 5,
      'us-gov-west-1': 6,
    });
    expect(Object.keys(r.out)).toEqual(['redacted-key-1', 'redacted-key-2', 'redacted-key-3', 'redacted-key-4', 'alias', '1.2.3', 'us-gov-west-1', 'redaction']);
    expect(r.out['redacted-key-1'].alias).toBe('token-1');
    expect(r.report.paths.find((p) => p.path === '{key}')?.actions['pseudonym-key']).toBe(4);
    expect(JSON.stringify(r)).not.toContain('123456789012');
  });
});

describe('options', () => {
  it('keepValues keeps only the listed values under the listed path', () => {
    const doc = { keySecurityIndicators: [{ ksiEvidence: [{ assurance: 'platform_verified' }, { assurance: 'platform_derived' }] }] };
    const r = run(doc, { keepValues: { 'keySecurityIndicators[].ksiEvidence[].assurance': ['platform_verified'] } });
    expect(r.out.keySecurityIndicators[0].ksiEvidence[0].assurance).toBe('platform_verified');
    expect(r.out.keySecurityIndicators[0].ksiEvidence[1].assurance).toBe('token-1');
    expect(r.report.summary['kept-by-option']).toBe(1);
    expect(r.report.options.keepValues).toEqual({ 'keySecurityIndicators[].ksiEvidence[].assurance': ['platform_verified'] });
  });

  it('keepTestNames keeps the list of tests verbatim and nothing else', () => {
    const doc = { keySecurityIndicators: [{ ksiTests: ['aws:iam_root_mfa · KSI-IAM-MFA-1'], ksiValidation: ['aws:iam_root_mfa · KSI-IAM-MFA-1'] }] };
    const r = run(doc, { keepTestNames: true });
    expect(r.out.keySecurityIndicators[0].ksiTests[0]).toBe('aws:iam_root_mfa · KSI-IAM-MFA-1');
    expect(r.out.keySecurityIndicators[0].ksiValidation[0]).toMatch(/^\[redacted text/);
    expect(run(doc).out.keySecurityIndicators[0].ksiTests[0]).toMatch(/^\[redacted text/);
  });

  it('stripUnknown drops keys the schema does not define and reports them', () => {
    const doc = {
      $schema: 'https://fedramp.gov/schemas/x.json',
      fedRampId: 'FR1',
      fedRampRequirements: [{ frrID: 'CDS-CSO-RIS', frrStatus: 'not_applicable', frrImplementation: [] }],
      extra: { deep: 1 },
    };
    const r = run(doc, { stripUnknown: true });
    expect(Object.keys(r.out)).toEqual(['$schema', 'fedRampRequirements', 'redaction']);
    expect(Object.keys(r.out.fedRampRequirements[0])).toEqual(['frrID', 'frrImplementation']);
    expect(r.report.summary.stripped).toBe(3);
    expect(r.report.paths.find((p) => p.path === 'extra')?.actions.stripped).toBe(1);
  });

  it('ignores invalid option values and records the resolved options', () => {
    const r = run({}, { dates: 'weekly' as never, numbers: 'fuzzy' as never });
    expect(r.report.options).toEqual({ dates: 'keep', numbers: 'keep', keepTestNames: false, stripUnknown: false, keepValues: {} });
  });
});

describe('the marker and the report', () => {
  it('adds a top-level marker with the tool, version, date, options, schema, and notice', () => {
    const r = run({ $schema: 'https://fedramp.gov/schemas/fedramp-security-decision-record-schema-2026-06-24.json' });
    expect(r.out.redaction).toEqual({
      tool: TOOL_NAME,
      version: TOOL_VERSION,
      redactedAt: '2026-09-02',
      options: { dates: 'keep', numbers: 'keep', keepTestNames: false, stripUnknown: false, keepValues: {} },
      schemaSeen: 'https://fedramp.gov/schemas/fedramp-security-decision-record-schema-2026-06-24.json',
      notice: NOTICE,
      previous: [],
    });
  });

  it('moves a prior marker into previous, keeping only fields that pass strict grammars', () => {
    const first = run({ a: 'x y' });
    const tampered = {
      ...first.out,
      redaction: {
        ...first.out.redaction,
        tool: 'evil tool with spaces and arn:aws:iam::123456789012:root',
        notice: 'Alex Example wrote this',
        extra: 'smuggled',
        previous: [{ tool: 'older', version: '0.0.1', redactedAt: 'yesterday', schemaSeen: 'https://evil.test/x' }],
      },
    };
    const second = run(tampered);
    expect(second.out.redaction.previous).toEqual([
      { tool: 'older', version: '0.0.1' },
      { version: TOOL_VERSION, redactedAt: '2026-09-02', options: first.out.redaction.options, schemaSeen: null },
    ]);
    expect(JSON.stringify(second.out)).not.toContain('smuggled');
    expect(JSON.stringify(second.out)).not.toContain('Alex Example');
  });

  it('describes the input and lists every path with its actions', () => {
    const r = run({ fedRampRequirements: [{ frrID: 'CDS-CSO-RIS' }], securityControls: [], vendor: { note: 'a b' } });
    expect(r.report.input).toMatchObject({ looksLikeSdr: true, schema: null, sections: { fedRampRequirements: 1, securityControls: 0 } });
    expect(r.report.input.bytes).toBeGreaterThan(10);
    const frr = r.report.paths.find((p) => p.path === 'fedRampRequirements[].frrID');
    expect(frr).toEqual({ path: 'fedRampRequirements[].frrID', inSchema: true, type: 'string', count: 1, actions: { 'kept-fedramp-id': 1 } });
    const note = r.report.paths.find((p) => p.path === 'vendor.note');
    expect(note).toMatchObject({ inSchema: false, type: 'string', count: 1, actions: { text: 1 } });
  });

  it('lists candidate paths with few distinct tokenized words, with the words kept out of the report', () => {
    const doc = { rows: [{ provider: 'aws' }, { provider: 'aws' }, { provider: 'azure' }, { provider: 'aws' }] };
    const r = run(doc);
    expect(r.report.candidates).toEqual([{ path: 'rows[].provider', distinct: 2 }]);
    expect(r.candidateValues).toEqual({ 'rows[].provider': ['aws', 'azure'] });
    expect(JSON.stringify(r.report)).not.toContain('aws');
  });

  it('flags documents that do not look like an SDR and schemas that are not FedRAMP\'s', () => {
    const r = run({ $schema: 'https://schemas.example.test/sdr.json', name: 'pkg' });
    expect(r.report.input.looksLikeSdr).toBe(false);
    expect(r.out.redaction.schemaSeen).toBeNull();
    expect(r.out.$schema).toBe('https://redacted.invalid/1');
    expect(r.report.warnings.map((w) => w.code).sort()).toEqual(['not-an-sdr', 'schema-not-fedramp']);
  });
});
