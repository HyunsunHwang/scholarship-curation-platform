# Engine Phase 4 — remediated full Gate C reevaluation

## Decision

**CONDITIONAL PASS**

This evaluates a `p0_remediated_hybrid`: non-P0 fields come from the historical baseline extractor and P0 fields/classification/evidence/review come from remediated extractor 1.1.1. It is neither a production engine nor a complete full-field remediated extractor. Candidate handoff was not executed and Phase 5 remains **HOLD**.

## Identity and execution

- Historical timestamp: `2026-07-19T06:30:00Z`
- P0 lifecycle as-of: `2026-07-20T00:00:00+09:00` (Asia/Seoul)
- Canonical schema: 24/24
- Evidence integrity: 24/24
- Deterministic rerun: true
- Unsupported present: 0
- Missing evidence refs: 0
- Automatic publish: 0
- Stale program/cycle candidates: 0/0

## Legacy status semantic boundary

The historical raw lens compares all original 14 fields verbatim, so legacy `status` gold containing document kinds is reported as a real mismatch against lifecycle values. Gold is not rewritten. In the contract-aligned lens, all 24 legacy status annotations are excluded and 4 reviewer-resolved lifecycle annotations are added separately.

- `legacy_status_semantic_incompatible=true`
- `legacy_status_field_excluded_from_contract_aligned_accuracy=true`

## Historical raw metrics

| Metric | Result |
| --- | --- |
| canonical_schema_valid | 24/24 (100.00%) |
| evidence_integrity | 24/24 (100.00%) |
| document_classification_accuracy | 21/24 (87.50%) |
| field_presence_precision | 82/91 (90.11%) |
| field_presence_recall | 82/189 (43.39%) |
| field_status_exact_accuracy | 199/336 (59.23%) |
| normalized_exact_match | 59/82 (71.95%) |
| normalized_partial_match | NOT EVALUATED — No independently adjudicated element-level partial targets. |
| evidence_attribution_accuracy | 82/82 (100.00%) |
| unsupported_value_rate | 0/108 (0.00%) |
| review_required_recall | 19/19 (100.00%) |
| review_required_precision | 19/24 (79.17%) |
| review_overuse_rate | 5/5 (100.00%) |
| program_candidate_usable_rate | 0/24 (0.00%) |
| cycle_candidate_usable_rate | 0/24 (0.00%) |
| phase5_handoff_usable_rate | 0/24 (0.00%) |

## Contract-aligned comparable metrics

- Comparable fields: 316

| Metric | Result |
| --- | --- |
| field_presence_precision | 79/88 (89.77%) |
| field_presence_recall | 79/169 (46.75%) |
| field_status_exact_accuracy | 196/316 (62.03%) |
| normalized_exact_match | 60/79 (75.95%) |
| document_kind_accuracy | 21/24 (87.50%) |

P0 safety remains: suppression 0, non-recruitment exposure 0, invalid lifecycle 0, unsupported P0 present 0, source substitution 0.

## Baseline delta

| Metric | Classification |
| --- | --- |
| canonical_schema_valid | unchanged |
| evidence_integrity | unchanged |
| document_classification_accuracy | improved |
| field_presence_precision | regressed |
| field_presence_recall | improved |
| field_status_exact_accuracy | semantic_contract_changed |
| normalized_exact_match | semantic_contract_changed |
| evidence_attribution_accuracy | unchanged |
| unsupported_value_rate | unchanged |
| review_required_recall | unchanged |
| review_required_precision | unchanged |
| review_overuse_rate | unchanged |
| program_candidate_usable_rate | unchanged |
| cycle_candidate_usable_rate | unchanged |
| phase5_handoff_usable_rate | unchanged |

Status-exact and normalized-exact changes are classified as `semantic_contract_changed`, not accuracy improvements, because lifecycle semantics replaced legacy document-kind status semantics.

## Production shadow and OCR

- Overclaim: 0
- Safe fail-close: 82
- Schema-gap alignment: 3
- Schema gap collapsed to present / representation-loss risk: 3/3
- Parser success accepted: 7
- Actual OCR accepted: 0
- OCR missing locator / present / missing-bbox present: 0/0/0

Overclaim and representation loss are separate risk classes; zero hallucination-style overclaim does not erase representation-loss findings.

## Identity usability

- Program candidate usable: 0/24
- Cycle candidate usable: 0/24
- Phase 5 handoff usable: 0/24

All historical identity candidates are withheld rather than copied into a stale proposed state. This conservative boundary is why the result is conditional despite passing schema, evidence, and P0 safety gates.

## Cases

| Case | Gold kind | Predicted kind | Publishable | Schema | Review | Handoff usable |
| --- | --- | --- | --- | --- | --- | --- |
| p4c_001_student_affairs_special | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_002_national_second_round | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_003_hope_ladder_extension | correction_notice | correction_notice | false | true | true | false |
| p4c_004_national_work_result | result_announcement | result_announcement | false | true | true | false |
| p4c_005_miraero_second | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_006_gwangsan_extension | correction_notice | correction_notice | false | true | true | false |
| p4c_007_sejong_internal_guidance | general_guidance | recruitment_notice | false | true | true | false |
| p4c_008_cau_welfare_result_2025_1 | result_announcement | result_announcement | false | true | true | false |
| p4c_009_cau_welfare_result_2024_2 | result_announcement | result_announcement | false | true | true | false |
| p4c_010_cau_national_preapplication | recruitment_notice | recruitment_notice | false | true | true | false |
| p4c_011_cau_innovation_hwp | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_012_history_central_love | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_013_history_growth_table | recruitment_notice | unknown | false | true | true | false |
| p4c_014_youth_farmer_image | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_015_seoul_talent_hwp | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_016_asan_hope_hwpx | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_017_uic_2025_fall | recruitment_notice | recruitment_notice | false | true | true | false |
| p4c_018_uic_samsung_updated | correction_notice | unknown | false | true | true | false |
| p4c_019_uic_legacy | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_020_uic_supporters_table | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_021_grad_need_based | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_022_grad_seoul_foundation_pdf | recruitment_notice | recruitment_notice | true | true | true | false |
| p4c_023_russian_alumni_funds | recruitment_notice | recruitment_notice | false | true | true | false |
| p4c_024_dean_recommendation_guidance | general_guidance | general_guidance | false | true | true | false |

## Gate boundary

- Official P0 reevaluation: CONDITIONAL PASS
- Full Gate C remediated reevaluation: CONDITIONAL PASS
- Candidate handoff: NOT RUN
- Phase 5: HOLD

The next bounded step is an actual candidate handoff dry-run; this report does not execute or authorize persistence.
