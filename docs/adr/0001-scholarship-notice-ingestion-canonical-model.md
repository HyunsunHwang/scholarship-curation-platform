# ADR 0001: Scholarship Notice Ingestion Canonical Model and Adapter-First Migration Strategy

## Status

Proposed.

Not yet implemented.

Requires team review before schema migration or UI integration.

## Context

The upstream repository has independently advanced product-facing UI, admin/review UI, `notice_sources`, `crawled_notices`, contests-related schema, and Supabase migrations.

The user development branch validated a normalized crawler graph through Roadmap Phase 1~7 in personal-dev. That work focused on DB/ingest structure, guarded apply mechanics, read-only comparison, duplicate/orphan checks, rollback identifiers, and operational reporting. It does not prove production readiness, production/main DB safety, or nationwide coverage completeness.

The normalized crawler graph tracks source identity, notice identity, occurrences, targets, URL aliases, assets, keyword matches, crawler runs, source results, audit results, and crawler errors. This gives stronger provenance and operational auditability than a single staging table.

The compatibility review found partial compatibility with upstream, but high risk for a broad merge. Main risk areas include DB model overlap, generated `lib/database.types.ts`, `package.json` scripts, crawler workflow, source inventory, and admin review UI.

## Decision

The long-term canonical ingestion model for scholarship notices should be the normalized crawler graph.

The DB-level canonical source identity should be upstream `notice_sources.source_id`.

The crawler-facing natural and idempotency key should remain `source_key`.

Short-term integration should be adapter/read-model first. The existing upstream admin/review UI should not be broken, replaced, or rewritten immediately.

`crawled_notices` should initially remain as a staging table, read-model table, or legacy compatibility layer. It should not be treated as the final long-term canonical ingestion model once the normalized graph is agreed and introduced.

The normalized crawler graph should be introduced as the write, audit, and provenance layer only after schema agreement, source identity agreement, and team review.

## Source Identity Policy

`source_id` is the DB canonical identifier. It is owned by upstream `notice_sources` and should be used as the long-term foreign key for crawler graph records.

`source_key` is the crawler-facing stable natural key and idempotency key. It is useful for crawler configuration, source registry traceability, local fixtures, and historical run reconciliation.

The adapter must resolve `source_key` to `notice_sources.source_id` before recording graph data or producing upstream-compatible read-model output.

Long-term crawler graph tables should store `source_id` as a foreign key. They may also store `source_key` as a snapshot, alias, or evidence field for traceability and idempotency.

When integrating with upstream, `source_key` must not be treated as the top-level DB-wide canonical ID.

## Data Model Direction

`notice_sources` should be the canonical source registry. It owns the DB identity for a crawlable source.

The normalized crawler graph should be the canonical ingestion, provenance, audit, occurrence, target, asset, keyword, run, source-result, and error model.

`crawled_notices` should be retained short-term as a staging table, read-model table, or legacy compatibility layer for existing upstream product/admin flows.

The admin review UI should initially read adapter output or a `crawled_notices`-compatible read model. It should not be forced to become graph-native in the first integration step.

The future review UI should gradually move to graph-backed state for duplicate review, occurrence history, no-assets/body-quality policy, source health, run history, and rollback scope.

## Adapter-First Migration Strategy

Stage 0: Documentation and team agreement. Record the canonical model, source identity policy, non-goals, and migration boundaries before schema or UI implementation.

Stage 1: Read-only adapter contract. Define how crawler graph output resolves `source_key` to `source_id` and maps into upstream-compatible review/read-model output.

Stage 2: Graph to `crawled_notices`-compatible export/read model. Produce local JSON or a read-only generated shape first. Do not write production/main DB.

Stage 3: Admin review queue reads adapter output. Existing UI remains operational while the adapter supplies the fields required by review screens.

Stage 4: Selected graph-backed review features. Introduce duplicate state, occurrence history, no-assets/body-quality status, source health, batch run history, and rollback scope one feature at a time.

