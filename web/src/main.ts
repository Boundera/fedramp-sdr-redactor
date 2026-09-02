import { redact } from '../../src/index.js';
import type { RedactOptions, RedactResult } from '../../src/index.js';
import example from '../../test/fixtures/sample-sdr.json';

declare const __APP_VERSION__: string;

const DISPLAY_LIMIT = 200_000;
const TOKEN_FORM =
  /("(?:uuid|arn|resource|email|ip|number|token)-\d+"|"\[redacted text #\d+, \d+ chars\]"|"https:\/\/redacted\.invalid\/\d+"|"\[redacted date\]"|"redacted-key-\d+")/g;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

const drop = el<HTMLDivElement>('drop');
const fileInput = el<HTMLInputElement>('file');
const paste = el<HTMLTextAreaElement>('paste');
const inputStatus = el<HTMLParagraphElement>('input-status');
const optDates = el<HTMLSelectElement>('opt-dates');
const optNumbers = el<HTMLSelectElement>('opt-numbers');
const optTests = el<HTMLInputElement>('opt-tests');
const optStrip = el<HTMLInputElement>('opt-strip');
const candidates = el<HTMLDivElement>('candidates');
const candidateList = el<HTMLDivElement>('candidate-list');
const resultPanel = el<HTMLElement>('result-panel');
const stats = el<HTMLDivElement>('stats');
const warnings = el<HTMLUListElement>('warnings');
const readySub = el<HTMLParagraphElement>('ready-sub');
const redacted = el<HTMLPreElement>('redacted');

let original: unknown = null;
let originalBytes = 0;
let sourceName = 'sdr.json';
let result: RedactResult | null = null;
let keepValues: Record<string, string[]> = {};

el<HTMLSpanElement>('version').textContent = `fedramp-sdr-redactor ${__APP_VERSION__}`;

function options(): RedactOptions {
  return {
    dates: optDates.value as RedactOptions['dates'],
    numbers: optNumbers.value as RedactOptions['numbers'],
    keepTestNames: optTests.checked,
    stripUnknown: optStrip.checked,
    inputBytes: originalBytes,
  };
}

function setStatus(text: string, bad = false): void {
  inputStatus.textContent = text;
  inputStatus.classList.toggle('bad', bad);
}

function load(text: string, name: string): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    setStatus(`That is not JSON: ${(e as Error).message}`, true);
    return;
  }
  original = parsed;
  originalBytes = new TextEncoder().encode(text).length;
  sourceName = name;
  keepValues = {};
  setStatus(`Loaded ${name}, ${originalBytes.toLocaleString()} bytes.`);
  run();
  resultPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function run(): void {
  if (original === null) return;
  const opts = options();
  const baseline = redact(original, { ...opts, keepValues: {} });
  result = Object.keys(keepValues).length ? redact(original, { ...opts, keepValues }) : baseline;
  renderCandidates(baseline);
  render(result);
}

function renderCandidates(baseline: RedactResult): void {
  candidateList.replaceChildren();
  const paths = Object.keys(baseline.candidateValues);
  candidates.hidden = paths.length === 0;
  for (const path of paths) {
    const box = document.createElement('fieldset');
    box.className = 'cand';
    const legend = document.createElement('legend');
    legend.textContent = path;
    box.append(legend);
    const values = document.createElement('div');
    values.className = 'values';
    for (const word of baseline.candidateValues[path] ?? []) {
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = keepValues[path]?.includes(word) ?? false;
      cb.addEventListener('change', () => {
        const current = new Set(keepValues[path] ?? []);
        if (cb.checked) current.add(word);
        else current.delete(word);
        if (current.size) keepValues[path] = [...current];
        else delete keepValues[path];
        run();
      });
      label.append(cb, document.createTextNode(word));
      values.append(label);
    }
    box.append(values);
    candidateList.append(box);
  }
}

function stat(value: number, label: string): HTMLElement {
  const node = document.createElement('div');
  node.className = 'stat';
  const b = document.createElement('b');
  b.textContent = value.toLocaleString();
  const s = document.createElement('span');
  s.textContent = label;
  node.append(b, s);
  return node;
}

function highlight(pre: HTMLPreElement, text: string): void {
  pre.replaceChildren();
  let last = 0;
  for (const m of text.matchAll(TOKEN_FORM)) {
    const i = m.index ?? 0;
    pre.append(document.createTextNode(text.slice(last, i)));
    const span = document.createElement('span');
    span.className = 'tok';
    span.textContent = m[0];
    pre.append(span);
    last = i + m[0].length;
  }
  pre.append(document.createTextNode(text.slice(last)));
}

