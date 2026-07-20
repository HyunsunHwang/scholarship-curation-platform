# Engine Phase 4 P0 remediated extractor preview

## Scope and decision

**PASS** for the bounded extractor-remediation implementation preview. This is not an official P0 or full Gate C reevaluation. Full-schema Gate C and Phase 5 remain **HOLD**.

- `preview_only=true`
- `official_p0_reevaluation_completed=false`
- `official_full_gate_c_reevaluation_completed=false`
- `full_gate_c_status=HOLD`
- `phase5_status=HOLD`

## Architecture

- Baseline remains reproducible at `lib/engine-phase-4/deterministic-extractor.mjs` (engine-phase-4-deterministic-baseline/v1; SHA-256 `a6f7cc4134f593da2e52d93e86e012c96f5f5a6b1363230f1410148d54bbc024`).
- The remediated entry point is `extractP0RemediatedCandidate` in `lib/engine-phase-4/p0-remediated-extractor.mjs`, version `1.1.0`.
- Baseline whitespace, explicit-label, and date-candidate normalizers are imported read-only. P0 classification, role separation, amount preservation, evidence adaptation, review reasons, and lifecycle calculation are isolated in the new version.
- Evaluation clock: `2026-07-20T00:00:00+09:00`.

## Metrics

| Metric | Value |
| --- | ---: |
| case_count | 24 |
| schema_valid_count | 24 |
| semantic_valid_count | 24 |
| deterministic_rerun_match | true |
| publishable_count | 12 |
| terminal_count | 4 |
| review_required_count | 24 |
| unknown_count | 30 |
| ambiguous_count | 6 |
| conflicting_count | 0 |
| schema_gap_count | 3 |
| unsupported_present_claim_count | 0 |
| missing_evidence_reference_count | 0 |
| source_url_substitution_count | 0 |
| low_quality_body_rejected_count | 2 |
| attachment_missing_provenance_count | 0 |
| attachment_rejected_count | 7 |
| ocr_missing_locator_count | 0 |
| ocr_low_quality_rejected_count | 1 |
| classification_title_only_count | 18 |
| classification_multi_evidence_count | 6 |
| duplicate_evidence_suppressed_count | 0 |
| attachment_present_claim_count | 6 |
| ocr_present_claim_count | 0 |

Document kinds: correction_notice=2, general_guidance=1, recruitment_notice=16, result_announcement=3, unknown_document=2.

## Known-case results

| Case | Document kind | Publishable | Terminal | Opportunity kind | Lifecycle |
| --- | --- | --- | --- | --- | --- |
| p4c_001_student_affairs_special | recruitment_notice | true | false | scholarship | unknown:unknown |
| p4c_002_national_second_round | recruitment_notice | true | false | scholarship | present:closed |
| p4c_004_national_work_result | result_announcement | false | true | not_applicable | not_applicable:null |
| p4c_005_miraero_second | recruitment_notice | true | false | scholarship | present:closed |
| p4c_006_gwangsan_extension | correction_notice | false | false | scholarship | unknown:unknown |
| p4c_008_cau_welfare_result_2025_1 | result_announcement | false | true | not_applicable | not_applicable:null |
| p4c_009_cau_welfare_result_2024_2 | result_announcement | false | true | not_applicable | not_applicable:null |
| p4c_020_uic_supporters_table | recruitment_notice | true | false | paid_student_activity | unknown:unknown |
| p4c_022_grad_seoul_foundation_pdf | recruitment_notice | true | false | scholarship | unknown:unknown |
| p4c_024_dean_recommendation_guidance | general_guidance | false | true | not_applicable | not_applicable:null |

Cases 1, 2, and 5 are no longer silently suppressed. Case 4 is terminal. Cases 6, 8, 9, and 22 use only contract lifecycle states. Case 20 is partitioned as paid student activity. Case 24 remains terminal general guidance.

## Safety

All 9 P0 fields use evidence-linked, fail-closed states. Unsupported present claims, missing evidence references, and source-route substitution are zero. Automatic publication remains disabled. Protected baseline, contract, corpus, gold, and official report hashes are unchanged.

Body text with an explicit unsafe quality state and attachments without complete provenance are excluded before extraction. OCR requires safe quality, document provenance, page, and bounding-box coordinates. Per-case rejected sources, classification evidence IDs, and present-field source types are recorded in the JSON diagnostics.

## Next step

Strengthen source/evidence preservation, then run separately authorized official P0 and full Gate C reevaluations.
