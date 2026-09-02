# fedramp-sdr-redactor

> Redact a FedRAMP Security Decision Record (SDR) so you can share it in public. Keeps the claim, removes the specifics. Runs in your browser or as a command; the document never leaves your machine.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![FedRAMP 20x](https://img.shields.io/badge/FedRAMP-20x-0B2545.svg)](https://www.fedramp.gov/)
[![Status: alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#status)

**Web:** [redact.boundera.io](https://redact.boundera.io) · **Command:** `npx fedramp-sdr-redactor redact sdr.json` · **Library:** `import { redact } from 'fedramp-sdr-redactor'`

## Why

An SDR is the JSON document a provider submits under FedRAMP rule SDR-CSO-FRR. It says, for every FedRAMP requirement and every Key Security Indicator, what the provider implemented, how they validate it, and what an assessor found. Nobody outside the provider and its assessors sees one, so a team preparing its first SDR cannot learn what a real one looks like or how much sits behind a real implementation.

Sharing an SDR is unsafe as-is. It names the provider, its systems, resources, people, links, and methods. FedRAMP's own rule CDS-CSO-RIS says certification data should not include specifics that would help a threat actor, and names credentials, detailed methodology, and employee PII as the things to keep out.

This tool makes sharing safe. A reader of a redacted SDR sees every requirement and every KSI with its status, how much sits behind each one, and where the gaps are. The reader learns nothing about whose system it is.

## The privacy promise

- **Nothing leaves your machine.** The web page is static files. It makes no network request at all. Its Content Security Policy refuses every connection, and it loads no third-party script, not even analytics. Load it once, disconnect, and it still works.
- **Nothing is stored.** No cookies, no local storage, no caches of your document.
- **Nothing is hashed.** Tokens are counters, never hashes of the original, so a token cannot be reversed by guessing.
- **You can check.** The page footer shows the SHA-256 of the JavaScript it runs. `BUNDLE_SHA256.txt` in every release lists the same hashes. The source is here, under MIT.

## What stays and what goes

**Stays: the claim.**

| Kind | Examples | Rule |
| --- | --- | --- |
| Status words and other schema vocabulary | `Implemented`, `Partially Implemented`, `Audit Record` | kept under any key; spelling normalized to the schema's |
| FedRAMP identifiers | `CDS-CSO-RIS`, `KSI-IAM-MFA`, `AC-2(1)`, `ac-02_odp.01` | kept by value |
| FedRAMP URLs | `https://fedramp.gov/schemas/...` | kept |
| Dates | `2026-08-31`, `2026-08-31T14:05:00Z` | kept, or coarsened with `--dates` |
| Numbers under nine digits, booleans, null | `181`, `true` | kept, or rounded with `--numbers` |
| Numeric versions | `1.4.2` | kept |
| Structure | every key, every array length, every empty slot | kept |

**Goes: the specifics.**

| Kind | Becomes | Rule |
| --- | --- | --- |
| Free text: statements, descriptions, evidence text, test names | `[redacted text #12, 412 chars]` | numbered per distinct text, so a repeated sentence is visibly repeated |
| Links | `https://redacted.invalid/3` | consistent per distinct link |
| Identifiers: UUIDs, ARNs, cloud resource paths, emails, IP addresses, nine-plus digit numbers | `uuid-1`, `arn-3`, `resource-2`, `email-1`, `ip-4`, `number-9` | consistent per distinct value |
| Any other single word | `token-12` | consistent, so a repeated category is visibly repeated without revealing the word |
| Integers of nine or more digits | a placeholder number with the same digit count | always |
| Object keys that look like identifiers or contain spaces | `redacted-key-3` | keys are data too |

Every rule decides by the **value**, never by the key name. Unknown keys, vendor extensions, and nested documents are walked with the same rules. A key name can never make the tool keep something.

## Use it

### Web

Open [redact.boundera.io](https://redact.boundera.io). Drop or paste an SDR. Review the counts, tick any repeated words that are safe to show, and download the redacted file and its report.

### Command

```bash
npx fedramp-sdr-redactor redact sdr.json -o sdr.redacted.json --report report.json
```

```
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
```

Exit codes: 0 done, 1 bad arguments, 2 unreadable input. Any JSON content is processed; the tool never refuses a document.

### Library

```ts
import { redact } from 'fedramp-sdr-redactor';

const { doc, report, map, candidateValues } = redact(sdr, { dates: 'month' });
```

`doc` is the redacted document, `report` says what was done as counts, `map` is token to original and stays in memory unless you write it, and `candidateValues` holds the real words behind each candidate path so a person can decide what to keep. The function is pure and has no dependencies.

## The output

The redacted document has the same keys, nesting, array lengths, and types as the input, plus one top-level `redaction` block:

```json
{
  "redaction": {
    "tool": "fedramp-sdr-redactor",
    "version": "0.1.0",
    "redactedAt": "2026-09-02",
    "options": { "dates": "keep", "numbers": "keep", "keepTestNames": false, "stripUnknown": false, "keepValues": {} },
    "schemaSeen": "https://fedramp.gov/schemas/fedramp-security-decision-record-schema-2026-06-24.json",
    "notice": "Redacted for sharing. ... This is not a FedRAMP submission.",
    "previous": []
  }
}
```

The report lists every path pattern with the action taken and its count, warnings such as a status word the schema does not define, and candidate paths where a few repeated words were tokenized. **The report never contains an original value.**

## What it does not do

- It does not scan prose for names and keep the rest. Prose is replaced whole.
- It does not validate the document and does not refuse an invalid one.
- It does not correct, complete, or reorder anything. It removes; it does not improve.
- It does not know any vendor's export shape, including Boundera's.
- It does not cover the other FedRAMP package documents yet.

## Develop

```bash
pnpm install
pnpm generate      # regenerate src/generated from schemas/ (never edit by hand)
pnpm test
pnpm build         # library + CLI to dist/
pnpm build:web     # static page to dist-web/, hash stamped into the footer
pnpm check:web     # proves the page has no network capability and carries its CSP
pnpm verify        # all of the above, as CI runs it
```

The tool's only knowledge of the FedRAMP schema is generated from the vendored files in `schemas/`. A new schema revision is a regeneration, not a code change.

## Status

Alpha. The rules are stable and tested against nineteen adversary cases, but the tool has not yet been run against many vendors' documents. Please open an issue with a redacted sample if a rule surprises you.

## Relationship to Boundera

[Boundera](https://boundera.io) maintains this tool and hosts the web page. The tool is general: it has no knowledge of Boundera's product and treats Boundera's own extension fields exactly like any other vendor's. Not affiliated with GSA or the FedRAMP PMO.

## License

MIT. See [LICENSE](LICENSE).
