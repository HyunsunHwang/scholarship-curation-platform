# Engine Phase 4 Gate C — P0 deterministic diagnostic audit

## Decision

This audit is a separate diagnostic and does not replace or invalidate the full-schema Gate C report. The full-schema evaluation remains a stress test of the hybrid semantic system. This P0 audit narrows attention to the deterministic extractor's intended operational responsibility.

This rerun measures only the Batch 1 reviewer-resolved subset: 15/240 P0 fields are resolved, 4 are explicitly unresolved, and 221 remain pending. Resolved-only scores cannot be generalized to the full 24-case corpus; pending and unresolved annotations are not silently treated as truth.

## Fixed evaluation context

- As-of: `2026-07-20T00:00:00+09:00`
- Timezone: `Asia/Seoul`
- External LLM calls: none
- Extractor behavior changed for scoring: no
- Source notice canonical URLs are input provenance only; they are not counted as extracted application URLs.

## Full-schema Gate C versus P0 audit

| Dimension | Full-schema Gate C | P0 deterministic audit |
| --- | --- | --- |
| Scope | 14 canonical fields, identity usability, review behavior, relations and format stress | 10 user-critical P0 fields plus document-kind/publishability safety gates |
| Gold maturity | candidate gold, pending independent review | Batch 1 reviewer-approved decisions only |
| Cases | 24 | 24 total; 0 fully resolved; 5 partially resolved; 19 fully pending |
| Classification | 4/24 | 1/5 (20.00%) |
| Field presence precision | 64/70 | 4/4 (100.00%) |
| Field presence recall | 64/189 | 4/15 (26.67%) |
| Normalized exact | 50/64 | 3/4 (75.00%) |
| Interpretation | Hybrid semantic-system stress test | Narrow deterministic responsibility diagnostic |

The score difference reflects scope and denominator maturity, not an accuracy improvement: the P0 audit refuses to score unapproved candidate annotations.

## P0 category results

| Category | Resolved-only exact result |
| --- | --- |
| identity_exact | 0/2 (0.00%) |
| provider_exact | 0/4 (0.00%) |
| institution_or_campus_exact | 0/2 (0.00%) |
| application_start_exact | 1/1 (100.00%) |
| application_deadline_exact | 1/1 (100.00%) |
| timezone_exact | 1/1 (100.00%) |
| status_exact | 0/4 (0.00%) |
| application_url_exact | NOT_EVALUATED — No reviewer-resolved samples for application_url. |
| support_type_exact | NOT_EVALUATED — No reviewer-resolved samples for support_type. |
| support_amount_exact | NOT_EVALUATED — No reviewer-resolved samples for support_amount. |

## Case-level adjudication coverage

Partially adjudicated cases remain `pending` outcomes; they are never labelled fully correct or failed.

| Case | Resolved P0 | Unresolved P0 | Pending P0 | Resolved safety | Coverage | Outcome |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| p4c_001_student_affairs_special | 4 | 0 | 6 | 2 | partially_resolved | pending |
| p4c_002_national_second_round | 1 | 1 | 8 | 2 | partially_resolved | pending |
| p4c_003_hope_ladder_extension | 2 | 1 | 7 | 2 | partially_resolved | pending |
| p4c_004_national_work_result | 1 | 2 | 7 | 2 | partially_resolved | pending |
| p4c_005_miraero_second | 7 | 0 | 3 | 2 | partially_resolved | pending |
| p4c_006_gwangsan_extension | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_007_sejong_internal_guidance | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_008_cau_welfare_result_2025_1 | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_009_cau_welfare_result_2024_2 | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_010_cau_national_preapplication | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_011_cau_innovation_hwp | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_012_history_central_love | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_013_history_growth_table | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_014_youth_farmer_image | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_015_seoul_talent_hwp | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_016_asan_hope_hwpx | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_017_uic_2025_fall | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_018_uic_samsung_updated | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_019_uic_legacy | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_020_uic_supporters_table | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_021_grad_need_based | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_022_grad_seoul_foundation_pdf | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_023_russian_alumni_funds | 0 | 0 | 10 | 0 | fully_pending | pending |
| p4c_024_dean_recommendation_guidance | 0 | 0 | 10 | 0 | fully_pending | pending |

## Output diagnostics independent of pending gold

- Evidence-supported present P0 outputs: 22
- Unsupported present P0 claims: 0
- Inferred present P0 values: 0
- Ambiguous/unknown/conflicting P0 outputs: 18
- Extractor review-required cases: 24/24
- Invalid lifecycle-status semantic outputs: 5

## Critical errors and risks

| Case | Field | Error | Predicted value | Classification | Gold verified |
| --- | --- | --- | --- | --- | --- |
| p4c_001_student_affairs_special | publishable_opportunity | recruitment_suppressed | false | deterministic_extractor_defect | yes |
| p4c_002_national_second_round | publishable_opportunity | recruitment_suppressed | false | deterministic_extractor_defect | yes |
| p4c_004_national_work_result | lifecycle_status | document_kind_used_as_lifecycle_status | "result_announced" | deterministic_extractor_defect | yes |
| p4c_005_miraero_second | publishable_opportunity | recruitment_suppressed | false | deterministic_extractor_defect | yes |
| p4c_006_gwangsan_extension | lifecycle_status | document_kind_used_as_lifecycle_status | "recruitment_notice" | deterministic_extractor_defect | no — gold pending |
| p4c_008_cau_welfare_result_2025_1 | lifecycle_status | document_kind_used_as_lifecycle_status | "result_announced" | deterministic_extractor_defect | no — gold pending |
| p4c_009_cau_welfare_result_2024_2 | lifecycle_status | document_kind_used_as_lifecycle_status | "result_announced" | deterministic_extractor_defect | no — gold pending |
| p4c_022_grad_seoul_foundation_pdf | lifecycle_status | document_kind_used_as_lifecycle_status | "recruitment_notice" | deterministic_extractor_defect | no — gold pending |

Publishability is resolved for 5/24 cases. The resolved subset has 0 non-recruitment exposures and 3 recruitment suppressions; 19 cases remain unscored.

## Responsibility boundary

- Keep deterministic: explicit application dates; explicit provider/program labels; explicit application URL; simple amount; conservative document classification.
- LLM-assisted candidates: provider/program separation; complex date roles; tiered or non-cash support; complex eligibility outside P0.
- Mandatory human review: lifecycle status; publishability; correction/extension/result semantics; campus scope; ambiguous or conflicting values.
- Schema gaps: lifecycle status has no enum and currently accepts document-kind values; tiered amount rows do not fit one amountValue; host institution and benefit type are optional and absent from the baseline output.

The existing admin flow already creates an LLM-assisted structured draft and requires human promotion review. It also defaults the application URL to the notice URL in the admin form; that is an application-layer default and is deliberately excluded from deterministic application-URL extraction scoring.

## Next step

Continue independent review of the 221 pending P0 fields and 4 unresolved fields, prioritizing source-completeness and publishability risks, then rerun this exact audit before changing extractor behavior.
