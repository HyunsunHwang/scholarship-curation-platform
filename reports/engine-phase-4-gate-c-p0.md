# Engine Phase 4 Gate C — P0 deterministic diagnostic audit

## Decision

This audit is a separate diagnostic and does not replace or invalidate the full-schema Gate C report. The full-schema evaluation remains a stress test of the hybrid semantic system. This P0 audit narrows attention to the deterministic extractor's intended operational responsibility.

Reviewer-approved P0 gold is currently unavailable: resolved fields are 0/240, and all 24 cases remain pending. Correctness metrics therefore remain `NOT_EVALUATED`; pending candidate gold is not silently treated as truth.

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
| Gold maturity | candidate gold, pending independent review | reviewer-approved decisions only |
| Cases | 24 | 24 total; 0 fully resolved; 24 pending |
| Classification | 4/24 | NOT_EVALUATED — No reviewer-resolved samples for document_kind. |
| Field presence precision | 64/70 | NOT_EVALUATED — No reviewer-resolved P0 predicted-present samples. |
| Field presence recall | 64/189 | NOT_EVALUATED — No reviewer-resolved P0 gold-present samples. |
| Normalized exact | 50/64 | NOT_EVALUATED — No jointly present reviewer-resolved P0 samples. |
| Interpretation | Hybrid semantic-system stress test | Narrow deterministic responsibility diagnostic |

The score difference is presently denominator maturity, not an accuracy improvement: the P0 audit refuses to score unapproved candidate annotations.

## P0 category results

| Category | Resolved-only exact result |
| --- | --- |
| identity_exact | NOT_EVALUATED — No reviewer-resolved samples for program_name. |
| provider_exact | NOT_EVALUATED — No reviewer-resolved samples for provider. |
| institution_or_campus_exact | NOT_EVALUATED — No reviewer-resolved samples for institution_or_campus. |
| application_start_exact | NOT_EVALUATED — No reviewer-resolved samples for application_start. |
| application_deadline_exact | NOT_EVALUATED — No reviewer-resolved samples for application_deadline. |
| timezone_exact | NOT_EVALUATED — No reviewer-resolved samples for timezone. |
| status_exact | NOT_EVALUATED — No reviewer-resolved samples for lifecycle_status. |
| application_url_exact | NOT_EVALUATED — No reviewer-resolved samples for application_url. |
| support_type_exact | NOT_EVALUATED — No reviewer-resolved samples for support_type. |
| support_amount_exact | NOT_EVALUATED — No reviewer-resolved samples for support_amount. |

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
| p4c_004_national_work_result | lifecycle_status | document_kind_used_as_lifecycle_status | "result_announced" | deterministic_extractor_defect | no — gold pending |
| p4c_006_gwangsan_extension | lifecycle_status | document_kind_used_as_lifecycle_status | "recruitment_notice" | deterministic_extractor_defect | no — gold pending |
| p4c_008_cau_welfare_result_2025_1 | lifecycle_status | document_kind_used_as_lifecycle_status | "result_announced" | deterministic_extractor_defect | no — gold pending |
| p4c_009_cau_welfare_result_2024_2 | lifecycle_status | document_kind_used_as_lifecycle_status | "result_announced" | deterministic_extractor_defect | no — gold pending |
| p4c_022_grad_seoul_foundation_pdf | lifecycle_status | document_kind_used_as_lifecycle_status | "recruitment_notice" | deterministic_extractor_defect | no — gold pending |

Publishability false-positive/false-negative counts are zero only because no reviewer-resolved document-kind gold is available; 24 cases are explicitly pending, not proven safe.

## Responsibility boundary

- Keep deterministic: explicit application dates; explicit provider/program labels; explicit application URL; simple amount; conservative document classification.
- LLM-assisted candidates: provider/program separation; complex date roles; tiered or non-cash support; complex eligibility outside P0.
- Mandatory human review: lifecycle status; publishability; correction/extension/result semantics; campus scope; ambiguous or conflicting values.
- Schema gaps: lifecycle status has no enum and currently accepts document-kind values; tiered amount rows do not fit one amountValue; host institution and benefit type are optional and absent from the baseline output.

The existing admin flow already creates an LLM-assisted structured draft and requires human promotion review. It also defaults the application URL to the notice URL in the admin form; that is an application-layer default and is deliberately excluded from deterministic application-URL extraction scoring.

## Next step

Obtain independent human decisions for the mapped P0 fields and the three P0 overlay fields (institution/campus, lifecycle status, support type), then rerun this exact audit before changing extractor behavior.
