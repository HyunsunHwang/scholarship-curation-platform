# Integration Foundation Validation Report

Generated at: 2026-07-13T03:39:08.513Z

## Status

PASS

## Metrics

- candidate_count_requested: 7
- resolved_source_id_count: 5
- missing_source_id_count: 1
- ambiguous_source_id_count: 1
- clean_count: 1
- needs_review_count: 3
- blocked_count: 3
- duplicate_review_count: 1
- quality_review_count: 3
- no_assets_count: 5
- zero_match_source_count: 1
- deterministic_rerun_match: true
- output_schema_valid: true

## Tests

- PASS: known source_key resolves to one source_id
- PASS: missing source_key fails closed
- PASS: ambiguous mapping fails closed
- PASS: missing source_id cannot become clean
- PASS: duplicate/review never auto-cleans
- PASS: quality-review never auto-cleans
- PASS: no_assets alone is not an automatic blocker
- PASS: no_assets with sufficient body can be clean
- PASS: zero-match is source-health evidence, not absence proof
- PASS: same input rerun is deterministic
- PASS: output includes required adapter fields
- PASS: validation path performs no DB write

## Sample Evidence

- clean_candidate: source_key=cau_001, status=clean, resolution=resolved
- missing_source: source_key=missing_999, status=blocked, resolution=missing
- ambiguous_source: source_key=ambiguous_source, status=blocked, resolution=ambiguous
- duplicate_review: source_key=cau_002, status=needs_review, resolution=resolved
- quality_review: source_key=cau_003, status=needs_review, resolution=resolved
- image_only_suspected: source_key=cau_006, status=needs_review, resolution=resolved
- source_health_only: source_key=cau_007, status=blocked, resolution=resolved

## Safety

- db_access: false
- db_write: false
- migration_run: false
- generated_database_types_changed: false
- admin_ui_changed: false
- product_ui_changed: false
- production_main_access: false

## Remaining Decisions

- schema proposal before graph table migration
- admin integration field contract before UI wiring
- medium-term crawled_notices role during adapter-backed transition
- review_status storage location and lifecycle
- no_assets/body_quality storage or read-model location
- rollback minimum criteria before any production apply path
