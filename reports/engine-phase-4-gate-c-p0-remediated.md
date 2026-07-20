# Engine Phase 4 — official P0 remediated extractor reevaluation

## Decision

**CONDITIONAL PASS**

This is the official P0-only reevaluation of remediated extractor 1.1.1. It does not replace the historical baseline P0 report, does not run the full-schema Gate C evaluation, does not test candidate handoff, and does not authorize Phase 5. Full-schema Gate C and Phase 5 remain **HOLD**.

Only 14/216 frozen P0 fields are reviewer-resolved. The other 198 pending and 4 unresolved slots are not correctness samples. Production-source shadow review is reported separately and never enters this denominator.

## Evaluation identity

- Report: `engine-phase-4-gate-c-p0-remediated-reevaluation/v1`
- Extractor: `engine-phase-4-p0-remediated-deterministic` `1.1.1` (`94b915f735d4282ac31476b566c419812a84186ff8184bc9d1db67c26efd18ae`)
- As-of/timezone: `2026-07-20T00:00:00+09:00` / `Asia/Seoul`
- Schema/semantic valid: 24/24 / 24/24
- Deterministic rerun: match
- External LLM calls: false

## Frozen reviewer-resolved results

- Presence precision: 6/6 (100.00%)
- Presence recall: 6/14 (42.86%)
- Normalized exact: 4/6 (66.67%)
- Document-kind exact: 5/5 (100.00%)
- Recruitment suppressed: 0
- Non-recruitment exposed: 0
- Invalid lifecycle semantics: 0
- Critical errors: 0

| Category | Reviewer-resolved exact |
| --- | --- |
| identity_exact | 1/2 (50.00%) |
| provider_exact | 0/4 (0.00%) |
| institution_or_campus_exact | 0/2 (0.00%) |
| application_start_exact | 1/1 (100.00%) |
| application_deadline_exact | 1/1 (100.00%) |
| status_exact | 1/4 (25.00%) |
| application_url_exact | NOT EVALUATED — No reviewer-resolved samples for application_url. |
| support_type_exact | NOT EVALUATED — No reviewer-resolved samples for support_type. |
| support_amount_exact | NOT EVALUATED — No reviewer-resolved samples for support_amount. |

## Baseline delta

| Metric | Classification |
| --- | --- |
| document_kind_exact | improved |
| recruitment_suppressed_count | improved |
| non_recruitment_exposed_as_opportunity_count | unchanged |
| critical_publishability_error_count | improved |
| invalid_lifecycle_semantic_count | improved |
| field_presence_precision | unchanged |
| field_presence_recall | improved |
| normalized_exact_match | unchanged |
| evidence_supported_present_count | improved |
| unsupported_present_count | unchanged |
| review_required_case_count | unchanged |

| Field category | Classification |
| --- | --- |
| program_name_exact | improved |
| provider_exact | unchanged |
| institution_or_campus_exact | unchanged |
| application_start_exact | unchanged |
| application_deadline_exact | unchanged |
| lifecycle_status_exact | improved |
| application_url_exact | not_comparable |
| support_type_exact | not_comparable |
| support_amount_exact | not_comparable |

Categories with a zero denominator remain not comparable; they are never described as improved.

## Frozen case coverage

| Case | Resolved | Pending | Unresolved | Outcome | Review required |
| --- | ---: | ---: | ---: | --- | --- |
| p4c_001_student_affairs_special | 4 | 5 | 0 | pending | true |
| p4c_002_national_second_round | 1 | 7 | 1 | pending | true |
| p4c_003_hope_ladder_extension | 2 | 6 | 1 | pending | true |
| p4c_004_national_work_result | 1 | 6 | 2 | pending | true |
| p4c_005_miraero_second | 6 | 3 | 0 | pending | true |
| p4c_006_gwangsan_extension | 0 | 9 | 0 | pending | true |
| p4c_007_sejong_internal_guidance | 0 | 9 | 0 | pending | true |
| p4c_008_cau_welfare_result_2025_1 | 0 | 9 | 0 | pending | true |
| p4c_009_cau_welfare_result_2024_2 | 0 | 9 | 0 | pending | true |
| p4c_010_cau_national_preapplication | 0 | 9 | 0 | pending | true |
| p4c_011_cau_innovation_hwp | 0 | 9 | 0 | pending | true |
| p4c_012_history_central_love | 0 | 9 | 0 | pending | true |
| p4c_013_history_growth_table | 0 | 9 | 0 | pending | true |
| p4c_014_youth_farmer_image | 0 | 9 | 0 | pending | true |
| p4c_015_seoul_talent_hwp | 0 | 9 | 0 | pending | true |
| p4c_016_asan_hope_hwpx | 0 | 9 | 0 | pending | true |
| p4c_017_uic_2025_fall | 0 | 9 | 0 | pending | true |
| p4c_018_uic_samsung_updated | 0 | 9 | 0 | pending | true |
| p4c_019_uic_legacy | 0 | 9 | 0 | pending | true |
| p4c_020_uic_supporters_table | 0 | 9 | 0 | pending | true |
| p4c_021_grad_need_based | 0 | 9 | 0 | pending | true |
| p4c_022_grad_seoul_foundation_pdf | 0 | 9 | 0 | pending | true |
| p4c_023_russian_alumni_funds | 0 | 9 | 0 | pending | true |
| p4c_024_dean_recommendation_guidance | 0 | 9 | 0 | pending | true |

