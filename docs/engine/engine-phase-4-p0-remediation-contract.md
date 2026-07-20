# Engine Phase 4 — P0 remediation contract

## Decision and boundary

This design is **PASS** for directing a separate deterministic-extractor remediation task. It does not change the extractor, claim an accuracy improvement, replace the official Gate C report, enable persistence, or authorize publication. Full-schema Gate C and Phase 5 remain **HOLD**.

The contract is machine-readable in `schemas/engine/phase-4-p0-remediation-output.schema.json`; representative outputs live in `fixtures/engine-phase-4-p0-remediation-contract/examples.json`; the complete responsibility, compatibility, and diagnostic record is `reports/engine-phase-4-p0-remediation-design.json`.

The nine denominator concepts remain:

1. `program_name`
2. `provider`
3. `institution_or_campus`
4. `application_start`
5. `application_deadline`
6. `lifecycle_status`
7. `application_url`
8. `support_type`
9. `support_amount`

There is no standalone timezone field. Date-only values use `YYYY-MM-DD`; date-times carry an offset such as `+09:00`. Across the frozen 24 cases the contract still represents 216 opportunity concept slots. Classification, posting organization, review state, and evidence are safety/provenance fields outside that denominator.

## Current-code findings

### Publishability

`classifyNotice()` produces `classification.is_recruitment`, and the P0 audit currently treats that boolean as the publishability prediction. Therefore a missed classification also suppresses a real recruitment opportunity. The current resolved subset exposes three verified suppressions: Cases 1, 2, and 5.

The desired contract separates:

- `document_kind`: what the document is;
- `publishable_opportunity`: whether it represents a standalone opportunity eligible for administrator consideration;
- `review.automatic_publish_allowed`: always false during Phase 4.

Result announcements, information sessions, and general/application-support guidance are terminal non-opportunities. A standalone correction or deadline-extension notice is non-publishable and relation-dependent, but `terminal_non_opportunity=false` because it may retain opportunity fields needed to resolve the change. An existing recruitment page that was edited may remain `recruitment_notice` when `source_revision_mode=updated_existing_page` and a revision note is retained.

`unknown_document` is non-publishable and non-terminal, uses `opportunity_kind=unknown`, and always requires `classification_uncertain` review. It is not converted to `not_applicable` because the document role has not been established.

A confirmed `recruitment_notice` may be non-publishable while identity or safety is being checked, but that outcome may never silently suppress the candidate: `publishable_opportunity=false` requires `review.required=true` and `publishability_requires_confirmation`. Automatic publication remains false regardless of publishability.

### Document kind versus lifecycle

The current extractor writes `result_announced` or `recruitment_notice` to `fields.status`. Those are document meanings, not lifecycle values. Five current frozen outputs violate the new lifecycle enum: Cases 4, 6, 8, 9, and 22.

The remediation lifecycle enum is only:

- `upcoming`
- `open`
- `closed`
- `unknown`

A present lifecycle requires a confirmed recruitment notice and an unambiguous primary application start/deadline at the fixed evaluation time. Otherwise it is `unknown` or `not_applicable`.

To keep the document-kind and lifecycle enum sets mechanically disjoint, the new contract maps canonical v1 `document_kind=unknown` to `document_kind=unknown_document`. Lifecycle retains `unknown`.

### Institution roles

Current provider matching accepts labels such as 제공기관, 지원기관, 주관기관, and 재단. That can merge funder, operator, administrator, and posting roles. Canonical v1 has no `posting_organization` field. The remediation contract treats four roles independently:

- `program_name`: actual program name;
- `provider`: benefit owner/funder;
- `posting_organization`: source school, department, or organization;
- `institution_or_campus`: eligibility/applicability scope.

Equality is permitted when the source explicitly establishes two roles, but equality is never inferred merely because one role is known.

### Date roles

The deterministic normalizer recognizes application start/deadline, recommendation deadline, and result date, plus a generic 신청/접수 range. It has no complete process model for supplementation, family consent, interview, payment, account registration, or post-award duties.

