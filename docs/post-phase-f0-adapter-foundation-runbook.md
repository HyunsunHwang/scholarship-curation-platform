# Post-Phase F-0 Adapter Foundation Runbook

## Local Validation

Run the deterministic local fixture validator with general `node`, or the bundled Node executable when `node` is unavailable on PATH.

```powershell
node --check scripts/build-adapter-backed-review-read-model.mjs
node --check scripts/validate-post-phase-f0-adapter-foundation.mjs
node scripts/validate-post-phase-f0-adapter-foundation.mjs
```

The validator reads only `fixtures/post-phase-f0/` plus the existing local source identity inputs. It writes these repository-relative reports:

- `reports/post-phase-f0-adapter-foundation.json`
- `reports/post-phase-f0-validation-report.json`
- `reports/post-phase-f0-validation-report.md`

## PASS Criteria

- All fixture source-resolution and review counts match.
- Required adapter fields, arithmetic, and deterministic reruns validate.
- Unresolved, ambiguous, missing-key, inactive, and alias-required rows fail closed.
- Duplicate, quality, and blocked rows cannot auto apply.
- No-assets text-sufficient rows are not blockers; image-only rows require review.
- Incomplete or blocked batches are visible as a warning or blocker.
- Zero match remains an observed result, never an absence conclusion.
- DB/Supabase access, DB write, migration, crawler execution, and destructive action remain false.

## Safety Boundary

This is not a production readiness test. Do not add DB connection code, migrations, UI wiring, crawler execution, cleanup, source creation, fuzzy matching, or a guarded apply command to this step. Future source-key divergence must stop at `source_key_alias_required` until an explicit mapping source is designed and approved.
