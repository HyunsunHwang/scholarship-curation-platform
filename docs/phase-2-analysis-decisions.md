# Phase 2 Analysis Decisions

## Job uniqueness excludes provider/model

Chosen:

```text
revision_id + analysis_kind + prompt_version + schema_version + input_fingerprint
```

Runs record actual `provider` / `model`. This keeps one analysis contract while allowing baseline Claude runs and later shadow/low-cost runs under the same job lineage.

## Results are one validated row per run

`notice_analysis_results` is unique on `run_id`. Raw parse attempts remain run metadata; only validated structured output becomes a result row.

## Input fingerprint contract (option B)

Results do **not** store `input_fingerprint`. Completed-result reconciliation joins `result.job_id → job.input_fingerprint` so fingerprint stays authoritative on the job.

## Job / run / result lineage

Chosen composite FK approach over dropping notice/revision columns:

- jobs unique `(id, notice_id, revision_id)`
- runs unique `(id, job_id)`
- results FK `(run_id, job_id) → runs`
- results FK `(job_id, notice_id, revision_id) → jobs`

Keeps revision-scoped admin queries while preventing mismatched lineage inserts.

## Completion requires validated successful run

`complete_notice_analysis_job` rejects with:

- `complete_notice_analysis_job_rejected_missing_validated_result` when no validated result exists
- `complete_notice_analysis_job_rejected_run_not_validated` when a result exists but the linked run is not `status=succeeded` + `validation_status=validated` + `finished_at`

JS lease simulator accepts `runs` and enforces the same contract.

Phase 3 must persist a successful validated run and result before calling complete.

## Fail-closed readiness (Phase 2-B / 2-C)

- positive candidate gate (`candidate` OR scholarship-dedicated)
- `new_recruitment` only
- privacy `clear|redacted` required for provider eligibility (`not_scanned` blocks)
- attachment extracted-text quality participates in readiness
- reconciler does not default missing `notice_type` to `new_recruitment`
- reconciler does not default missing `privacy_status` to `clear`

## Queue claim parity (Phase 2-B)

- SQL and JS auto-claim: `pending`, `retryable_failed` only
- `budget_deferred` excluded until explicit release to `pending`
- claim requires `attempt_count < max_attempts`
- complete/fail require active (non-expired) lease

## Schema placement

Analysis DDL lives in `supabase/post-phase-l/004_notice_analysis_schema.sql` because it foreign-keys Post-Phase L `ingestion_notice_*` tables that are not yet in production `supabase/migrations/`.

Migration includes transaction, environment guard, dependency assertions, and idempotent updated_at trigger drop/create.

## Types

Hand-updated `lib/post-phase-l/database.types.ts` to match DDL. No live `supabase gen types` run (would require DB network/credentials).

## Not decided in Phase 2

- monthly/per-notice money ceilings
- always-on worker vs GitHub Actions consumer only
- canonical Program/Cycle tables
- automatic publication rules
- budget_deferred release operator API
