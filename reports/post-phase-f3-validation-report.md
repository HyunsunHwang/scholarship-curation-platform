# Post-Phase F-3 Quality / Attachment / Encoding Validation

## Status

PASS

## Metrics

- p1_target_count: 2
- p1_resolved_count: 1
- p1_deferred_count: 1
- unresolved_without_next_action_count: 0
- source_spot_check_count: 5
- item_spot_check_count: 7
- detail_verified_count: 3
- attachment_case_count: 3
- attachment_metadata_present_count: 2
- attachment_only_possible_count: 1
- attachment_download_unverified_count: 2
- encoding_case_count: 2
- mojibake_suspected_count: 1
- replacement_character_case_count: 1
- encoding_normalization_improved_count: 1
- image_only_suspected_count: 1
- short_body_case_count: 3
- second_pass_parser_recommended_count: 3
- clean_after_fix_count: 1
- review_retained_count: 3
- blocked_retained_count: 2
- false_clean_prevented_count: 5
- manual_review_required_count: 3
- fail_closed_policy_valid: true
- zero_match_absence_claim_valid: true
- production_apply_unchanged: true
- deterministic_rerun_match: true
- output_schema_valid: true
- restricted_file_scope_valid: true

## Tests

- PASS: all P1 items are resolved or deferred with next actions
- PASS: resolved P1 items retain evidence and success criteria
- PASS: attachment metadata before and after fixtures pass
- PASS: encoding and mojibake before and after fixtures pass
- PASS: no-assets is distinct from attachment-only and risky cases stay non-clean
- PASS: clean after normalization has sufficient text and no remaining risk
- PASS: review and blocked retained fixtures expose reason codes
- PASS: F-2 handoff remains explicit and deferred
- PASS: F-1 admin diagnostics reference F-3
- PASS: fail-closed and absence policies are preserved
- PASS: F-3 reporting performs no DB or crawler operation
- PASS: restricted files are unchanged
- PASS: generated report is deterministic

## Safety

- db_access: false
- db_write: false
- supabase_access: false
- migration: false
- destructive_sql: false
- production_crawler_execution: false
- full_crawl: false
- production_detector_keyword_change: false
- production_apply_path: false
