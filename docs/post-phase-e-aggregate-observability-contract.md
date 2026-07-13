# Post-Phase E Aggregate Observability Contract

## Purpose

Post-Phase E defines a read-only report-layer aggregate for crawler batch observability.

It summarizes source-scoped crawler results into a batch or rehearsal view so operators can inspect source coverage, result status, review backlog, fail-closed issues, and rollback evidence.

This contract does not authorize DB access, DB writes, crawler execution, cleanup execution, destructive SQL, schema migration, admin UI, product UI, or production observability deployment.

## Input Contract

The input is local JSON:

```json
{
  "schema_version": "post-phase-e/v1",
  "generated_at": "2026-07-13T00:00:00.000Z",
  "fixture_name": "example",
  "rehearsal_label": "example-rehearsal",
  "batch_id": "example-batch",
  "expected_source_keys": ["cau_001"],
  "source_results": []
}
```

Each source result includes:

```json
{
  "run_id": "string",
  "rehearsal_label": "string",
  "batch_id": "string",
  "source_key": "string",
  "source_id": "string|null",
  "status": "success|zero_match_observed|failed|timeout|partial|blocked",
  "crawled_item_count": 0,
  "matched_item_count": 0,
  "candidate_counts": {
    "clean": 0,
    "needs_review": 0,
    "blocked": 0
  },
  "started_at": "string|null",
  "finished_at": "string|null",
  "error_code": null,
  "canonical_keys": []
}
```

Unknown status values fail closed. Counts must be non-negative integers.

## Source Identity

The aggregate uses the existing exact-match resolver:

- DB canonical source identifier: `notice_sources.source_id`
- crawler-facing natural/idempotency key: `source_key`
- source resolution rule: exact `source_key -> source_id`
- no fuzzy matching
- no automatic source creation
- missing or ambiguous source identity blocks the batch

## Output Contract

The output contains:

- `schema_version`
- `generated_at`
- `read_only`
- `db_access`
- `db_write`
- `crawler_execution`
- `destructive_action`
- `sql_generation`
- `batch_identity`
- `batch_status`
- `completion`
- `metrics`
- `source_summaries`
- `issues`
- `rollback_scope_evidence`
- `zero_match_policy`

All persisted paths are repository-relative. The output must not include local absolute paths.

## Batch Status

Allowed values:

- `healthy`
- `degraded`
- `incomplete`
- `blocked`

Precedence:

`blocked > incomplete > degraded > healthy`

`healthy` requires complete expected source coverage, clean source identity, no conflicting duplicate results, no cross-batch contamination, no partial/failed/timeout/blocked source result, and valid arithmetic.

`degraded` means evidence can be complete but operational warnings exist, such as failed/timeout source result or review backlog.

`incomplete` means expected evidence is missing or partial, counts do not reconcile, or the batch is empty/no-op.

`blocked` means the scope or evidence cannot be trusted: unresolved/ambiguous source identity, conflicting duplicate result, cross-batch contamination, unknown status, invalid count, or invalid batch identity.

## Completion Flags

The output provides:

- `expected_sources_complete`
- `source_results_complete`
- `counts_consistent`
- `source_identity_complete`
- `safe_to_mark_batch_complete`
- `safe_to_claim_source_exhaustion`

`safe_to_claim_source_exhaustion` is always false. A zero-match observation is never absence proof.

## Issue Codes

Machine-readable issue codes include:

- `missing_expected_source_result`
- `duplicate_source_result`
- `conflicting_source_result`
- `unresolved_source_identity`
- `ambiguous_source_identity`
- `cross_batch_record`
- `source_failed`
- `source_timeout`
- `source_partial`
- `source_blocked`
- `zero_match_observed`
- `candidate_review_backlog`
- `candidate_blocked`
- `count_mismatch`
- `unknown_status`
- `invalid_count`
- `empty_batch`

Each issue has `code`, `severity`, `source_key`, `run_id`, `message`, and `blocks_completion`.

## Post-Phase D Linkage

`rollback_scope_evidence` carries:

- `rehearsal_label`
- `batch_id`
- `run_ids`
- `source_keys`
- `source_ids`
- `canonical_keys`
- `evidence_complete`
- `destructive_action_authorized=false`

This evidence helps later rollback review. It is not an execution plan, safe-to-delete verdict, SQL generator, or cleanup approval.
