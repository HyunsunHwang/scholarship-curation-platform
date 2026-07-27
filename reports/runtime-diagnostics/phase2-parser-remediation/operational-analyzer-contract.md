# Phase 2 operational analyzer contract

The crawler and parser record observations; the operational analyzer interprets them. A report builder may aggregate analyzer output, but must not assign remediation outcomes by Source ID or optimistic defaults.

## Evidence semantics

- `candidate_navigation_leak_count`: selected candidate nodes originating in a navigation or pagination container. Only this supports `LIST_SELECTOR_MENU_CONTAMINATION`.
- `navigation_url_overlap_count`: a retained candidate URL also appears in navigation. This is evidence only, never contamination by itself.
- Candidate recall is `verified` only with paired candidate-diff evidence showing no removed real or unknown notice and no added false positive.

## Phase 2 analyzer output

`analysis_valid`, `phase2_status`, parser-contract, recall, detail-identity, pagination, runtime-accessibility, `next_action`, `next_phase_queue`, `blocking_reason`, and analysis codes are analyzer-owned fields. Contradictory evidence yields `analysis_valid=false` with `ANALYZER_EVIDENCE_CONTRADICTION`.

Ordinary runtime diagnostics have no paired candidate comparison and therefore record `phase2_status=not_evaluated`. The paired remediation report supplies explicit comparison evidence; without it, candidate recall remains unverified and the terminal projection is `blocked_insufficient_authoritative_evidence`.

## Canonical phase-2 state model

- List parser contract: `verified`, `limited_evidence`, `invalid`, `not_observed`, `blocked_external`.
- Candidate recall: `verified`, `unverified`, `invalid`, `not_evaluated`.
- Detail identity: `verified`, `partially_verified`, `unverified`, `not_observed`, `not_required`, `blocked_external`.
- Pagination: `verified`, `unverified`, `not_applicable`, `blocked_external`.
- Runtime accessibility: `reachable`, `intermittent`, `blocked_external`, `transport_failure`, `not_evaluated`.

The final remediation projection is one of `verified_heuristic_safe`, `parser_profile_applied`, `configured_selector_applied`, `list_url_correction_required`, `adapter_required`, `blocked_external`, or `blocked_insufficient_authoritative_evidence`. `manual_review_required` is not a terminal phase-2 outcome.

## Prohibited interpretations

- URL overlap must not be treated as a selected navigation leak.
- Missing detail identity samples must not invalidate a verified list-parser contract.
- A report generator must not assign `candidate_recall_verified=true` without diff evidence.
- Runtime transport failure must not be reported as parser success.