function clip(text: string): string {
  if (text.length <= DISPLAY_LIMIT) return text;
  return `${text.slice(0, DISPLAY_LIMIT)}\n… showing the first ${DISPLAY_LIMIT.toLocaleString()} characters. The download has everything.`;
}

const SECTION_LABELS: Record<string, string> = {
  fedRampRequirements: 'FedRAMP requirements',
  keySecurityIndicators: 'Key Security Indicators',
  securityControls: 'security controls',
  portsAndProtocols: 'ports and protocols',
};

function render(r: RedactResult): void {
  const s = r.report.summary;
  const n = (k: string): number => s[k] ?? 0;
  const kept =
    n('kept-enum') + n('kept-fedramp-id') + n('kept-fedramp-url') + n('kept-date') + n('kept-version') +
    n('kept-number') + n('kept-literal') + n('kept-by-option');
  const replaced =
    n('text') + n('token') + n('uri') + n('pseudonym-key') + n('masked-number') + n('coarsened-number') +
    n('coarsened-date') + n('dropped-date') + n('stripped');

  stats.replaceChildren();
  for (const [name, count] of Object.entries(r.report.input.sections)) stats.append(stat(count, SECTION_LABELS[name] ?? name));
  stats.append(stat(n('kept-enum'), 'statuses kept'));
  stats.append(stat(n('kept-fedramp-id'), 'FedRAMP identifiers kept'));
  stats.append(stat(kept, 'values kept'));
  stats.append(stat(replaced, 'values replaced'));
  readySub.textContent = `${replaced.toLocaleString()} values replaced, ${kept.toLocaleString()} kept as written.`;

  warnings.replaceChildren();
  for (const w of r.report.warnings) {
    const li = document.createElement('li');
    li.append(document.createTextNode(explain(w.code)));
    if (w.path) {
      li.append(document.createTextNode(' at '));
      const code = document.createElement('code');
      code.textContent = w.path;
      li.append(code);
    }
    if (w.count > 1) li.append(document.createTextNode(` (${w.count})`));
    warnings.append(li);
  }

  highlight(redacted, clip(JSON.stringify(r.doc, null, 2)));
  resultPanel.hidden = false;
}

function explain(code: string): string {
  switch (code) {
    case 'not-an-sdr':
      return 'This does not look like a Security Decision Record. It was redacted with the same rules anyway.';
    case 'schema-not-fedramp':
      return 'The $schema value is not on fedramp.gov, so it was replaced like any other link';
    case 'status-not-in-schema':
      return 'A status field holds a word the schema does not define. It was replaced; open Options to keep it if it is safe';
    case 'large-text':
      return 'A very large text, probably an embedded file, was replaced';
    default:
      return code;
  }
}

function download(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

el<HTMLButtonElement>('dl-doc').addEventListener('click', () => {
  if (result) download(`${sourceName.replace(/\.json$/i, '')}.redacted.json`, `${JSON.stringify(result.doc, null, 2)}\n`);
});

el<HTMLButtonElement>('choose').addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});
el<HTMLButtonElement>('example').addEventListener('click', (e) => {
  e.stopPropagation();
  const text = JSON.stringify(example, null, 2);
  paste.value = text;
  load(text, 'example-sdr.json');
});

function readFile(file: File): void {
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    const text = String(reader.result ?? '');
    paste.value = text.length <= DISPLAY_LIMIT ? text : '';
    load(text, file.name);
  });
  reader.addEventListener('error', () => setStatus(`Could not read ${file.name}.`, true));
  reader.readAsText(file);
}

fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) readFile(file);
  fileInput.value = '';
});
drop.addEventListener('click', () => fileInput.click());
drop.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});
for (const evt of ['dragenter', 'dragover']) {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.add('over');
  });
}
for (const evt of ['dragleave', 'drop']) {
  drop.addEventListener(evt, (e) => {
    e.preventDefault();
    drop.classList.remove('over');
  });
}
drop.addEventListener('drop', (e) => {
  const file = (e as DragEvent).dataTransfer?.files?.[0];
  if (file) readFile(file);
});

let pasteTimer: number | undefined;
paste.addEventListener('input', () => {
  window.clearTimeout(pasteTimer);
  pasteTimer = window.setTimeout(() => {
    const text = paste.value.trim();
    if (text) load(text, 'pasted.json');
  }, 400);
});

for (const control of [optDates, optNumbers, optTests, optStrip]) control.addEventListener('change', run);
