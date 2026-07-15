# Post-Phase L Fixed Integration Scope

## Objective

Deliver a real non-production source-to-review-to-projection path for the fixed pilot cohort, in `main`, without replacing protected current behavior prematurely.

## Canonical Boundaries

- `notice_sources.source_id` is the DB canonical source identity.
- `source_key` remains the exact-match crawler natural/idempotency key and is retained as evidence/snapshot data.
- The normalized crawler graph is the canonical ingestion and provenance direction.
- `crawled_notices` remains a physical compatibility layer until a separately approved cutover.
- `scholarships` numeric IDs and `/scholarships/[id]` routes remain compatible.
- Public exposure is fail-closed. Zero match and disappearance are not deletion evidence.

## Integrated Scope

L is one program, internally sequenced as needed, covering:

- authorized target-schema inventory and additive migration implementation;
- graph and append-only review-decision persistence;
- graph-to-legacy comparison and reconciliation;
- selected runner, exact source resolution, adapters, pagination, detail resolution, URL aliases, normalized output, body evidence, and asset metadata;
- main observability/run evidence and existing admin review integration;
- controlled non-production public-projection preview; and
- replay, idempotency, duplicate, alias, numeric-route reconciliation, rollback, and explicit excluded-case evidence.

## Representative Vertical Slice

`cau_001 -> ingestion -> normalized graph -> review UI -> append-only review decision -> controlled public-projection preview -> rollback/replay validation`

This is an internal L checkpoint, not a separate Codex assignment. After it succeeds, L continues through `cau_002` and `yonsei_060` unless an external approval or genuine blocker occurs.

## Target Code Locations

- `scripts/crawl-scholarship-notices.mjs` and `lib/crawler-adapters/` for runner and adapters.
- `scripts/resolve-crawler-source-identities.mjs` for exact source resolution port.
- New main-owned ingestion, review-event, compatibility-comparison, and projection modules under `lib/` and the established `app/admin/review` consumer boundary.
- Existing `lib/scholarships/public-scholarship-*` and `/scholarships/[id]` routes for controlled preview compatibility.

## External Boundaries Before Implementation

- An authorized operator supplies the sanitized target-schema inventory and staging/environment authority.
- A named migration/release owner supplies backup/export responsibility before any migration rehearsal.
- No production migration, production write, production dual-write, destructive replacement, public auto-publish, external LLM call, or LLM suggestion persistence is authorized by this scope.
