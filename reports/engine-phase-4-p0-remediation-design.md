# Engine Phase 4 P0 remediation contract design

## Decision

**PASS** — the contract, responsibility boundary, compatibility path, fixtures, and baseline diagnostics are complete enough to direct a separate deterministic-extractor remediation task. This is a design decision only. Full-schema Gate C and Phase 5 remain **HOLD**.

No extractor rule, production flow, database, migration, UI, LLM call, or automatic-publication behavior changed. The current violations below are a baseline, not an accuracy improvement.

## Current-code findings

- **publishability_alias:** classification.is_recruitment is used as the P0 publishability prediction, so classification misses suppress real opportunities. (lib/engine-phase-4/deterministic-extractor.mjs:195, lib/engine-phase-4/gate-c-p0-audit.mjs:237)
- **lifecycle_document_kind_mix:** fields.status is populated with result_announced or recruitment_notice rather than a lifecycle enum. (lib/engine-phase-4/deterministic-extractor.mjs:350, lib/engine-phase-4/deterministic-extractor.mjs:353)
- **provider_role_mix:** provider matching accepts 주관기관 and 재단 labels while posting organization has no canonical field. (lib/engine-phase-4/deterministic-extractor.mjs:299, schemas/engine/phase-4-canonical-scholarship.schema.json:64)
- **limited_date_roles:** date rules recognize only four roles and can generalize any 신청/접수 기간 range without a process-role model. (lib/engine-phase-4/deterministic-normalizers.mjs:56, lib/engine-phase-4/deterministic-normalizers.mjs:63)
- **url_boundary:** the extractor requires an application-context URL, but the legacy admin review default still copies notice_url into apply_url. (lib/engine-phase-4/deterministic-normalizers.mjs:198, app/admin/review/scholarships/[id]/page.tsx:108)
- **amount_shape:** canonical amountValue supports only exact/range/tuition/non-cash and the extractor treats multiple benefit candidates as ambiguity. (schemas/engine/phase-4-canonical-scholarship.schema.json:294, lib/engine-phase-4/deterministic-extractor.mjs:245)
- **paid_activity_missing:** canonical extraction has no opportunity_kind, so paid student activity cannot be partitioned from scholarships. (schemas/engine/phase-4-canonical-scholarship.schema.json:23)
- **llm_admin_flow:** the existing admin path calls an LLM on demand, stores extracted_draft, then requires an administrator form submission. (app/admin/crawled-notices/actions.ts:166, app/admin/review/scholarships/[id]/page.tsx:258)

## Responsibility classification

### deterministic_extractor

- conservative document-kind classification
- explicit primary application start/deadline with embedded offset
- explicit program/provider labels
- explicit application URL
- simple first-remediation amount kinds
- lifecycle derivation only for confirmed recruitment with an unambiguous window
- evidence-linked fail-closed output

### output_contract_or_schema

- explicit publishable_opportunity and opportunity_kind
- posting_organization separate from provider and institution_or_campus
- lifecycle enum separate from document kind
- lossless amount taxonomy, components, installments, caps, labels, and source display
- schema_expressiveness_gap distinct from ambiguity

### upstream_collection

- preserve sufficient HTML before requesting attachment parsing
- minimal OCR/vision for image-only P0 facts
- HWP/HWPX/PDF text only when accessible HTML lacks P0 facts
- retain document revision identity and source locators

### llm_assisted_draft

- provider/program/posting-role separation when labels are contextual
- complex date-role and process-timeline interpretation
- cross-table component/program amount alignment
- complex Korean eligibility and exception semantics outside P0

### mandatory_admin_review

- publishability before promotion
- ambiguous provider, campus, date role, URL, or amount
- schema gaps and paid-activity feed partition
- correction, result, revision, or conflicting-source decisions

### relation_resolution

- standalone correction and deadline-extension documents
- result announcements linked to the originating recruitment cycle
- before/after revision evidence and material-change ownership

### deferred_out_of_scope

- complete eligibility and exception interpretation
- automatic multi-program splitting
- automatic relation linking completion
- full parsing of every attachment and image
- production migration, persistence, UI redesign, automatic publication, and Phase 5

## Next extractor remediation scope

### Included

- separate document_kind, publishable_opportunity, and lifecycle_status
- fix verified recruitment suppression without weakening terminal-document blocking
- block result and guidance documents from standalone publication
- extract explicit primary application windows and derive lifecycle conservatively
- extract explicit program, provider, institution/campus, and application URL values
- normalize the eight first-remediation amount kinds
- preserve evidence references for every present value
- return unknown/ambiguous/conflicting plus review reasons when an auto-decision is unsafe
- emit paid_student_activity as a distinct opportunity kind

### Excluded

- complete eligibility/exception interpretation
- automatic decomposition of multi-program notices
- automatic relation-resolution completion
- automatic extraction of complex amount structures
- unbounded HWP/HWPX/PDF parsing or full-image OCR
- external LLM calls, admin UI changes, database migration/write, automatic publication, and Phase 5 persistence