## Production-source shadow (Cases 6–24)

- Status alignment: 71/171
- Both present: 32; exact value: 17; value mismatch: 15
- Safe fail-close: 82
- Overclaim: 0
- Schema-gap alignment: 3

| Field | Status alignment | Exact / both present | Safe fail-close | Overclaim |
| --- | ---: | ---: | ---: | ---: |
| program_name | 13/19 | 5/10 | 6 | 0 |
| provider | 6/19 | 3/3 | 13 | 0 |
| institution_or_campus | 4/19 | 0/1 | 10 | 0 |
| application_start | 7/19 | 3/3 | 11 | 0 |
| application_deadline | 8/19 | 4/5 | 11 | 0 |
| lifecycle_status | 5/19 | 2/2 | 14 | 0 |
| application_url | 11/19 | 0/0 | 0 | 0 |
| support_type | 8/19 | 0/5 | 9 | 0 |
| support_amount | 9/19 | 0/3 | 8 | 0 |

These shadow results measure operational alignment, not frozen-excerpt correctness or production accuracy.

| Shadow mismatch case | Mismatch fields | Taxonomy |
| --- | ---: | --- |
| p4c_006_gwangsan_extension | 6 | value_mismatch, status_mismatch, safe_fail_closed |
| p4c_007_sejong_internal_guidance | 5 | safe_fail_closed |
| p4c_010_cau_national_preapplication | 6 | safe_fail_closed, status_mismatch |
| p4c_011_cau_innovation_hwp | 7 | safe_fail_closed |
| p4c_012_history_central_love | 7 | safe_fail_closed, value_mismatch, status_mismatch |
| p4c_013_history_growth_table | 8 | safe_fail_closed |
| p4c_014_youth_farmer_image | 9 | value_mismatch, safe_fail_closed, status_mismatch |
| p4c_015_seoul_talent_hwp | 8 | safe_fail_closed, status_mismatch |
| p4c_016_asan_hope_hwpx | 7 | value_mismatch, status_mismatch, safe_fail_closed |
| p4c_017_uic_2025_fall | 8 | safe_fail_closed, value_mismatch, status_mismatch |
| p4c_018_uic_samsung_updated | 9 | safe_fail_closed, status_mismatch |
| p4c_019_uic_legacy | 6 | safe_fail_closed, status_mismatch, value_mismatch |
| p4c_020_uic_supporters_table | 5 | safe_fail_closed, status_mismatch |
| p4c_021_grad_need_based | 8 | value_mismatch, safe_fail_closed |
| p4c_022_grad_seoul_foundation_pdf | 8 | value_mismatch, status_mismatch, safe_fail_closed |
| p4c_023_russian_alumni_funds | 8 | safe_fail_closed, value_mismatch |

## Known-case boundary results

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

## OCR boundary

- OCR parser success statuses accepted: 7
- Missing OCR locators: 0
- OCR-backed present claims: 0
- Missing-bbox OCR present claims: 0
- Fail-closed cases: none

OCR without a bounding box is treated as incomplete upstream evidence and cannot support a present claim. Missing OCR evidence is not presented as an accuracy gain.

## Boundaries and next step

- Official P0 reevaluation completed: true
- Official full Gate C reevaluation completed: false
- Candidate handoff test completed: false
- Full-schema Gate C: HOLD
- Phase 5: HOLD

The next permitted evaluation step is a full Gate C remediated reevaluation on this branch; Phase 5 remains blocked.
