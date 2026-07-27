# Phase 2 operational analyzer contract

The crawler and parser record observations; the operational analyzer interprets them. A report builder may aggregate analyzer output, but must not assign remediation outcomes by Source ID or optimistic defaults.

## Evidence semantics

- `candidate_navigation_leak_count`: selected candidate nodes originating in a navigation or pagination container. Only this supports `LIST_SELECTOR_MENU_CONTAMINATION`.
- `navigation_url_overlap_count`: a retained candidate URL also appears in navigation. This is evidence only, never contamination by itself.
- Candidate recall is `verified` only with paired candidate-diff evidence showing no removed real or unknown notice and no added false positive.

## Phase 2 analyzer output

`analysis_valid`, `phase2_status`, parser-contract, recall, detail-identity, pagination, runtime-accessibility, `next_action`, `next_phase_queue`, `blocking_reason`, and analysis codes are analyzer-owned fields. Contradictory evidence yields `analysis_valid=false` with `ANALYZER_EVIDENCE_CONTRADICTION`.

Ordinary runtime diagnostics have no paired candidate comparison and therefore record `phase2_status=not_evaluated`. The paired remediation report supplies explicit comparison evidence; without it, candidate recall remains unverified and the Source remains `manual_review_required`.

## Prohibited interpretations

- URL overlap must not be treated as a selected navigation leak.
- Missing detail identity samples must not invalidate a verified list-parser contract.
- A report generator must not assign `candidate_recall_verified=true` without diff evidence.
- Runtime transport failure must not be reported as parser success.
