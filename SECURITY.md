# Security

## What this tool promises

- The library does no I/O.
- The web page makes no network request, loads no third-party script, and stores nothing in the browser. Its Content Security Policy refuses every connection. `pnpm check:web` proves the built page contains no network capability, and CI runs it on every change.
- Tokens are counters, never hashes of the original.
- The report never contains an original value.

## What it does not promise

The tool replaces every free-text value whole and every identifier it recognizes. It does not read prose for meaning. Review the redacted document before you share it, as you would any document.

## Reporting a problem

If you find a way for an original value to reach the redacted document, the report, or the network, please report it privately to security@boundera.io. Include a minimal synthetic input; never send a real Security Decision Record. We aim to acknowledge within three business days.
