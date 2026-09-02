/**
 * String grammars. Every function here decides by the VALUE of a string,
 * never by the key it sits under.
 */

const OWN_TOKEN = /^(uuid|arn|resource|email|ip|number|token)-\d+$/;
const OWN_TEXT = /^\[redacted text #\d+, \d+ chars\]$/;
const OWN_URI = /^https:\/\/redacted\.invalid\/\d+$/;
const OWN_DATE = /^\[redacted date\]$/;
const OWN_KEY = /^redacted-key-\d+$/;

/** True when the value is already one of the redactor's own reserved forms. */
export function isOwnForm(s: string): boolean {
  return OWN_TOKEN.test(s) || OWN_TEXT.test(s) || OWN_URI.test(s) || OWN_DATE.test(s);
}

export function isOwnKey(k: string): boolean {
  return OWN_KEY.test(k);
}

const RULE_ID = /^[A-Z]{3}-[A-Z]{3}-[A-Z]{3}$/;
const KSI_ID = /^KSI-[A-Z]{2,4}-[A-Z0-9]{1,4}$/;
const CONTROL_ID_UPPER = /^[A-Z]{2}-\d{1,2}(\(\d{1,2}\))?$/;
const CONTROL_ID_LOWER = /^[a-z]{2}-\d{1,2}(\.\d{1,2})?$/;
const PARAM_ID = /^[a-z]{2}-\d{1,2}(\.\d{1,2})?_(odp|prm)([._]\d{1,2})?$/;

/** FedRAMP rule ids, KSI ids, NIST control ids in either spelling, OSCAL parameter ids. */
export function isFedrampId(s: string): boolean {
  return (
    RULE_ID.test(s) ||
    KSI_ID.test(s) ||
    CONTROL_ID_UPPER.test(s) ||
    CONTROL_ID_LOWER.test(s) ||
    PARAM_ID.test(s)
  );
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DATETIME = /^(\d{4})-(\d{2})-(\d{2})[Tt ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:[Zz]|[+-]\d{2}:?\d{2})?$/;

export interface DateParts {
  kind: 'date' | 'datetime';
  year: string;
  month: string;
}

export function parseDate(s: string): DateParts | null {
  let m = DATE.exec(s);
  if (m) return { kind: 'date', year: m[1]!, month: m[2]! };
  m = DATETIME.exec(s);
  if (m) return { kind: 'datetime', year: m[1]!, month: m[2]! };
  return null;
}

const VERSION = /^v?\d+(\.\d+){1,3}$/;

/** A numeric version such as 1.4.2. An IPv4 address is not a version. */
export function isVersion(s: string): boolean {
  return VERSION.test(s) && !isIPv4(s);
}

const URI_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:\/\//;
const URI_SPECIAL = /^(data|mailto|urn):/i;

export function isUri(s: string): boolean {
  return URI_SCHEME.test(s) || URI_SPECIAL.test(s);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARN = /^arn:/i;
const AZURE = /^\/subscriptions\//i;
const GCP = /^(?:projects|organizations|folders)\/|^\/\/[a-z0-9.-]+\.googleapis\.com\//i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/\d{1,2})?$/;
const IPV6 = /^[0-9a-f]{0,4}(?::[0-9a-f]{0,4}){2,7}(?:\/\d{1,3})?$/i;
const DIGITS_WITH_SEPARATORS = /^\d[\d\s().-]*\d$/;

export function isIPv4(s: string): boolean {
  const m = IPV4.exec(s);
  if (!m) return false;
  return [m[1], m[2], m[3], m[4]].every((o) => Number(o) <= 255);
}

export type IdentifierClass = 'uuid' | 'arn' | 'resource' | 'email' | 'ip' | 'number';

/** The identifier class of a string with no whitespace, or null. */
export function identifierClass(s: string): IdentifierClass | null {
  if (UUID.test(s)) return 'uuid';
  if (ARN.test(s)) return 'arn';
  if (AZURE.test(s) || GCP.test(s)) return 'resource';
  if (EMAIL.test(s)) return 'email';
  if (isIPv4(s) || (s.includes(':') && IPV6.test(s))) return 'ip';
  if (DIGITS_WITH_SEPARATORS.test(s) && (s.match(/\d/g)?.length ?? 0) >= 9) return 'number';
  return null;
}

export const WHITESPACE = /\s/;
const DOTTED_NAME = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;

/**
 * Keys are data too. A key that looks like an identifier, a dotted host-like
 * name, or contains whitespace is pseudonymized.
 */
export function isIdentifierLikeKey(k: string): boolean {
  if (WHITESPACE.test(k.trim()) || k.trim() === '') return k.trim() !== '';
  if (isVersion(k)) return false;
  return identifierClass(k) !== null || DOTTED_NAME.test(k);
}
