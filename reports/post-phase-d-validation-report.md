# Post-Phase D Rollback Cleanup Dry-run Validation Report

Generated at: 2026-07-13T00:00:00.000Z

## Status

PASS

## Scope

- Read-only rollback scope and cleanup dry-run planner.
- Fixture/evidence-based estimated counts only.
- No DB access, DB write, cleanup execution, or SQL generation.

## Metrics

- input_record_count: 27
- scoped_run_count: 6
- scoped_source_count: 6
- scoped_canonical_key_count: 6
- table_entity_count: 10
- estimated_affected_row_count: 27
- shared_record_risk_count: 3
- orphan_risk_count: 2
- partial_write_finding_count: 4
- blocked_reason_count: 9
- manual_review_required_count: 7
- missing_identifier_count: 1
- ambiguous_identifier_count: 1
- deterministic_rerun_match: true
- output_schema_valid: true
- db_access: false
- db_write: false
- cleanup_execution: false

## Tests

- PASS: single rehearsal/run scope is identified
- PASS: multi-source batch scope is aggregated
- PASS: missing rollback identifier is blocked
- PASS: ambiguous identifier is blocked
- PASS: shared notice/alias/asset relation is not auto-cleanable
- PASS: orphan risk is detected
- PASS: partial write pattern is detected
- PASS: pre-existing and newly-created ownership ambiguity is blocked
- PASS: source row is not a default cleanup target
- PASS: zero affected row is no-op/review, not success
- PASS: same fixture produces deterministic dry-run plan
- PASS: output schema has required dry-run safety fields
- PASS: cleanup SQL or delete/update command is not generated

## Fixture Results

- clean-single-run: estimated=8, blocked=0, manual_review=0
- multi-source-batch: estimated=8, blocked=1, manual_review=0
- shared-record-risk: estimated=5, blocked=3, manual_review=3
- orphan-risk: estimated=3, blocked=2, manual_review=2
- partial-write: estimated=3, blocked=1, manual_review=1
- missing-identifier: estimated=0, blocked=2, manual_review=1

## Limitations

- This phase proves read-only scope classification against local fixtures, not production cleanup readiness.
- All affected row counts are estimated from fixture evidence and are not live DB row counts.
- No personal-dev or production/main Supabase access was used.
- No destructive SQL, migration, guarded apply, admin UI, or product UI integration is included.
- Future destructive cleanup requires separate team approval, DB-backed evidence, and execution-specific safeguards.