Only the primary application-intake window enters P0. Recommendation, document completion, consent, interview, result, payment, account, and post-award schedules are deferred to:

- `follow_up_requirements`
- `additional_completion_conditions`
- `important_notes`
- `process_timeline`

A subprogram-specific window is not generalized to an entire composite notice.

### URL roles

The current deterministic URL normalizer is conservative: it requires an HTTP(S) URL on a line containing an application-context term. Current frozen outputs do not copy the canonical source URL into `application_url`.

There is, however, a compatibility risk in the legacy administrator review page: it defaults `apply_url` to `notice.notice_url`. Phase 4 P0 always rejects `application_url` equal to the source canonical/detail route. Route identity ignores HTTP versus HTTPS, normalizes their default ports, removes a trailing slash, and ignores query and fragment; hostname, normalized non-default port, and pathname remain significant. Only a distinct, explicitly evidenced HTTP(S) application path is accepted. Supporting a same-page application flow later requires an explicit contract revision; evidence alone does not create an exception in this version. This design does not change the admin page.

### Amounts

Canonical v1 supports exact, range, tuition waiver/full/partial tuition, and non-cash shapes. It cannot losslessly preserve maximum caps, target/degree tiers, components, installments, applicant-requested values, or multi-program alignment. The current extractor turns multiple amount candidates into ambiguity even when each component is clear.

Batch 2 demonstrates nine amount schema-gap cases: 6, 7, 12, 13, 14, 15, 17, 20, and 22. Clear unsupported meaning is `schema_expressiveness_gap`, not ambiguity.

### Paid student activity

Canonical v1 has no opportunity kind. Case 20 needs:

```text
opportunity_kind = paid_student_activity
support_type = [activity_scholarship, work_scholarship]
```

The service may support this kind later, but it must not silently enter the general scholarship feed.

### Existing LLM/admin flow

The production compatibility flow remains appropriate for complex semantics: an administrator explicitly requests an LLM draft, the draft is normalized and stored on the crawled notice, and a human reviews a form before promotion. This contract is designed as a Phase 4 sidecar/adapter and does not add an LLM call, database write, UI behavior, or automatic publication.

## Responsibility matrix

| Problem | Primary responsibility | Secondary responsibility |
| --- | --- | --- |
| Verified recruitment suppression | `deterministic_extractor` | `mandatory_admin_review` |
| Document kind/lifecycle mixing | `output_contract_or_schema` | `deterministic_extractor`, `mandatory_admin_review` |
| Provider/poster/campus separation | `output_contract_or_schema` | `deterministic_extractor`, `llm_assisted_draft`, `mandatory_admin_review` |
| Primary versus follow-up dates | `deterministic_extractor` | `upstream_collection`, `llm_assisted_draft`, `mandatory_admin_review` |
| Source versus application URL | `deterministic_extractor` | `mandatory_admin_review` |
| Simple amount normalization | `deterministic_extractor` | `output_contract_or_schema` |
| Complex amount preservation | `output_contract_or_schema` | `llm_assisted_draft`, `mandatory_admin_review` |
| Missing HTML/attachment/image evidence | `upstream_collection` | `mandatory_admin_review`, `deferred_out_of_scope` |
| Correction/extension/result linkage | `relation_resolution` | `mandatory_admin_review`, `deferred_out_of_scope` |
| Complex eligibility and exceptions | `deferred_out_of_scope` | `llm_assisted_draft`, `mandatory_admin_review` |
| Paid-activity partition | `output_contract_or_schema` | `deterministic_extractor`, `mandatory_admin_review` |

## Next deterministic remediation: included

### Classification, publishability, lifecycle

