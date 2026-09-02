# Contributing

Thank you for helping. A few rules keep the tool trustworthy.

## Rules that do not bend

1. **Values decide, never keys.** A rule may look at what a string contains. No rule may keep a value because of the key it sits under. Key names may only make the tool stricter.
2. **Fail closed.** A string is kept only when a keep rule matches its value. Repetition never keeps a value.
3. **No vendor logic.** The library names no schema key by hand. Everything it knows about the schema is generated from `schemas/` by `pnpm generate`.
4. **No network, no storage** in the web page. `pnpm check:web` enforces it.
5. **No original value in the report**, ever. Test A16 enforces it.
6. **Synthetic fixtures only.** Never add a real Security Decision Record, even a redacted one, to this repository.

## Workflow

```bash
pnpm install
pnpm verify
```

Add a test for every rule change. The adversary cases in `test/adversary.test.ts` are numbered to match the specification; keep the numbering.

Open a pull request against `main`. CI must pass.

## Review and release rules

`main` is protected: every change needs an approving review from a code owner (see `.github/CODEOWNERS`), CI must pass, and force pushes and deletions are refused. Release tags `v*` can be created only by the repository owner. A tag is what deploys to tools.boundera.io, so the deploy path is exactly as narrow as the tag rule.
