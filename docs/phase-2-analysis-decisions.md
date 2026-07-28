# Phase 2 Analysis Decisions

## Job uniqueness excludes provider/model

Chosen:

```text
revision_id + analysis_kind + prompt_version + schema_version + input_fingerprint
```

Runs record actual `provider` / `model`. This keeps one analysis contract while allowing baseline Claude runs and later shadow/low-cost runs under the same job lineage.

## Results are one validated row per run

`notice_analysis_results` is unique on `run_id`. Raw parse attempts remain run metadata; only validated structured output becomes a result row.

## Schema placement

Analysis DDL lives in `supabase/post-phase-l/004_notice_analysis_schema.sql` because it foreign-keys Post-Phase L `ingestion_notice_*` tables that are not yet in production `supabase/migrations/`.

## Types

Hand-updated `lib/post-phase-l/database.types.ts` to match DDL. No live `supabase gen types` run (would require DB network/credentials).

## Not decided in Phase 2

- monthly/per-notice money ceilings
- always-on worker vs GitHub Actions consumer only
- canonical Program/Cycle tables
- automatic publication rules