- Current: `is_recruitment` acts as publishability and `fields.status` holds document meanings.
- Desired: three independent fields with disjoint enums.
- Code targets: deterministic extractor, normalizers, and a Phase 4 output adapter.
- Auto allowed: classification signals agree; lifecycle also has a confirmed primary window.
- Stop: result/guidance/correction, conflicting signals, unsafe dates, or relation dependency.
- Fixtures: normal/closed recruitment, result, guidance, correction, updated page.
- Complete: verified suppressions are fixed, lifecycle enum violations are zero, and terminal fixtures remain blocked.

### Program and institution roles

- Current: narrow explicit labels and no posting-organization field.
- Desired: independent evidence-linked program/provider/poster/campus roles.
- Auto allowed: the source explicitly labels the role or source metadata directly supplies posting identity.
- Stop: funder/operator/poster/host roles require context.
- Fixtures: normal recruitment and paid activity.
- Complete: absence never triggers inference from another role.

### Primary application window

- Current: generic 신청/접수 ranges can coexist with other process schedules.
- Desired: only primary intake dates, with offset inside date-time values.
- Auto allowed: one explicit year-bearing application range has no role conflict.
- Stop: recommendation, completion, consent, result, multiple cycle, subprogram-only, or conflicting dates.
- Fixtures: normal recruitment and ambiguous date role.
- Complete: valid date-only values compare by calendar day, offset datetimes compare by their actual instants, and start ≤ deadline. Mixed date/datetime precision or unsafe roles yield lifecycle unknown plus review.

### Application URL

- Current: extractor is conservative; legacy admin defaults source URL downstream.
- Desired: only explicit application routes are present.
- Auto allowed: a distinct HTTP(S) URL is explicitly tied to application action.
- Stop: only source URL, email, unresolved QR, or unclear link purpose.
- Complete: contract rejects source/detail URL substitution.

### Simple amounts

- Current: exact/range/tuition/non-cash subset only.
- Desired first implementation: `exact`, `maximum_cap`, `range`, `percentage_of_tuition`, `full_tuition`, `recurring_monthly`, `recurring_semester`, and `hourly_rate`.
- Auto allowed: kind, numeric value/cap/range/percentage, unit, period, and recipient meaning are explicit.
- Stop: tiers, components, installments, program alignment, total/per-person uncertainty, or source conflict.
- Complete: maximum caps are not exact; display/source text and evidence remain intact.

### Evidence and fail-close behavior

- Reuse canonical evidence identities and locators.
- Every present value resolves at least one evidence ID.
- Every `unknown`, `ambiguous`, `conflicting`, and `schema_expressiveness_gap` P0/auxiliary field forces review with a field-specific reason. Terminal `not_applicable` is exempt. Essential identity/window/benefit `not_found` values require review, while clearly absent posting scope or URL may remain no-review under the field policy.
- `automatic_publish_allowed` remains false for every candidate.

## Explicitly excluded from the first remediation

| Excluded item | Planned later stage |
| --- | --- |
| Complete eligibility and exceptions | P1/P2 LLM-assisted draft plus admin review |
| Automatic multi-program splitting | Post-remediation bounded experiment |
| Complete automatic relation linking | Relation-resolution work before Phase 5 |
| Full parsing of every HWP/HWPX/PDF/image | Targeted upstream remediation only when HTML lacks P0 |
| Complex amount auto-extraction | LLM draft/admin review after the output structure is proven |
| Rich amount persistence | Future Phase 5 schema and DB migration review |
| Admin UI redesign | After independent contract integration verification |
| External LLM changes, production writes, automatic publication | Not authorized in this task |

## Output field contract

All fields are required as state-bearing objects or classification values. “Required” means the field key must exist; it does not mean the semantic value must be present. Missing or unsafe semantics use a distinct fail-closed status.

