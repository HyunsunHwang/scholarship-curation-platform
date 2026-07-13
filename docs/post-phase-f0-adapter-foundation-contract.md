# Post-Phase F-0 Adapter-Backed Review Read-Model Contract

## Purpose and Scope

Post-Phase F-0 is a local, read-only adapter foundation between normalized crawler candidates and a future upstream review read model. The normalized crawler graph remains the long-term canonical ingestion model. This adapter does not create a schema, call Supabase, write a database row, execute a crawler, or alter an existing admin page.

`notice_sources.source_id` is the DB-level canonical source identifier. `source_key` is the crawler-facing stable natural and idempotency key. The adapter resolves `source_key` to `source_id`, preserves the original key as evidence, and never treats `source_key` as a DB-wide canonical identifier.

## Source Identity Policy

| Status | Normal review candidate | Auto apply | Policy |
| --- | --- | --- | --- |
| `resolved` | yes | subject to B/C and batch policy | exact source-key mapping resolved to one `source_id` |
| `unresolved` | no | no | no exact mapping; fail closed |
| `ambiguous` | no | no | multiple `source_id` candidates; fail closed |
| `missing_source_key` | no | no | source key absent; fail closed |
| `inactive_source` | no | no | identity resolves but source is marked inactive |
| `source_key_alias_required` | no | no | divergent future key needs an explicit alias mapping source |

F-0 reuses `resolveSourceKey` from the Integration Foundation. It adds the adapter-level `inactive_source` and `source_key_alias_required` distinctions without changing the resolver contract. Fuzzy matching, silent inserts, automatic source creation, and implicit aliasing are prohibited.

## Adapter Read-Model Shape

Each row includes `source_id`, `source_key_snapshot`, `source_resolution_status`, `source_resolution_reason`, `canonical_key`, title and URL fields, publication/body/asset fields, B/C quality and review fields, `auto_apply_allowed`, `admin_review_required`, target and keyword summaries, run/batch fields, source-result and zero-match fields, `observability_issue_count`, `rollback_scope_available`, `occurrence_summary`, and `evidence_json`.

`source_id` is populated only for resolved identities. `evidence_json` contains the resolver evidence, B/C policy evidence, aggregate-observability context, and adapter warning codes.

## B/C Quality Policy Connection

F-0 delegates quality classification to `buildReviewBacklogQualityFoundation`. Therefore duplicate review, quality review, blocking validation errors, no-assets, and image-only semantics retain the existing B/C contract.

- Duplicate and quality review rows never allow auto apply.
- Image-only suspected rows require admin review.
- `no_assets_text_sufficient` is not a blocker by itself.
- A source-resolution failure overrides otherwise clean candidate content.

## E Aggregate Observability Connection

F-0 accepts `latest_batch_label`, `latest_run_id`, `batch_observability_status`, `source_result_status`, issue count, and rollback-scope availability. `incomplete` and `degraded` batches become adapter warnings that suppress automatic apply. A `blocked` batch is a blocker. These are read-model signals only; no rollback or cleanup action is performed.

`zero_match_observed` means an observed run outcome only. It is never evidence that a source is exhausted or that scholarships are absent.

## F-1 and Later Conditions

F-1 may connect an admin UI only after review-decision storage, lifecycle, authorization, and adapter endpoint contracts are agreed. A schema proposal and guarded apply contract need explicit source alias design, durable review/audit state, rollback criteria, and separate approval. `crawled_notices` remains a possible staging, read-model, or compatibility layer during that transition.

## Non-Goals

- No admin or product UI implementation.
- No migration, production DB write, Supabase access, crawler execution, or guarded apply.
- No package, lockfile, workflow, or database type change.
- No LLM parsing or source-coverage completeness claim.
