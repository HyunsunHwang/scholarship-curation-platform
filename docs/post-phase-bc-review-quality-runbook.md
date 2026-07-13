# Post-Phase B/C Review Quality Runbook

## Scope

Run the local validator to rebuild fixture-backed review backlog evidence. It uses local JSON fixtures only and does not connect to Supabase, execute a crawler, change migrations, or alter admin UI code.

## Commands

Use `node` when available. In the Codex Windows environment, use the bundled Node executable if `node` is not on PATH.

```powershell
node --check scripts/build-review-backlog-quality-foundation.mjs
node --check scripts/validate-post-phase-bc-review-quality-foundation.mjs
node scripts/validate-post-phase-bc-review-quality-foundation.mjs
```

The validator writes these deterministic repository-relative reports:

- `reports/post-phase-bc-review-quality-foundation.json`
- `reports/post-phase-bc-validation-report.json`
- `reports/post-phase-bc-validation-report.md`

It exercises all fixtures in `fixtures/post-phase-bc/`, including clean, duplicate, quality, no-assets, image-only, blocking, zero-match, and mixed-batch cases.

## PASS Criteria

- Every fixture matches its expected classification counts.
- Read-model schema and arithmetic checks pass.
- `read_model_deterministic_rerun_match` is true for identical fixture input.
- Blocked, duplicate, and quality review rows never allow auto apply.
- No-assets text-sufficient rows are not blockers.
- Image-only rows require review.
- Zero-match is retained as an observation, never as absence proof.
- Safety values remain false for DB access/write, migration, crawler execution, and destructive action.

## Review Triage

Treat `blocked_*`, `source_failure`, and `zero_match_observed` as fail-closed operational states. Treat `duplicate_review`, `quality_review`, `no_assets_needs_review`, and `image_only_suspected` as a human-review queue. `clean` and `no_assets_text_sufficient` are only policy candidates for a future separately approved apply path; this foundation does not apply them.

## Guardrails

Do not add a database write, migration, crawler run, cleanup, automatic duplicate merge, or admin UI connection as part of this validation. If future crawler `source_key` values diverge from `notice_sources.source_id`, stop and add an explicit mapping source; fuzzy matching and automatic source creation remain prohibited.