| Field | Meaning | Automatic condition | Review/stop condition | Existing relationship |
| --- | --- | --- | --- | --- |
| `document_kind` | Document role | Clear bounded signals | Conflicting document roles | Reuse classification enum |
| `publishable_opportunity` | Standalone opportunity eligibility | Confirmed recruitment only | Unknown/result/guidance/correction | New Phase 4 internal field |
| `opportunity_kind` | Feed partition | Explicit scholarship/paid activity | Mixed purpose | New Phase 4 internal field |
| `program_name` | Actual program name | Explicit label | Composite/contextual identity | Adapter from scholarship program name |
| `provider` | Benefit owner/funder | Explicit provider label | Role overlap | Correct existing semantics |
| `posting_organization` | Posting source | Direct source metadata | Missing source identity | New Phase 4 internal field |
| `institution_or_campus` | Target/applicability scope | Explicit scope | Only provider/poster known | Adapter from host institution |
| `application_start/deadline` | Primary intake window | Explicit role and year | Other roles/conflict | Correct existing semantics |
| `lifecycle_status` | Upcoming/open/closed/unknown | Confirmed recruitment window | Missing/unsafe dates/relation | Replace existing status semantics |
| `application_url` | Actual application route | Explicit distinct URL | Only source/detail URL | Correct existing semantics |
| `support_type` | Benefit categories | Explicit labels | Mixed unclear types | Reuse benefit/support types |
| `support_amount` | Tagged lossless amount | Simple bounded kind | Complex/cross-table/conflict | Rich Phase 4 value; legacy display projection |
| `review_required/reasons` | Human confirmation gate | Derived safety rules | Any listed stop condition | Reuse canonical review mechanism |
| `evidence_references` | Source-located proof | Direct source/document locator | Unsupported value | Compatible canonical evidence adapter |

The JSON design report contains data type, required/null policy, exact allowed values, evidence rule, current-field mapping, and Phase 4/Phase 5 handoff designation for each field.

### Review enforcement policy

The statuses `unknown`, `ambiguous`, `conflicting`, and `schema_expressiveness_gap` always set `review.required=true`, require at least one reason, and require a reason assigned to that field: program identity, provider/poster role, campus scope, application-date role/conflict/missing window, URL verification, support type, or amount structure/schema gap. A generic unrelated reason does not satisfy the rule. Terminal `not_applicable` is exempt.

An unknown lifecycle is not necessarily a missing-date claim. Its allowed field-specific reasons distinguish date uncertainty (`ambiguous_date_role`, `conflicting_date_evidence`, `missing_primary_application_window`, or mixed precision), classification uncertainty, relation resolution, and publishability confirmation. Thus an unknown/correction document may retain a clear application window while lifecycle remains unknown for the actual classification or relation reason.

For a clear `not_found`, review is field-specific. Missing `program_name`, `provider`, primary application start/deadline, `support_type`, or `support_amount` requires its corresponding review reason. `posting_organization`, `institution_or_campus`, and `application_url` may be `not_found` without review when absence is itself clear; for example, an offline/email application does not invent a URL. The machine-readable mapping is `review_policy` in the design JSON report.

## Cross-field safety invariants

1. `document_kind` and `lifecycle_status` allowed values do not overlap.
2. Recruitment notices are never terminal; result, information-session, and guidance documents are terminal, non-publishable, and `opportunity_kind=not_applicable`.
3. Standalone correction is non-publishable, non-terminal, requires relation resolution, and requires administrator review.
4. Updated existing recruitment pages require revision notes but may stay recruitment notices.
5. `unknown_document` is non-publishable, non-terminal, `opportunity_kind=unknown`, and requires `classification_uncertain` review.
6. A non-publishable recruitment notice requires explicit publishability review; `publishable_opportunity=true` still requires confirmed recruitment and a non-unknown opportunity kind.
7. Paid activity requires its own opportunity kind and administrator partition review.
8. Date-only values must be real calendar dates; datetimes require an offset and compare as actual instants. Mixed precision cannot produce an automatic lifecycle.
9. Unsafe date roles force lifecycle `unknown` and review.
10. No standalone timezone field exists.
11. Source canonical/detail route is never an application URL in this contract version, including HTTP/HTTPS and query/fragment/trailing-slash variants of the same normalized host, port, and path.
12. Provider, posting organization, and institution/campus are independent.
13. Every uncertain field state requires a field-specific review reason; terminal `not_applicable` is exempt.
14. Unlike benefits, target tiers, totals, and per-person amounts are not collapsed.
15. `maximum_cap` is never normalized as `exact`.
16. Applicant-requested and not-predefined amounts are semantic values, not `not_found`.
17. Clear unsupported meaning is `schema_expressiveness_gap`, not ambiguity.

