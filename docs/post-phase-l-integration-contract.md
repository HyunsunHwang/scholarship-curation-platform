# Post-Phase L Integration Contract

## Vertical slice

```text
bounded main runner
-> exact source_key to notice_sources.source_id resolution
-> normalized ingestion graph
-> crawled_notices compatibility row
-> existing admin review screen
-> immutable review decision event
-> derived effective decision
-> fail-closed projection preview
-> replay, reconciliation, and bounded rollback evidence
```

The main repository runner is the canonical owner. Personal-engine behavior is integrated only where the K matrix selected port or merge. No second crawler product or replacement admin console is introduced.

## Target guard

All L remote writers require all of the following before a client is created:

- explicit target ref `hrayfvdggbhfmmzfblly`
- URL-derived ref equal to that explicit ref
- exact URL `https://hrayfvdggbhfmmzfblly.supabase.co`
- no production denylist ref in target inputs
- `POST_PHASE_L_APPLY=true`
- exact `POST_PHASE_L_APPLY_CONFIRMATION` token
- explicit `--apply`

Default behavior is local dry-run. Environment values are never printed or persisted.

## Source and notice identity

`source_key` resolves only by exact equality to `notice_sources.source_id`. Zero matches produce `blocked_missing_source`; more than one exact inventory row produces `blocked_ambiguous_inventory`. Wrong case, fuzzy name matching, numeric-PK fallback, and automatic source creation are prohibited.

Notice identity uses `source_id + external article ID` when a stable article ID is available. Otherwise it uses `source_id + canonical detail URL hash`. Content hash creates or resolves a revision and is never notice identity.

Original, canonical, and final URLs remain attributable alias evidence. Tracking parameters and fragments are removed by versioned normalization. Equivalent aliases cannot create duplicate canonical notices.

## Graph and evidence

The J entity names are preserved:

- `ingestion_crawl_runs`
- `ingestion_source_run_results`
- `ingestion_notices`
- `ingestion_notice_url_aliases`
- `ingestion_notice_occurrences`
- `ingestion_notice_revisions`
- `ingestion_notice_assets`
- `review_items`
- `review_decision_events`
- `review_effective_decisions`
- `review_evidence_references`

Run, source-result, occurrence, revision, asset, event, and evidence rows are append-only. Notice last-seen, URL-alias last-seen, review-item operational state, and the derived effective projection may be updated under their constrained contracts.

Zero match, transport failure, parser failure, and unresolved adapter outcomes are source-result evidence. None implies notice deletion or source exhaustion.

## Review and compatibility

The existing `crawled_notices` table and numeric `scholarships.id` route remain intact. In the L environment, graph ingestion creates a compatibility row only after exact source resolution. Admin approve/reject/reopen actions call one database function that appends a review event, derives the effective decision, and then updates the L compatibility state.

Direct event UPDATE and DELETE are rejected. A correction is a new event that supersedes the current effective event. Duplicate or stale review submissions are rejected by locked legacy state checks or the event idempotency key.

## Projection preview

The preview is calculated inside the existing admin review detail. It is eligible only when the effective decision is `approve`, source result is `success`, required fields are present, and body quality is accepted. It always returns `is_verified=false`, `list_on_home=false`, and `publicExposureEnabled=false`.

Blocked, unresolved, zero-match, unreviewed, rejected, missing-body, and weak-body cases remain hidden. There is no automatic public insert, route exposure, or production dual-write.

## External AI boundary

The L environment hides the existing AI buttons and rejects their server actions. External provider call count and suggestion persistence remain zero.
