# Crawler Normalized Graph Adapter Contract

## Purpose

This draft defines how normalized crawler graph output should be transformed into upstream-compatible review/read-model output.

The adapter exists to let the long-term canonical crawler graph coexist with the current upstream product/admin/review flow. It is not a DB write approval, migration approval, or admin UI rewrite plan.

The first implementation should be read-only and local-output first.

## Inputs

The adapter should accept normalized crawler graph concepts, including:

- `source_key`
- `canonical_key`
- `source_url`
- `title`
- `body_text`
- `published_at`
- attachments/assets
- target organization or unit
- keyword matches
- duplicate/review flags
- quality flags
- `no_assets`
- `body_quality`
- crawler run metadata
- source result metadata
- error and warning metadata

The adapter may receive these concepts from fixtures, dry-run output, crawler graph tables, or an intermediate normalized ingest payload.

## Source Resolution Contract

The adapter must resolve `source_key` to `notice_sources.source_id`.

Unresolved `source_key` must fail closed. It must not silently insert, infer, or create an upstream source.

An unresolved source must become a review/blocker state with evidence. It must not become an automatic apply candidate.

The resolved `source_id` must be present in graph-backed output and upstream-compatible read-model output.

The adapter may preserve `source_key` as `source_key_snapshot` for traceability, idempotency, and historical reconciliation.

## Output Contract

The proposed upstream-compatible review/read-model shape is:

```json
{
  "source_id": "string",
  "source_key_snapshot": "string",
  "canonical_key": "string",
  "title": "string",
  "original_url": "string",
  "normalized_url": "string",
  "body_text": "string",
  "published_at": "string|null",
  "asset_count": 0,
  "has_assets": false,
  "no_assets": true,
  "body_quality": "good_text|no_assets_but_text_sufficient|short_body_needs_review|image_only_suspected|attachment_required_unknown",
  "duplicate_status": "unique|duplicate_review|duplicate_existing|duplicate_within_input|changed_existing|unchanged_existing",
  "review_status": "clean|needs_review|blocked|approved|rejected|merged",
  "target_summary": [],
  "keyword_summary": [],
  "occurrence_count": 1,
  "latest_run_id": "string|null",
  "latest_source_result_status": "success|partial|failed|zero_match_observed|unknown",
  "evidence_json": {},
  "created_at": "string",
  "updated_at": "string"
}
```

Field requirements:

- `source_id` is required for any clean or reviewable output.
- `source_key_snapshot` is required for traceability.
- `canonical_key` is required for idempotency and duplicate analysis.
- `original_url` and `normalized_url` should both be preserved when available.
- `evidence_json` should preserve enough crawler evidence for review, rollback, and later audit.
- `review_status=clean` must not be assigned when source resolution fails.

## Review Status Mapping

| Input classification | Adapter review status | Notes |
| --- | --- | --- |
| clean candidate | `clean` | Eligible for read-model output and later guarded apply review. |
| duplicate/review | `needs_review` | Must not auto-apply. Requires approve/reject/merge decision. |
| quality-review | `needs_review` | Requires body/source quality review before apply. |
| blocked/missing source | `blocked` | Source resolution or required contract failed. |
| no_assets but acceptable body | `clean` or `needs_review` | Clean only when body quality, source identity, duplicate state, and DB comparison are clean. |
| image-only suspected | `needs_review` | Must not be treated as complete text notice. |
| source failure | `blocked` | Preserve source result evidence. |
| zero-match source | `blocked` or source-health-only | Must not be interpreted as proof that no scholarship exists. |

## Safety Rules

- No production write by default.
- Read-only adapter validation must come before any DB write path.
- Missing `source_id` must fail closed.
- Duplicate/review and quality-review items must not be automatically applied.
- Cleanup execution requires explicit approval and separate dry-run evidence.
- Do not broad-merge `lib/database.types.ts`.
- Do not claim nationwide coverage from shallow crawl output.
- Do not treat `no_assets` alone as an automatic correctness blocker.
- Do not treat `no_assets` as equivalent to asset-backed notice quality without quality status.
- Do not mutate candidate counts to make a batch look cleaner.
- Do not route production/main Supabase writes through this adapter until team approval.

## Minimal Prototype Recommendation

The first implementation should be:

- Read-only.
- Local JSON output only.
- No DB write.
- No migration.
- No `lib/database.types.ts` modification.
- A comparison from normalized graph output to upstream-compatible review shape.
- A validation report with source resolution counts, missing source counts, review status distribution, duplicate status distribution, body quality distribution, and sample evidence.

Minimum validation metrics:

- `candidate_count_requested`
- `resolved_source_id_count`
- `missing_source_id_count`
- `clean_count`
- `needs_review_count`
- `blocked_count`
- `duplicate_review_count`
- `quality_review_count`
- `no_assets_count`
- `zero_match_source_count`

## Initial Implementation Paths

The Integration Foundation prototype uses the following local-only files:

- `scripts/resolve-crawler-source-identities.mjs`
- `scripts/build-scholarship-review-read-model.mjs`
- `scripts/validate-integration-foundation.mjs`
- `fixtures/integration-foundation/normalized-crawler-sample.json`
- `fixtures/integration-foundation/source-identity-mapping-snapshot.json`
- `reports/integration-foundation-validation-report.json`
- `reports/integration-foundation-validation-report.md`

The resolver treats upstream `data/notice-sources.csv` as the read-only source inventory snapshot. In the current upstream schema, `notice_sources.source_id` is the DB canonical source identifier, and the crawler-facing `source_key` resolves by exact match to that value. Synthetic fixture rows are used only to prove ambiguous source handling fails closed.

This implementation does not import Supabase clients, does not read `.env`, does not write DB records, does not create migrations, and does not modify `lib/database.types.ts` or `app/admin`.

## Future Implementation Notes

Possible integration forms:

- `admin_review_notice_view` DB view.
- Materialized read model refreshed from graph output.
- API route that maps graph state to admin review shape.
- Local generated JSON read model for early validation.
- Gradual migration from `crawled_notices` to graph-backed canonical model.

Required tests:

- Source resolution succeeds for known `source_key` values.
- Missing source fails closed.
- Duplicate/review items never become clean automatically.
- Quality-review items never become clean automatically.
- `no_assets` with sufficient body can be represented without becoming an automatic blocker.
- Zero-match source output is represented as source-health evidence, not absence of scholarships.
- Output shape includes `source_id`, `source_key_snapshot`, `canonical_key`, URL fields, quality status, review status, latest run metadata, and evidence.
- Adapter output is stable for repeated identical inputs.

## Non-Authorization

This contract does not authorize production/main Supabase writes.

This contract does not authorize schema migration.

This contract does not authorize cleanup SQL.

This contract does not authorize broad merge of DB schema, generated database types, package scripts, or admin UI.
