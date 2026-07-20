# Engine Phase 4 Gate C — P0 deterministic diagnostic audit contract

## Relationship to Gate C

The full-schema Gate C evaluation remains unchanged. It measures the 24-case candidate corpus across canonical field status, normalized values, evidence, review behavior, identity usability, formats, and relation-oriented handoff constraints. It is a stress test for the complete hybrid semantic system and remains a diagnostic HOLD.

The P0 audit is separate. It asks whether the frozen deterministic extractor safely produces the smaller set of facts users need first. A better-looking P0 result must never be presented as replacing, invalidating, or retroactively passing full-schema Gate C.

## Gold and denominator policy

Only independent human decisions backed by the retained excerpt are scorable in frozen-excerpt accuracy. Existing adjudication decisions supply program name, provider, application dates, application URL, support amount, and document kind. The P0 overlay supplies only concepts absent from that model: institution/campus, lifecycle status, and support type. Timezone is embedded in normalized application dates or source metadata rather than scored as a standalone P0 field; publishability is mechanically derived from reviewer-approved document kind.

Pending candidate gold is excluded from correctness denominators. An unresolved human decision is reported separately and is not converted into a guessed exact value. The report always exposes total, resolved, pending, and unresolved counts. Batch 1 records a bounded reviewer-resolved subset across Cases 1–5. Batch 2 records Cases 6–24 in a separate production-source review scope. Facts approved from current public sources never silently enter the frozen-excerpt accuracy denominator; unlisted frozen fields remain pending.

Together, the two batches complete bounded P0 case review for 24/24 cases. This is not full-field adjudicated gold: P1/P2 semantics and frozen-excerpt fields without reproducible retained evidence remain pending, and full-schema Gate C remains on HOLD.

The nine independent opportunity concepts are program name, provider, institution/campus, application start, application deadline, lifecycle status, application URL, support type, and support amount. Across 24 cases this yields 216 concept slots before terminal non-opportunity applicability rules.

## P0 fields

- Identity: scholarship program name, actual provider, and institution/campus scope.
- Schedule: application start and application deadline, with offset/timezone embedded in normalized values when applicable.
- Lifecycle: `upcoming`, `open`, `closed`, or `unknown` at fixed `as_of=2026-07-20T00:00:00+09:00` and `timezone=Asia/Seoul`.
- Action: explicit application URL only.
- Support: support type and structured support amount.

The notice's canonical detail URL is provenance input and is never substituted for an application URL during scoring. The audit separately records whether the extractor produced the application URL from evidence.

Only the primary scholarship-application window belongs in application start/deadline. Document submission, family consent, recommendation, interview, result, payment, account-registration, supplementation, and post-award obligations belong in follow-up requirements, completion conditions, important notes, or a process timeline. A subprogram-specific window must not be generalized to every program in a composite notice.

Lifecycle may be derived deterministically when the document is a confirmed recruitment opportunity, application start/deadline roles and timezone are sufficiently clear, the dates do not conflict, and no correction, extension, result, or multi-cycle relation is needed. At the fixed `as_of`, a time before the start is `upcoming`, a time within the application window is `open`, and a time after the deadline is `closed`.

Lifecycle must fail closed as `unknown` or require human review when date roles are ambiguous, dates conflict across body and attachments, application/recommendation/document/consent/result dates are mixed, timezone is unsafe, multiple cycles are possible, or correction/extension/result/guidance semantics require relation resolution. Document-kind values such as `recruitment_notice` and `result_announced` are never lifecycle values.

## Safety gates

Document kind and publishable-opportunity classification are separate from lifecycle status. Recruitment, result, correction, and guidance documents must not be conflated. Result/correction/extension relationships remain review-required or deferred; this audit does not implement relation resolution.

Result announcements and application-support guidance are terminal non-opportunities: preserve classification and provenance, set standalone publishability false, and stop downstream opportunity extraction. A separate correction notice is also non-standalone and updates an existing opportunity relation. An existing recruitment page that was revised may remain a recruitment notice with revision metadata.

A verified publishability mismatch requires reviewer-resolved document-kind gold. Pending cases are neither safe nor erroneous. Independent of gold, emitting `recruitment_notice` or `result_announced` in the lifecycle field is a contract-level deterministic defect because those values are not lifecycle states.

## Metrics

Resolved-only metrics include field presence precision/recall, normalized exact match, category exactness, document-kind exactness, publishability errors, and case-level correct/partial/failed counts. Output diagnostics across all cases include evidence-supported values, unsupported claims, inferred values, ambiguity/review-required counts, and semantic-contract violations.

Errors use these ownership classes:

- deterministic extractor defect;
- insufficient retained evidence;
- gold ambiguity;
- schema expressiveness gap;
- LLM-assisted semantic extraction candidate;
- upstream collection loss;
- relation-resolution dependency.

## Responsibility boundary

Deterministic extraction should retain explicit primary-application dates, clearly labelled provider/program facts, explicit application URLs, simple amounts, and conservative classification. It may also derive lifecycle from unambiguous start/deadline/timezone evidence for a confirmed recruitment opportunity at the fixed `as_of`. It should fail closed on complex date roles, provider/program separation, tiered or non-cash benefits, and relation-dependent correction/result meaning.

If HTML already contains the P0 facts, full HWP/HWPX parsing is not a P0 prerequisite. If P0 exists only in an image, minimal OCR/vision should target program, primary application window, amount, and application path. Complex Korean eligibility, exceptions, maximum award counts, service obligations, insurance, and detailed procedures remain LLM-assisted draft plus administrator-review responsibilities.

Complex eligibility trees, exception semantics, document completeness, and detailed application procedures are outside the P0 score. The existing admin flow in `lib/notice-extraction.ts` already supports LLM-generated structured drafts followed by human review. The P0 audit does not call that LLM or change the admin flow.

Human review remains mandatory for publishability, campus scope, ambiguous/conflicting values, correction/extension/result semantics, and lifecycle when date roles or timezone are unclear, dates conflict, multiple cycles are possible, or relation resolution is required. All new adjudication gold also requires human review. Phase 5 persistence and public projection remain out of scope.
