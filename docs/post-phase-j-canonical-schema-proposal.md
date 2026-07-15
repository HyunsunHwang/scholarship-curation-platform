# Post-Phase J Canonical Schema Proposal

## Decision and boundary

The approved canonical architecture is:

```text
normalized ingestion graph
-> append-only review decision/event layer
-> public scholarship projection
```

`notice_sources.source_id` remains the DB-canonical source identifier. `source_key` remains the crawler-facing natural/idempotency key and is resolved by exact match only. A missing or ambiguous resolution blocks graph ingestion and review eligibility; it never creates a source or uses fuzzy matching.

This proposal is a schema design only. It creates no SQL, applies no migration, enables no dual-write, and does not change runtime readers or writers. `crawled_notices` remains a physical transition/legacy compatibility table, and `scholarships` remains the current public product table with its numeric IDs and `/scholarships/[id]` route contract.

## Value and provenance layers

| Layer | Owner | Rule |
| --- | --- | --- |
| Raw observation | crawl occurrence and asset records | Immutable capture of source response metadata, raw URL, raw title/body, and discovery context. |
| Normalized extraction | notice revision and structured extraction | Versioned parser output with parser/version/quality metadata; it never overwrites raw evidence. |
| Human decision and edits | review event and approved-value snapshot | Append-only reviewer events reference evidence and prior decisions. Corrections supersede, not mutate, prior decisions. |
| Effective approved values | review projection | Deterministically selects the current effective approved decision. |
| Public scholarship values | scholarship projection mapping | Maps effective approval to the existing `scholarships` row without changing its numeric identity. |

Zero match, a missing occurrence, or a crawler failure is source/run evidence only. It is not deletion evidence for a notice or public scholarship.

## Proposed entities

| Entity | Responsibility and identity | Lifecycle and mutability | First additive migration |
| --- | --- | --- | --- |
| `notice_sources` (existing) | Source registry. PK remains existing numeric `id`; canonical business key is unique `source_id`; `source_key` is an exact-resolved crawler key snapshot. | Existing admin-managed mutable registry. | No change. |
| `crawler_source_targets` (if target inventory confirms it) | Optional crawler scheduling/configuration separated from source registry. Natural key: `source_id + target_kind`. | Mutable operational configuration with audit fields. | Deferred until target inventory confirms current shape. |
| `ingestion_crawl_runs` | One bounded crawl execution. UUID/ULID primary key and caller-supplied idempotency key. | Append-only terminal status; start/end timestamps and runner/version metadata. | Yes. |
| `ingestion_source_run_results` | Per-source outcome within a crawl run. Unique `crawl_run_id + source_id`. | Append-only result/evidence, including zero-match observation without absence semantics. | Yes. |
| `ingestion_notices` | Canonical notice identity. Surrogate UUID/ULID PK; FK to `notice_sources.source_id` through the target FK form approved after inventory. | Identity is stable; only operational timestamps may update. | Yes. |
| `ingestion_notice_url_aliases` | Preserve original, canonical, redirect, and alternate URLs. Unique `source_id + normalized_url_hash`. | Add-only alias evidence with first/last observed timestamps. | Yes. |
| `ingestion_notice_occurrences` | A notice observed in a source/run context. Unique `crawl_run_id + source_id + observed_url_hash`. | Append-only raw capture/provenance; no disappearance deletion. | Yes. |
| `ingestion_notice_revisions` | Versioned normalized extraction for a notice. Unique `notice_id + content_hash` plus deterministic revision ordinal. | Add-only raw/normalized payload, parser version, quality, and extraction evidence. | Yes. |
| `ingestion_notice_assets` | Asset metadata and optional storage reference. Unique `notice_occurrence_id + original_url_hash`. | Add-only metadata/status; no download, OCR, or content extraction in J. | Yes. |
| `ingestion_asset_extractions` | Future extracted text/OCR/evidence. | Add-only future entity, separately retained and reviewed. | Deferred. |
| `review_items` | Stable review case for a notice/revision. Unique active identity `notice_id + review_scope`. | Operational case metadata may update; decisions do not live here. | Yes. |
| `review_decision_events` | Immutable human review record. UUID/ULID PK and event idempotency key. | Append-only. Reversal/correction points to prior event; no in-place approval mutation. | Yes. |
| `review_effective_decisions` | Derived projection of current effective decision for one review item. | Rebuildable projection from events; not a source of truth. | Yes, as a table or refreshable read model after inventory review. |
| `review_evidence_references` | Event-to-occurrence/revision/asset/URL evidence links. | Append-only evidence graph. | Yes. |
| `scholarship_projection_mappings` | Links an effective approved review state to existing `scholarships.id`. Unique `scholarship_id`; unique current approved `review_item_id` when applicable. | Projection state is mutable/rebuildable, but source review events remain immutable. | Deferred to J-M5 implementation. |
| `crawled_notices` (existing) | Legacy admin review lifecycle and compatibility layer. | Existing `new/promoted/rejected` writes remain unchanged until cutover. | No change. |
| `scholarships` (existing) | Current public product table and numeric route identity. | Existing admin CRUD remains authoritative for current product behavior. | No change. |

## Notice identity and URL behavior

Identity is source-scoped and uses this priority:

```text
stable external article ID available:
  unique(source_id, external_article_id)
otherwise:
  unique(source_id, canonical_detail_url_hash)
content_hash:
  revision/change detection only
```

- Redirects and board URL changes add `ingestion_notice_url_aliases` records and preserve the original URL.
- A body/title/content change creates a new `ingestion_notice_revisions` row for the same notice identity.
- A temporarily missing notice creates no deletion marker. A source-run result can record an observation failure or zero match.
- Duplicate URLs for one source resolve to one notice through alias evidence. Cross-source republications stay separate notices unless a reviewer explicitly records a relationship; identical content alone is not identity.
- A missing external article ID requires a canonical detail URL. A URL that cannot be normalized safely is `ambiguous_identity`, not a generated identity.

## Review-event contract

Each `review_decision_events` record has: target review item and revision, decision type, reviewer identity, decision timestamp, rationale, evidence references, optional previous/superseded event, optional correction/reversal relationship, and intended public projection action.

Allowed decision types include `approve`, `reject`, `request_changes`, `merge_duplicate`, `supersede`, and `revoke`. The effective-decision projection uses an explicit ordering rule and fails closed when event linkage, reviewer identity, source identity, or evidence is incomplete. It must not infer approval from a mutable `status` column.

## Constraints, indexes, and retention

Expected first-stage constraints include source foreign keys, unique source-scoped notice identities, URL-hash uniqueness, run/source-result uniqueness, occurrence idempotency, revision content-hash uniqueness, asset URL-hash uniqueness, and immutable event identifiers. Expected indexes cover source plus observed timestamp, notice plus latest revision, run plus source, review-item plus effective state, and projection lookup by `scholarships.id`.

Raw observations, revisions, assets, and events retain provenance timestamps and collector/parser/reviewer identifiers. Retention duration for raw payloads and storage objects is a configurable operational policy; it is not set by J. Asset storage references are optional, and extracted text/OCR is deferred.

## Explicit non-decisions

No persistent LLM suggestion/provider table is introduced. A later additive audit model may be considered only after external model quality, privacy, latency, cost, and reliability evaluation. Automatic approval and rejection remain prohibited.

No graph-to-`crawled_notices` dual-write, public projection write, compatibility view replacement, or legacy-table replacement is authorized by this proposal.
