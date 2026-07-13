# Integration Foundation Summary

This document summarizes the Integration 0, 1, and 2 foundation work for connecting the personal-dev normalized crawler graph direction to the current upstream scholarship notice workflow.

## Scope

Included:

- Integration 0: canonical ingestion ADR and adapter contract alignment.
- Integration 1: read-only `source_key -> notice_sources.source_id` resolver.
- Integration 2: local JSON adapter/read-model prototype for scholarship admin review.
- Fixture-based validation and deterministic read-model rerun checks.

Excluded:

- production/main Supabase access.
- DB insert, update, delete, cleanup, or migration execution.
- migration generation.
- `lib/database.types.ts` changes.
- `app/admin` or product UI changes.
- `crawled_notices` writes.
- guarded apply command integration.
- broad merge, rebase, or cherry-pick from the personal development branch.

## Upstream Inventory Checked

The foundation work was based on the current upstream files at commit `8a134533c5334c12a18e43a19bd03accf7189813`.

Checked areas:

- `supabase/migrations/20260709120000_create_notice_sources.sql`
- `supabase/migrations/20260709143000_add_crawled_notices_image_urls.sql`
- `data/notice-sources.csv`
- `lib/database.types.ts`
- `app/admin/review/page.tsx`
- `app/admin/review/scholarships/[id]/page.tsx`
- `app/admin/crawled-notices/actions.ts`
- `scripts/ingest-notices-to-supabase.mjs`
- `lib/notice-sources-loader.mjs`

## Source Identity Contract

The DB-level canonical source identifier is upstream `notice_sources.source_id`.

The crawler-facing stable natural key is `source_key`.

For this first read-only prototype, `source_key` resolves by exact match against the `source_id` column in `data/notice-sources.csv`. This is intentionally strict:

- zero matches => `resolution_status=missing`, `blocked=true`.
- multiple source_id matches => `resolution_status=ambiguous`, `blocked=true`.
- no fuzzy matching.
- no automatic source creation.
- no silent clean candidate when `source_id` is missing.

The original crawler key is preserved as `source_key_snapshot`.

## Source Mapping Limitations

Current upstream `data/notice-sources.csv` uses the same value for crawler `source_key` and `notice_sources.source_id`, so this prototype resolves source identity by exact identity match.

Missing and ambiguous source resolution paths are fixture-tested and fail closed.

This fixture validation does not prove that a separate alias mapping has been completed for all 613 source rows.

If future crawler `source_key` values diverge from `notice_sources.source_id`, an explicit mapping source will be required before write/apply paths can be considered.

Fuzzy matching and automatic source creation remain prohibited.

## Admin Review Field Mapping

Current upstream scholarship review reads from `crawled_notices`.

| Upstream field | Foundation mapping |
| --- | --- |
| `source_group` | derived later from `source_id` prefix for compatibility |
| `source_id` | resolved `notice_sources.source_id` |
| `source_name` | source resolution evidence |
| `title` | direct from normalized record |
| `notice_url` | `normalized_url`, falling back to `original_url` |
| `notice_posted_at` | `published_at` |
| `raw_date_text` | nullable/default |
| `body` | `body_text` |
| `image_urls` | derived from normalized assets where applicable |
| `scholarship_type` | default-compatible value until review contract expands |
| `status` | existing upstream lifecycle remains separate from adapter `review_status` |
| `extracted_draft` | out of scope for this foundation prototype |

Fields that need later design agreement:

- where `review_status` is stored.
- whether `body_quality` and `no_assets` live in graph tables, a read model, or UI-only derived state.
- whether `crawled_notices` continues receiving writes or becomes generated compatibility output.
- rollback and cleanup minimum criteria before any production apply.

## Implemented Files

- `scripts/resolve-crawler-source-identities.mjs`
- `scripts/build-scholarship-review-read-model.mjs`
- `scripts/validate-integration-foundation.mjs`
- `fixtures/integration-foundation/normalized-crawler-sample.json`
- `fixtures/integration-foundation/source-identity-mapping-snapshot.json`
- `reports/integration-foundation-validation-report.json`
- `reports/integration-foundation-validation-report.md`

## Validation Command

Use `node` when it is on PATH, or the Codex bundled Node executable when this Windows environment does not expose `node` directly:

```powershell
node scripts/validate-integration-foundation.mjs
```

The validation is local-only and performs no DB access.
