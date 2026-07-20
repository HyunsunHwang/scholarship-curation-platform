# Engine Phase 4 Gate C — P0 deterministic diagnostic audit

## Decision

This audit is a separate diagnostic and does not replace or invalidate the full-schema Gate C report. The full-schema evaluation remains a stress test of the hybrid semantic system. This P0 audit narrows attention to the deterministic extractor's intended operational responsibility.

Frozen-excerpt accuracy measures only the Batch 1 reviewer-resolved subset: 14/216 P0 fields are resolved, 4 are explicitly unresolved, and 198 remain pending. Those resolved-only scores cannot be generalized to the full 24-case corpus. Batch 2 completes production-source P0 review for Cases 6–24 in a separate shadow scope. Production-source-only values never enter the frozen-excerpt accuracy denominator.

Within frozen-excerpt accuracy, Batch 1 remains bounded to explicitly listed decisions across Cases 1–5 and all unlisted fields remain pending. Batch 2 records Cases 6–24 only in production-source review scope.

## Fixed evaluation context

- As-of: `2026-07-20T00:00:00+09:00`
- Timezone: `Asia/Seoul`
- External LLM calls: none
- Extractor behavior changed for scoring: no
- Source notice canonical URLs are input provenance only; they are not counted as extracted application URLs.
- Standalone timezone field: none; offsets/timezone remain embedded in normalized application dates.
- Primary application window only: follow-up, consent, document, result, payment, and recommendation dates are deferred to process timeline/notes.

## Full-schema Gate C versus P0 audit

| Dimension | Full-schema Gate C | P0 deterministic audit |
| --- | --- | --- |
| Scope | 14 canonical fields, identity usability, review behavior, relations and format stress | 9 user-critical opportunity fields plus document-kind/publishability safety gates |
| Gold maturity | candidate gold, pending independent review | Batch 1 reviewer-approved decisions only |
| Cases | 24 | 24 total; 0 fully resolved; 5 partially resolved; 19 fully pending |
| Classification | 4/24 | 1/5 (20.00%) |
| Field presence precision | 64/70 | 3/3 (100.00%) |
| Field presence recall | 64/189 | 3/14 (21.43%) |
| Normalized exact | 50/64 | 2/3 (66.67%) |
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
| status_exact | 0/4 (0.00%) |
| application_url_exact | NOT_EVALUATED — No reviewer-resolved samples for application_url. |
| support_type_exact | NOT_EVALUATED — No reviewer-resolved samples for support_type. |
| support_amount_exact | NOT_EVALUATED — No reviewer-resolved samples for support_amount. |

## Batch 2 production-source review — separate shadow scope

- Combined P0 case review: 24/24
- Batch 2 production-source reviewed cases: 19
- Corpus opportunity concept slots: 216
- Production-review concept slots: 171
- Frozen-excerpt-supported production fields: 51
- Production-source-only reviewed fields: 88
- Terminal non-opportunities: p4c_008_cau_welfare_result_2025_1, p4c_009_cau_welfare_result_2024_2, p4c_024_dean_recommendation_guidance
- Standalone non-publishable documents: p4c_006_gwangsan_extension, p4c_008_cau_welfare_result_2025_1, p4c_009_cau_welfare_result_2024_2, p4c_024_dean_recommendation_guidance

Date normalization recorded 30/32 applicable reviewed start/deadline concepts: 15 date-only values and 15 offset datetimes. The other 2 applicable concepts are missing or unresolved rather than date-schema gaps. This is normalization coverage, not frozen-excerpt extractor accuracy.

Support-amount review semantically resolved 15/16 applicable concepts. Only 6 fit the current canonical amount shape without loss; 9 are explicit schema gaps and 1 remains unresolved. Clear caps, tiers, components, installments, and applicant-requested values are schema gaps rather than semantic ambiguity.

Current extractor verification remains deliberately narrow: the frozen reviewer-resolved denominator has 1/1 exact application starts and 1/1 exact deadlines, while support amount is `NOT_EVALUATED`. These samples cannot establish production accuracy. The production-source review instead shows where improvement is feasible: date value representation is sufficient for every approved primary window, while amount normalization needs a richer tagged/component schema before deterministic extraction can preserve the reviewed meanings losslessly.