Every included work item has machine-readable current/desired behavior, code targets, auto/stop conditions, fixtures, and completion criteria in the JSON design report.

## Output contract

The nine opportunity concepts remain program_name, provider, institution_or_campus, application_start, application_deadline, lifecycle_status, application_url, support_type, support_amount. There is no standalone timezone field. Posting organization, document kind, publishability, opportunity kind, review state, and evidence are safety/provenance fields outside the 9 × 24 denominator.

| Field | Type | Required | Existing relationship | Handoff |
| --- | --- | --- | --- | --- |
| document_kind | enum | yes | classification.document_kind | Phase 4 and Phase 5 |
| publishable_opportunity | boolean | yes | New; classification.is_recruitment is not authoritative | Phase 4; Phase 5 candidate |
| opportunity_kind | enum | yes | New | Phase 4; Phase 5 candidate |
| program_name | status/value/evidence field | yes | Adapter from fields.scholarship_program_name | Phase 4 and Phase 5 |
| provider | status/value/evidence field | yes | Semantics correction for fields.provider | Phase 4 and Phase 5 |
| posting_organization | status/value/evidence field | yes | New Phase 4 field | Phase 4; Phase 5 provenance |
| institution_or_campus | status/value/evidence field | yes | Adapter from optional fields.host_institution | Phase 4 and Phase 5 |
| application_start | date or offset datetime field | yes | Semantics correction for fields.application_start | Phase 4 and Phase 5 |
| application_deadline | date or offset datetime field | yes | Semantics correction for fields.application_deadline | Phase 4 and Phase 5 |
| lifecycle_status | enum field | yes | Replaces document-kind-like fields.status semantics | Phase 4 and Phase 5 |
| application_url | HTTP(S) URL field | yes | Semantics correction; never default from source URL | Phase 4 and Phase 5 |
| support_type | string-array field | yes | Adapter from fields.benefit_type and NoticeDraft.support_types | Phase 4 and Phase 5 |
| support_amount | tagged amount field | yes | Rich Phase 4 value; legacy projection uses display only | Phase 4; future Phase 5 structured field |
| review_required | boolean | yes | Reuse record.review.required | Phase 4 and Phase 5 |
| review_reasons | enum array | yes | Reuse and narrow record.review.reason_codes | Phase 4 and Phase 5 |
| evidence_references | array | yes | Compatible adapter from canonical evidence | Phase 4 and Phase 5 |

## Cross-field safety

- document_kind and lifecycle_status enums are disjoint
- recruitment_notice is non-terminal; result, information-session, and guidance documents are terminal, non-publishable, and not_applicable opportunities
- standalone correction is non-publishable, non-terminal, requires relation resolution, and requires review
- unknown_document is non-publishable, non-terminal, unknown opportunity kind, and requires classification_uncertain review
- an updated existing recruitment page may remain recruitment_notice only with a revision note
- publishable_opportunity=true requires a confirmed recruitment_notice and a partitioned opportunity_kind
- recruitment_notice with publishable_opportunity=false requires publishability confirmation review
- paid_student_activity never silently enters the general scholarship feed
- date-only values must be real calendar dates and offset datetimes compare as actual instants
- mixed date/datetime precision cannot produce an automatic lifecycle
- primary application start cannot be after deadline and no standalone timezone field exists
- unsafe or conflicting date roles force lifecycle unknown and review
- every unknown, ambiguous, conflicting, or schema-gap field requires review and a field-specific reason; terminal not_applicable is exempt
- source canonical/detail route ignores protocol and query/fragment/trailing-slash variants, normalizes default ports, and is never application_url in this contract version
- provider, posting_organization, and institution_or_campus are independent
- unlike benefits, target tiers, total budget, and per-person amounts are never collapsed
- maximum_cap is not exact and clear unsupported structures are schema gaps rather than ambiguity

## Review enforcement

- Unsafe statuses: unknown, ambiguous, conflicting, schema_expressiveness_gap; each requires review and a field-specific reason.
- Terminal `not_applicable` is exempt.
- `not_found` requires review for: program_name, provider, application_start, application_deadline, support_type, support_amount.
- Clear `not_found` may remain no-review for: posting_organization, institution_or_campus, application_url.
- Unknown lifecycle reasons include date uncertainty, classification uncertainty, relation resolution, and publishability confirmation; an unrelated reason is rejected.
- Non-publishable recruitment requires `publishability_requires_confirmation` review.
- Source-route comparison ignores protocol/query/fragment/trailing slash, normalizes default ports, and preserves non-default port differences.

## Amount design

- First remediation auto-kinds: exact, maximum_cap, range, percentage_of_tuition, full_tuition, recurring_monthly, recurring_semester, hourly_rate.
- Structure-only complex kinds: tiered_by_target, tiered_by_degree_level, composite_components, installment, multiple_program_schema_gap.
- Rich Phase 4 values preserve display/source text, currency, exact/min/max/percentage, period, cap basis, labels, components/installments, and evidence. Simple kinds reject incompatible scalar/component properties.
- Legacy compatibility projects only reviewed `display` into `support_amount_text`; rich persistence needs a future Phase 5 migration.