## Amount result structure

The minimum rich object supports these properties when applicable:

```text
display
kind
currency
exact_amount
minimum_amount
maximum_amount
percentage
period
cap_basis
target_label
degree_level
components
installments
source_text
evidence_references
```

Fields not applicable to the selected kind are omitted or null. Components retain their own labels, units, periods, and numeric values. There is intentionally no “representative amount” property for tiered/composite values.

Simple amount invariants are strict: `exact` requires only `exact_amount`; `maximum_cap` requires `maximum_amount` and forbids `exact_amount`; `range` requires ordered minimum/maximum bounds and forbids `exact_amount`; tuition percentage requires `percentage` and forbids numeric currency amounts; full tuition forbids invented numeric amounts. Monthly, semester, and hourly kinds require `exact_amount` with `period=month`, `semester`, and `hour` respectively. Properties that are inapplicable must be absent or null; component/installment arrays are not allowed on `exact`.

Complex kinds supported structurally but excluded from first automatic extraction are `tiered_by_target`, `tiered_by_degree_level`, `composite_components`, `installment`, and `multiple_program_schema_gap`. Applicant-requested, not-predefined, variable, actual-paid-cap, non-cash, and complex values are suitable for LLM-assisted draft and administrator confirmation.

For legacy compatibility, only the administrator-confirmed `display` string may be projected to `support_amount_text`. Rich structured persistence requires a future migration and is not part of this work.

## Compatibility plan

- Existing reuse: document kind, program-name adapter, benefit/support types, review and evidence mechanisms.
- Existing semantics correction: provider, institution/campus, primary dates, application URL.
- New Phase 4 internal fields: publishability, opportunity kind, posting organization, revision mode/note.
- Derived: lifecycle status from a confirmed primary application window at fixed `as_of`.
- Future Phase 5: rich amount and stable opportunity-kind handoff.
- Future migration: structured amount persistence and any durable new classification columns.
- Deprecated/replaced: document-kind meanings in `fields.status`; source URL as application URL default semantics.

The contract and fixtures are verifiable without changing `NoticeDraft`, production tables, generated DB types, migrations, or UI. The first integration should run beside the current candidate and provide validated, evidence-linked suggestions to the existing admin-review workflow.

## Upstream minimization

1. Use HTML when it contains P0 facts.
2. Parse HWP/HWPX/PDF only when accessible HTML lacks required P0 evidence.
3. For image-only sources, target minimal OCR/vision at program, primary application window, amount, and application path.
4. Do not expand P0 collection into full eligibility, obligation, insurance, or exception parsing.
5. Missing evidence fails closed and remains administrator-visible.

## Completion criteria for the separate extractor task

The next remediation is complete only when:

- all contract examples validate;
- unsafe mutation tests fail for the intended reason;
- the five lifecycle enum violations are eliminated;
- the three verified recruitment suppressions are fixed;
- result/guidance/correction fixtures remain non-publishable;
- source canonical/detail URL is never accepted as application URL;
- simple amount kinds normalize losslessly;
- complex amount fixtures remain structured schema gaps, not scalars;
- paid activity remains partitioned;
- every present value has evidence;
- Gate B, full Gate C, and existing P0 regressions remain deterministic;
- extractor safety, production, migration, LLM, automatic-publish, and Phase 5 flags remain false until separately authorized.

Passing those criteria authorizes only a new readiness review. It does not automatically pass full-schema Gate C or Phase 5.