## Case-level adjudication coverage

Partially adjudicated cases remain `pending` outcomes; they are never labelled fully correct or failed.

| Case | Resolved P0 | Unresolved P0 | Pending P0 | Resolved safety | Coverage | Outcome |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| p4c_001_student_affairs_special | 4 | 0 | 5 | 2 | partially_resolved | pending |
| p4c_002_national_second_round | 1 | 1 | 7 | 2 | partially_resolved | pending |
| p4c_003_hope_ladder_extension | 2 | 1 | 6 | 2 | partially_resolved | pending |
| p4c_004_national_work_result | 1 | 2 | 6 | 2 | partially_resolved | pending |
| p4c_005_miraero_second | 6 | 0 | 3 | 2 | partially_resolved | pending |
| p4c_006_gwangsan_extension | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_007_sejong_internal_guidance | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_008_cau_welfare_result_2025_1 | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_009_cau_welfare_result_2024_2 | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_010_cau_national_preapplication | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_011_cau_innovation_hwp | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_012_history_central_love | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_013_history_growth_table | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_014_youth_farmer_image | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_015_seoul_talent_hwp | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_016_asan_hope_hwpx | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_017_uic_2025_fall | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_018_uic_samsung_updated | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_019_uic_legacy | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_020_uic_supporters_table | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_021_grad_need_based | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_022_grad_seoul_foundation_pdf | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_023_russian_alumni_funds | 0 | 0 | 9 | 0 | fully_pending | pending |
| p4c_024_dean_recommendation_guidance | 0 | 0 | 9 | 0 | fully_pending | pending |

## Output diagnostics independent of pending gold

- Evidence-supported present P0 outputs: 21
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

- Keep deterministic: explicit primary application window with embedded offset/timezone; explicit provider/program labels; explicit application URL; simple exact/cap/range/period/unit amount semantics; conservative document classification; lifecycle derivation from unambiguous start/deadline/timezone for a confirmed recruitment opportunity at fixed as_of.
- LLM-assisted candidates: provider/program separation; complex date roles and process timeline; cross-table amount component/program alignment; complex Korean eligibility and exceptions outside P0.
- Mandatory human review: publishability; lifecycle when date roles or timezone are ambiguous, dates conflict, multiple cycles are possible, or correction/extension/result relations are required; correction/extension/result semantics; campus scope; ambiguous or conflicting values.
- Schema gaps: lifecycle status has no enum and currently accepts document-kind values; tiered, composite, recurring, hourly, applicant-requested, and multi-program amounts do not fit one amountValue; host institution and benefit type are optional and absent from the baseline output.
- Input minimization: use HTML when it already contains P0 facts; require full HWP/HWPX parsing only when P0 is absent from accessible HTML; use minimal OCR/vision for image-only program, primary application window, amount, and application path; defer detailed eligibility and follow-up procedure semantics to LLM-assisted draft plus administrator review.

Lifecycle is deterministic only when a confirmed recruitment opportunity has unambiguous application start/deadline roles, sufficient timezone information, no date conflicts, and no correction, extension, result, or multi-cycle relation dependency. Otherwise it fails closed as unknown or requires human review; document-kind values are never lifecycle values.

The existing admin flow already creates an LLM-assisted structured draft and requires human promotion review. It also defaults the application URL to the notice URL in the admin form; that is an application-layer default and is deliberately excluded from deterministic application-URL extraction scoring.

Operational policy remains LLM-assisted draft plus administrator review. Deterministic extraction should normalize explicit primary application windows and simple amount semantics; accumulated reviewed drafts can later support normalization optimization without forcing complex Korean eligibility or process semantics into the deterministic P0 layer.

## Next step

The bounded P0 case review is complete at 24/24. The 198 pending and 4 unresolved counts above describe frozen-excerpt denominator maturity, not an outstanding Batch 2 source-review request. Keep P1/P2 detailed semantics pending, improve future retained evidence capture, and rerun this audit before changing extractor behavior. Full-schema Gate C and Phase 5 remain on HOLD.
