# Engine Phase 4 Gate C — P0 deterministic diagnostic audit contract

## Relationship to Gate C

The full-schema Gate C evaluation remains unchanged. It measures the 24-case candidate corpus across canonical field status, normalized values, evidence, review behavior, identity usability, formats, and relation-oriented handoff constraints. It is a stress test for the complete hybrid semantic system and remains a diagnostic HOLD.

The P0 audit is separate. It asks whether the frozen deterministic extractor safely produces the smaller set of facts users need first. A better-looking P0 result must never be presented as replacing, invalidating, or retroactively passing full-schema Gate C.

## Gold and denominator policy

Only independent human decisions are scorable. Existing adjudication decisions supply program name, provider, application dates, application URL, support amount, and document kind. The P0 overlay supplies only concepts absent from that model: institution/campus, lifecycle status, and support type. Timezone is mechanically derived from reviewer-approved date decisions; publishability is mechanically derived from reviewer-approved document kind.

Pending candidate gold is excluded from correctness denominators. An unresolved human decision is reported separately and is not converted into a guessed exact value. The report always exposes total, resolved, pending, and unresolved counts. At the current preparation state, Cases 1–4 are also pending; no reviewer metadata exists and Codex does not promote them.

## P0 fields

- Identity: scholarship program name, actual provider, and institution/campus scope.
- Schedule: application start, application deadline, normalized timezone.
- Lifecycle: `upcoming`, `open`, `closed`, or `unknown` at fixed `as_of=2026-07-20T00:00:00+09:00` and `timezone=Asia/Seoul`.
- Action: explicit application URL only.
- Support: support type and structured support amount.

The notice's canonical detail URL is provenance input and is never substituted for an application URL during scoring. The audit separately records whether the extractor produced the application URL from evidence.

## Safety gates

Document kind and publishable-opportunity classification are separate from lifecycle status. Recruitment, result, correction, and guidance documents must not be conflated. Result/correction/extension relationships remain review-required or deferred; this audit does not implement relation resolution.

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

Deterministic extraction should retain explicit dates, clearly labelled provider/program facts, explicit application URLs, simple amounts, and conservative classification. It should fail closed on complex date roles, provider/program separation, tiered or non-cash benefits, and relation-dependent correction/result meaning.

Complex eligibility trees, exception semantics, document completeness, and detailed application procedures are outside the P0 score. The existing admin flow in `lib/notice-extraction.ts` already supports LLM-generated structured drafts followed by human review. The P0 audit does not call that LLM or change the admin flow.

Human review remains mandatory for publishability, lifecycle status, campus scope, ambiguous/conflicting values, correction/extension/result semantics, and all new adjudication gold. Phase 5 persistence and public projection remain out of scope.