Stage 5: Downgrade or remove `crawled_notices` after migration. Once UI and operational tooling are graph-backed, `crawled_notices` can remain only as a read model/staging layer or be removed through a separately approved migration.

## Non-Goals

This ADR does not approve immediate production DB migration.

This ADR does not approve a broad merge of the user development branch into upstream.

This ADR does not approve replacing upstream admin UI now.

This ADR does not claim nationwide coverage completeness.

This ADR does not claim that Roadmap Phase 6 clean84 applies to all 179 observed items or all 613 sources.

This ADR does not authorize production/main Supabase writes.

This ADR does not authorize raw/arbitrary Supabase SQL, cleanup SQL, or destructive cleanup execution.

## Consequences

Positive consequences:

- Stronger provenance and auditability for notice ingestion.
- Safer DB write workflow through source resolution, guarded apply, and explicit review boundaries.
- Better tracking for duplicates, occurrences, targets, assets, keywords, runs, source results, and errors.
- Clearer migration path from current upstream staging/review flow to graph-backed operations.
- Existing UI can continue operating during transition.

Negative consequences and costs:

- An adapter/read-model layer is required.
- Temporary dual-model complexity must be managed deliberately.
- The team must agree on the `source_id` / `source_key` contract.
- Future migration from `crawled_notices` to graph-backed review state is still required.
- `lib/database.types.ts` and migrations must be regenerated only after schema agreement.
- Product/admin UI integration must avoid relying on legacy-only fields that cannot be derived from the graph.

## Risks

Divergence risk: if `crawled_notices` and the normalized graph both evolve independently, the service may accumulate two competing ingestion models.

UI regression risk: if `app/admin` is merged or rewritten too early, upstream product/admin work can be broken or overwritten.

Schema/type drift risk: generated database types can become unreliable if schema drafts and upstream migrations are mixed without an agreed migration plan.

Source identity mismatch risk: if `source_key` is treated as DB canonical, upstream `notice_sources.source_id` integration will become fragile.

Overclaim risk: Roadmap Phase 1~7 personal-dev evidence must not be presented as production readiness, production/main safety, or national coverage completion.

Operational risk: write/apply commands should not be merged before read-only adapter validation and source identity resolution are proven.

## Recommended Integration Order

1. ADR and team discussion.
2. Source identity alignment read-only report.
3. Adapter/read-model local JSON prototype.
4. Rollback dry-run + aggregate batch observability.
5. Review backlog + no_assets/body quality policy.
6. Adapter-backed admin review MVP.
7. User-facing scholarship listing/detail/search/filter MVP.
8. Bounded deeper crawl coverage improvement.
9. LLM-assisted review prototype.
10. Schema proposal and production migration planning only after team approval.

## Open Questions

- Should crawler graph tables live beside upstream tables or be renamed to match upstream conventions?
- Should `admin_review_notice_view` be a DB view, materialized view, API route, or generated JSON read model?
- Which fields from the crawler graph are required by the current admin review UI?
- What is the minimum `source_key` to `source_id` mapping guarantee?
- How should `no_assets` and `body_quality` be surfaced in the admin UI?
- How should duplicate/review and quality-review backlog be represented?
- What rollback/cleanup tooling is required before production apply?
- Which graph fields must be immutable evidence snapshots rather than mutable review state?
- Should `crawled_notices` continue to receive writes during the transition, or should it be generated from graph output only?

## Final Recommendation

Adopt the normalized crawler graph as the long-term canonical scholarship notice ingestion model.

Adopt `notice_sources.source_id` as the DB canonical source identity.

Keep `source_key` as the crawler-facing stable natural key and idempotency key.

Use adapter-first migration so existing upstream admin/review/product flows can keep operating while graph-backed provenance is introduced safely.

Do not broad-merge DB schema, `app/admin` UI, generated database types, or write/apply commands yet.