## Compatibility plan

| Field | Classification | Plan |
| --- | --- | --- |
| document_kind | existing_semantics_correction | reuse known kinds, map legacy unknown to unknown_document, and strengthen cross-field safety |
| publishable_opportunity | new_phase4_internal_field | separate semantic publishability from automatic publication |
| opportunity_kind | new_phase4_internal_field | distinguish scholarship and paid_student_activity before Phase 5 |
| program_name | existing_reuse | rename only in the P0 adapter |
| provider | existing_semantics_correction | remove posting/administrative labels from provider matching |
| posting_organization | new_phase4_internal_field | preserve separately without DB migration |
| institution_or_campus | existing_semantics_correction | do not infer from provider or posting source |
| application_start | existing_semantics_correction | primary application window only |
| application_deadline | existing_semantics_correction | primary application window only |
| lifecycle_status | deprecated_or_replaced | replace through a Phase 4 adapter with a closed enum |
| lifecycle_status calculation | derived_field | derive only from confirmed recruitment and an unambiguous primary window at fixed as_of |
| application_url | existing_semantics_correction | retain only explicit application-path evidence |
| support_type | existing_reuse | add paid-activity benefit kinds |
| support_amount | future_phase5_field | validate rich Phase 4 value; project display text to legacy admin draft |
| structured support amount persistence | future_db_migration_required | defer migration until Phase 5 contract approval |

The existing administrator workflow remains LLM-assisted draft followed by explicit form review. The Phase 4 contract can run as a sidecar/adapter without changing `NoticeDraft`, the admin UI, or the database. A later integration may prefill legacy fields only after contract validation while retaining admin confirmation.

## Current extractor contract violations

| Type | Count | Representative case IDs | Severity |
| --- | ---: | --- | --- |
| document_kind_lifecycle_overlap | 5 | p4c_004_national_work_result, p4c_006_gwangsan_extension, p4c_008_cau_welfare_result_2025_1, p4c_009_cau_welfare_result_2024_2, p4c_022_grad_seoul_foundation_pdf | P0 |
| verified_recruitment_suppressed | 3 | p4c_001_student_affairs_special, p4c_002_national_second_round, p4c_005_miraero_second | P0 |
| terminal_non_opportunity_exposed | 0 | none | P0 |
| source_url_used_as_application_url_by_extractor | 0 | none | P0 |
| admin_default_source_url_as_application_url | 1 | none | compatibility_risk |
| posting_organization_unrepresented | 24 | p4c_001_student_affairs_special, p4c_002_national_second_round, p4c_003_hope_ladder_extension, p4c_004_national_work_result, p4c_005_miraero_second, p4c_006_gwangsan_extension, p4c_007_sejong_internal_guidance, p4c_008_cau_welfare_result_2025_1, p4c_009_cau_welfare_result_2024_2, p4c_010_cau_national_preapplication, p4c_011_cau_innovation_hwp, p4c_012_history_central_love, p4c_013_history_growth_table, p4c_014_youth_farmer_image, p4c_015_seoul_talent_hwp, p4c_016_asan_hope_hwpx, p4c_017_uic_2025_fall, p4c_018_uic_samsung_updated, p4c_019_uic_legacy, p4c_020_uic_supporters_table, p4c_021_grad_need_based, p4c_022_grad_seoul_foundation_pdf, p4c_023_russian_alumni_funds, p4c_024_dean_recommendation_guidance | schema |
| amount_schema_expressiveness_gap | 9 | p4c_006_gwangsan_extension, p4c_007_sejong_internal_guidance, p4c_012_history_central_love, p4c_013_history_growth_table, p4c_014_youth_farmer_image, p4c_015_seoul_talent_hwp, p4c_017_uic_2025_fall, p4c_020_uic_supporters_table, p4c_022_grad_seoul_foundation_pdf | schema |
| paid_activity_opportunity_kind_missing | 1 | p4c_020_uic_supporters_table | schema |
| relation_resolution_unimplemented | 4 | p4c_006_gwangsan_extension, p4c_008_cau_welfare_result_2025_1, p4c_009_cau_welfare_result_2024_2, p4c_004_national_work_result | relation |
| unsupported_present_claim | 0 | none | evidence |
| review_required_missing | 0 | none | safety |

These counts are deterministic over the existing 24-case frozen input and current extractor. A zero count is preserved as evidence that a safety behavior is currently working; it is not omitted.

## Completion contract for the next remediation

The next implementation is complete only when all 17 contract fixtures remain valid, mutation tests reject unsafe combinations, the diagnosed lifecycle and verified suppression defects are eliminated without exposing terminal documents, evidence references remain complete, existing Gate B/C/P0 regressions pass, and all production/Phase 5 safety flags remain false.

## Gate status

- P0 remediation contract: PASS
- Full-schema Gate C: HOLD
- Phase 5: HOLD
