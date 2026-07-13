# Post-Phase B/C Review Backlog and Quality Contract

## Purpose

This contract defines a read-only review backlog and quality policy for normalized crawler candidates. It is an adapter/read-model foundation for later review work, not a database schema or an admin UI implementation.

The long-term canonical ingestion model remains the normalized crawler graph. `notice_sources.source_id` remains the canonical source identity; `source_key` remains the crawler-facing stable natural and idempotency key. The existing Integration Foundation source resolver must fail closed before a later apply path is considered.

## Existing Upstream Relationship

Current upstream review pages read from `crawled_notices` and preserve their existing lifecycle fields. This contract does not change those pages or their data source. Its `review_status`, `classification_status`, quality fields, and evidence are additive read-model concepts. A future adapter may translate these fields into a reviewed `crawled_notices` compatibility view, but no write path exists here.

No new UI is built because an admin surface needs agreed storage, lifecycle, and reviewer actions first. A fixture-backed contract lets that design be reviewed without coupling policy to an irreversible schema or UI choice.

## Read-Model Shape

Each backlog row has the future admin-facing fields: `source_id`, `source_key_snapshot`, `canonical_key`, `title`, `original_url`, `normalized_url`, `published_at`, `body_text`, `body_text_length`, `has_assets`, `asset_count`, `no_assets`, `body_quality`, `duplicate_status`, `review_status`, `blocker_status`, `quality_status`, `recommended_action`, `target_summary`, `keyword_summary`, `evidence_json`, `latest_run_id`, `latest_batch_label`, `created_at`, and `updated_at`.

It also carries policy fields: `classification_status`, `status`, `reason_code`, `severity`, `is_auto_apply_allowed`, `requires_admin_review`, and `is_blocking`.

## Classification Policy

| Status | Severity | Auto apply | Admin review | Blocking | Recommended action |
| --- | --- | --- | --- | --- | --- |
| `clean` | info | yes | no | no | retain for a later approved apply path |
| `duplicate_review` | warning | no | yes | no | compare duplicate evidence |
| `quality_review` | warning | no | yes | no | review body quality |
| `blocked_missing_source` | error | no | yes | yes | resolve source identity explicitly |
| `blocked_missing_target` | error | no | yes | yes | supply target evidence |
| `blocked_invalid_date` | error | no | yes | yes | correct published date |
| `blocked_invalid_url` | error | no | yes | yes | correct notice URL |
| `no_assets_text_sufficient` | info | yes | no | no | retain text evidence |
| `no_assets_needs_review` | warning | no | yes | no | review attachment or body completeness |
| `image_only_suspected` | warning | no | yes | no | review image or attachment content |
| `source_failure` | error | no | yes | yes | investigate source run |
| `zero_match_observed` | warning | no | yes | yes | review source coverage before any conclusion |

`duplicate_review` and `quality_review` are never auto-applied. Duplicate handling is review-only; this contract never merges records automatically.

## Quality Policy

| Field | Policy |
| --- | --- |
| `has_assets` / `asset_count` | derived from captured asset evidence |
| `no_assets` | true when no assets were captured; it is not a blocker by itself |
| `body_text_length` | deterministic length of normalized text |
| `body_quality` | one of `good_text`, `text_sufficient_no_assets`, `short_body_needs_review`, `image_only_suspected`, `empty_or_missing_body`, or `attachment_required_unknown` |
| `image_only_suspected` | true when content is absent and available evidence is image-only, or explicitly flagged |
| `attachment_required_unknown` | true when public text indicates an attachment might be necessary but capture evidence is incomplete |
| `quality_reason_codes` | stable reasons supporting the quality judgment |
| `quality_review_required` | true unless text is `good_text` or sufficient text without assets |

`no_assets_text_sufficient` is not blocked: sufficient public text can support later review even without attachments. `no_assets_needs_review` is used where no assets combine with short, missing, image-only, or attachment-uncertain evidence. `image_only_suspected` always requires review.

`zero_match_observed` is source-run evidence only. It does not prove source exhaustion or that a source has no scholarships.

## Minimum MVP Review Flow

1. Ingest a normalized candidate into the read-only backlog adapter.
2. Show blocking rows first, then duplicate and quality review rows, using `recommended_action` and `evidence_json`.
3. Allow a human to record a later decision in an approved storage design.
4. Only a separately designed and approved apply path may promote a clean or accepted row.

## Future Integration

An admin UI can consume this exact read-model shape through an adapter-backed endpoint or materialized read model. The adapter should resolve source identity with the Integration Foundation mapping before rendering a candidate. The normalized graph remains canonical; `crawled_notices` may eventually be a staging, read-model, or legacy compatibility layer.

## Non-Goals

- No admin UI implementation.
- No DB migration or production DB write.
- No crawler execution.
- No duplicate auto-merge.
- No LLM parsing.
- No claim that a zero-match source has no scholarships.
