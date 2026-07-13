# Post-Phase A-0/A-1 Triage Runbook

## Validation

Run the local fixture validator with standard `node`, or the bundled Node executable when Node is unavailable on PATH.

```powershell
node --check scripts/build-coverage-parser-detector-triage.mjs
node --check scripts/validate-post-phase-a0-a1-coverage-readability-triage.mjs
node scripts/validate-post-phase-a0-a1-coverage-readability-triage.mjs
```

It reads only `fixtures/post-phase-a0-a1/` and writes repository-relative reports under `reports/post-phase-a0-a1-*`.

## PASS Conditions

- Fixture expectations, item schema, arithmetic, and deterministic reruns pass.
- Zero-match never claims source exhaustion and `source_exhaustion_proven` remains false.
- Keyword candidates leave detector rules unchanged.
- A partial board is not upgraded from a single matched item.
- Every non-clean item has reason codes.
- Mojibake tracks replacement characters.
- Attachment-only records an attachment parser recommendation.

## Triage Outcome

Use the reports to prioritize bounded future work: manual source spot checks and depth investigation, parser/encoding/selector repair, attachment or second-pass parsers, and evidence-backed keyword expansion review. Do not turn a triage report into a database write, source cleanup, or production detector change.
