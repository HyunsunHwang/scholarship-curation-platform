# Post-Phase A Coverage Reliability Runbook

## Local Validation

```powershell
node --check scripts/build-post-phase-a-coverage-parser-reliability-summary.mjs
node --check scripts/validate-post-phase-a-coverage-parser-reliability.mjs
node scripts/validate-post-phase-a-coverage-parser-reliability.mjs
```

The completion validator consumes the tracked A-0/A-1 triage report and writes only repository-relative Post-Phase A reports. It does not connect to a database, invoke Supabase, execute a crawler, modify keyword rules, or change UI.

## Review Sequence

1. Review the P0 spot-check and remediation rows first.
2. Confirm a bounded public-source sample before running any real crawl.
3. Require item/source evidence for every keyword candidate; conditional/noisy terms must not be standalone rules.
4. Choose one remediation category at a time and validate it against the affected source sample.
5. Preserve `source_exhaustion_proven=false` until a separately approved coverage policy exists.

## Non-Goals

This completion layer does not fix all sources, create a production detector rule, implement F-1 UI, run migrations, write data, execute cleanup, or prove coverage completeness.
