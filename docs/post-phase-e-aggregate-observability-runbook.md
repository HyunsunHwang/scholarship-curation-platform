# Post-Phase E Aggregate Observability Runbook

## Local Procedure

Run a local fixture through the builder:

```powershell
node scripts/build-crawler-batch-observability.mjs --input fixtures/post-phase-e/healthy-batch.json --output reports/post-phase-e-batch-observability.json --generated-at 2026-07-13T00:00:00.000Z
```

Run all validation fixtures:

```powershell
node scripts/validate-post-phase-e-aggregate-observability.mjs
```

For regression validation, write temporary outputs outside the repository.

## Operator Review Order

1. Confirm `read_only=true`, `db_access=false`, `db_write=false`, and `crawler_execution=false`.
2. Review `batch_identity` for rehearsal, batch, run, expected source, observed source, and resolved source ID evidence.
3. Check `batch_status` and status precedence.
4. Review completion flags.
5. Review aggregate metrics.
6. Review per-source summaries.
7. Review issue codes and blocking flags.
8. Use `rollback_scope_evidence` only as read-only evidence for later review.

## Status Interpretation

`healthy` means all expected source results are observed and trusted for this fixture.

`degraded` means the batch can be complete, but operational issues such as timeout, failure, blocked source result, or review backlog remain.

`incomplete` means evidence is missing or partial and the batch must not be marked complete.

`blocked` means the scope cannot be trusted automatically.

## Stop Conditions

Stop automation and require manual review for:

- unresolved source identity,
- ambiguous source identity,
- conflicting duplicate source result,
- cross-batch record,
- unknown status,
- invalid count,
- missing expected source result,
- partial source result,
- count mismatch,
- empty/no-op batch.

## Zero-match Handling

`zero_match_observed` means only that no match was observed for that source result.

It does not prove:

- the source has no scholarship notice,
- crawler coverage is complete,
- source configuration is correct,
- the source is exhausted.

`safe_to_claim_source_exhaustion` remains false.

## Manual Review Conditions

Manual review is required when:

- `batch_status` is `blocked` or `incomplete`,
- `safe_to_mark_batch_complete=false`,
- any issue has `blocks_completion=true`,
- review or blocked candidate backlog exists,
- source identity does not resolve exactly,
- rollback evidence is incomplete.

## Production Prohibitions

This phase must not:

- access Supabase or any DB,
- run crawler jobs,
- create a DB table or view,
- create an API route,
- change admin or product UI,
- generate or execute cleanup SQL,
- modify migrations or generated database types,
- claim production observability readiness.

## Difference From DB-level Observability

This is a local report/read-model implementation. A future DB-level aggregate batch table would require schema review, migration planning, source ownership rules, retention policy, and production operational approval.
