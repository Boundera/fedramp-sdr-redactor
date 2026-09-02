export type DatesMode = 'keep' | 'month' | 'year' | 'drop';
export type NumbersMode = 'keep' | 'coarse';

export interface RedactOptions {
  /** What happens to ISO dates and datetimes. Default: keep. */
  dates?: DatesMode;
  /** What happens to numbers under nine digits. Default: keep. */
  numbers?: NumbersMode;
  /** Keep the schema's list of test names verbatim. Default: false. */
  keepTestNames?: boolean;
  /**
   * Exact values to keep, per path pattern, for example
   * { "keySecurityIndicators[].ksiEvidence[].assurance": ["platform_verified"] }.
   */
  keepValues?: Record<string, string[]>;
  /** Drop every key the schema does not define before redacting. Default: false. */
  stripUnknown?: boolean;
  /** The date stamped into the marker, as YYYY-MM-DD. Default: today (UTC). */
  redactedAt?: string;
  /** Byte size of the input as read from disk, when the caller knows it. */
  inputBytes?: number;
}

/** The options as resolved and recorded in the marker and the report. */
export interface ResolvedOptions {
  dates: DatesMode;
  numbers: NumbersMode;
  keepTestNames: boolean;
  stripUnknown: boolean;
  keepValues: Record<string, string[]>;
}

export interface PathEntry {
  /** Path pattern. Arrays are written as [], pseudonymized keys as {key}. */
  path: string;
  /** Whether the schema defines this path. */
  inSchema: boolean;
  /** JSON type(s) seen at this path, joined with | when mixed. */
  type: string;
  /** Number of values seen at this path. */
  count: number;
  /** Count per action code. */
  actions: Record<string, number>;
}

export interface ReportWarning {
  code: string;
  path?: string;
  count: number;
}

export interface Candidate {
  path: string;
  distinct: number;
}

export interface Report {
  tool: string;
  version: string;
  redactedAt: string;
  options: ResolvedOptions;
  input: {
    bytes: number;
    looksLikeSdr: boolean;
    schema: string | null;
    /** Length of each top-level array the schema defines, when present. */
    sections: Record<string, number>;
  };
  summary: Record<string, number>;
  paths: PathEntry[];
  warnings: ReportWarning[];
  candidates: Candidate[];
}

export interface Marker {
  tool: string;
  version: string;
  redactedAt: string;
  options: ResolvedOptions;
  schemaSeen: string | null;
  notice: string;
  previous: PriorMarker[];
}

/** A previous marker, reduced to the fields that pass strict grammars. */
export interface PriorMarker {
  tool?: string;
  version?: string;
  redactedAt?: string;
  options?: Partial<ResolvedOptions>;
  schemaSeen?: string | null;
}

export interface RedactResult {
  /** The redacted document. Same shape as the input plus the marker. */
  doc: unknown;
  /** What was done, as counts. Contains no original value. */
  report: Report;
  /** The real words behind each candidate path, for a person to review on screen. */
  candidateValues: Record<string, string[]>;
}
