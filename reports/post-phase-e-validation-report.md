# Post-Phase E Aggregate Observability Validation Report

Generated at: 2026-07-13T00:00:00.000Z

## Status

PASS

## Metrics

- fixture_count: 7
- healthy_batch_count: 1
- degraded_batch_count: 1
- incomplete_batch_count: 2
- blocked_batch_count: 3
- expected_source_count: 13
- observed_unique_source_count: 12
- run_count: 13
- source_result_count: 13
- success_source_count: 8
- zero_match_observed_source_count: 1
- failed_source_count: 0
- timeout_source_count: 1
- partial_source_count: 1
- blocked_source_count: 0
- crawled_item_count: 33
- matched_item_count: 15
- candidate_count: 15
- clean_candidate_count: 12
- needs_review_candidate_count: 1
- blocked_candidate_count: 2
- missing_expected_source_count: 1
- duplicate_source_result_count: 0
- conflicting_source_result_count: 1
- unresolved_source_count: 1
- ambiguous_source_count: 1
- cross_batch_record_count: 2
- issue_count: 14
- deterministic_rerun_match: true
- output_schema_valid: true
- arithmetic_consistency_valid: true
- db_access: false
- db_write: false
- crawler_execution: false
- destructive_action: false

## Fixture Results

- healthy-batch: expected=healthy, actual=healthy, expected_sources=2, observed_sources=2, issues=0, complete=true, PASS
- mixed-outcome-batch: expected=degraded, actual=degraded, expected_sources=3, observed_sources=3, issues=3, complete=true, PASS
- partial-batch: expected=incomplete, actual=incomplete, expected_sources=3, observed_sources=2, issues=2, complete=false, PASS
- conflicting-duplicate-result: expected=blocked, actual=blocked, expected_sources=1, observed_sources=1, issues=2, complete=false, PASS
- unresolved-source-batch: expected=blocked, actual=blocked, expected_sources=2, observed_sources=2, issues=4, complete=false, PASS
- cross-batch-contamination: expected=blocked, actual=blocked, expected_sources=2, observed_sources=2, issues=2, complete=false, PASS
- empty-batch: expected=incomplete, actual=incomplete, expected_sources=0, observed_sources=0, issues=1, complete=false, PASS

## Tests

- PASS: healthy batch is classified as healthy
- PASS: complete healthy batch can be marked complete
- PASS: zero-match is an observation, not absence proof
- PASS: mixed complete outcomes are degraded, not healthy
- PASS: missing expected source result makes batch incomplete
- PASS: partial result makes batch incomplete
- PASS: conflicting duplicate makes batch blocked
- PASS: unresolved source identity makes batch blocked
- PASS: ambiguous source identity makes batch blocked
- PASS: cross-batch record makes batch blocked
- PASS: empty batch is no-op/review, not healthy
- PASS: source result counts reconcile with unique source counts
- PASS: candidate sub-counts reconcile with candidate total
- PASS: negative counts are rejected or blocked
- PASS: unknown statuses fail closed
- PASS: source rows are not modified or created
- PASS: output schema contains required fields
- PASS: same fixture produces deterministic semantic output
- PASS: output arrays have stable ordering
- PASS: no DB access or write occurs
- PASS: no crawler execution occurs
- PASS: no destructive SQL or cleanup command is generated
- PASS: rollback scope evidence remains read-only
- PASS: safe_to_claim_source_exhaustion is always false

## Limitations

- synthetic local fixture based validation only
- not a live crawler run aggregate
- live DB state and live row counts are not verified
- production observability readiness is not proven
- zero-match is an observation, not absence proof
- no DB-level batch table, API route, UI, alerting, or cleanup execution is implemented
- Post-Phase D destructive execution remains unauthorized
