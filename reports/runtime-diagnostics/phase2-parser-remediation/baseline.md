# Phase 2 parser remediation baseline

- Historical targets: 87
- Current selected navigation leaks: 0
- Current navigation URL overlap Sources: 84

## Contract audit

- The crawler evidence distinguishes candidate_navigation_leak_count from navigation_url_overlap_count.
- The remediation report generator currently derives final_state outside the operational analyzer, so phase 1 must move final phase2 interpretation into analyzer output.
- The remediation report generator defaults candidate_recall_verified for non-configured sources without candidate-diff evidence; phase 1 must remove that optimistic default.
- Current operational capability_status still permits manual_review_required; phase 1 must introduce the phase2 terminal status model without changing crawler observation semantics.

## Current capability status

- posts_found_no_scholarship: 32
- list_supported_detail_unverified: 12
- adapter_required: 2
- valid_zero_candidates: 40
- manual_review_required: 1
