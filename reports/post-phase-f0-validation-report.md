# Post-Phase F-0 Adapter Foundation Validation

Generated at: 2026-07-13T00:00:00.000Z

## Status

PASS

## Metrics

- fixture_count: 11
- resolved_source_count: 8
- unresolved_source_count: 1
- ambiguous_source_count: 1
- missing_source_key_count: 1
- clean_count: 2
- duplicate_review_count: 1
- quality_review_count: 1
- blocked_count: 7
- no_assets_count: 1
- image_only_suspected_count: 1
- zero_match_observed_count: 1
- admin_review_required_count: 11
- auto_apply_allowed_count: 2
- batch_warning_count: 3
- rollback_scope_available_count: 4
- deterministic_rerun_match: true
- output_schema_valid: true
- arithmetic_consistency_valid: true
- source_resolution_policy_valid: true

## Tests

- PASS: fixtures/post-phase-f0/resolved-clean-candidate.json expected counts
- PASS: fixtures/post-phase-f0/resolved-no-assets-text-sufficient.json expected counts
- PASS: fixtures/post-phase-f0/resolved-duplicate-review.json expected counts
- PASS: fixtures/post-phase-f0/resolved-quality-review.json expected counts
- PASS: fixtures/post-phase-f0/unresolved-source-candidate.json expected counts
- PASS: fixtures/post-phase-f0/ambiguous-source-candidate.json expected counts
- PASS: fixtures/post-phase-f0/missing-source-key-candidate.json expected counts
- PASS: fixtures/post-phase-f0/image-only-suspected-candidate.json expected counts
- PASS: fixtures/post-phase-f0/zero-match-observed-source.json expected counts
- PASS: fixtures/post-phase-f0/batch-incomplete-warning.json expected counts
- PASS: fixtures/post-phase-f0/mixed-adapter-batch.json expected counts
- PASS: adapter output schema is valid
- PASS: adapter arithmetic is consistent
- PASS: adapter semantic output is deterministic
- PASS: unresolved, ambiguous, missing, inactive, and alias-required source rows fail closed
- PASS: duplicate review rows never auto apply
- PASS: quality review rows never auto apply
- PASS: blocked rows never auto apply
- PASS: no-assets text-sufficient rows are not blockers
- PASS: image-only suspected rows require admin review
- PASS: zero-match remains observed evidence rather than absence proof
- PASS: incomplete and blocked batches surface a warning or blocker
- PASS: adapter runtime performs no DB access, write, migration, crawler execution, or destructive action

## Safety

- db_access: false
- db_write: false
- supabase_access: false
- migration: false
- crawler_execution: false
- destructive_action: false
- admin_ui_modified: false
- workflow_or_package_modified: false

## Limitations

- Fixture-backed read-only adapter evidence only; no live DB, crawler, or admin UI integration is exercised.
- An alias mapping source must be explicitly designed before source_key/source_id divergence can proceed.
- Zero-match is an observed source result, not a source-exhaustion or scholarship-absence proof.
