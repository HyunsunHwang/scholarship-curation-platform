# Engine Phase 4 Gate C — independent gold adjudication

## Purpose and boundary

The 24-case Gate C corpus is frozen candidate gold, not independently adjudicated gold. It was authored with Codex assistance and remains `pending_independent_review`; Codex therefore cannot serve as its independent reviewer or promote any case without a separate human decision. This preparation step supplies the review structure only. It does not rerun adjudicated evaluation, remediate Phase 3, start Phase 4C or Phase 5, or change the diagnostic HOLD decision.

Candidate gold records the current annotation proposal. Adjudicated gold is the result of an independent human reviewer approving that proposal, correcting it from retained evidence, or declaring it unresolved. The JSON decision file is the only decision source of truth. The Markdown packet is a reading aid and its checkboxes are not machine-readable decisions.

## Review order and priorities

Each case presents information in this order:

1. retained source evidence;
2. candidate gold, with evidence references and P0/P1/P2 priority;
3. deterministic extractor output in a separately labelled comparison section.

Do not approve or correct gold solely to match the extractor output. Base adjudication on retained public evidence and the Gate C annotation policy.

- P0 requires direct review: document classification, provider, scholarship program, recruitment cycle, ambiguous/conflicting status, unresolved identity, and relation meaning.
- P1 covers error-prone or structured fields: date roles, complex eligibility, required documents, application method, tiered/non-cash benefits, and partial-overlap targets.
- P2 covers simpler explicit fields such as title, source language, URL, and uncomplicated values. P2 is lower risk, never auto-approved.

## Recording decisions

Edit `fixtures/engine-phase-4-representative-gold/adjudication/adjudication-decisions.json` without editing the frozen corpus.

- `approved`: leave `adjudicated_gold` null; set `reviewer_role` to an allowed independent human role and set `reviewed_at`.
- `corrected`: supply a changed `adjudicated_gold`, retained evidence IDs, a concrete `review_reason`, independent reviewer role, and timestamp.
- `unresolved`: use `unknown`, `ambiguous`, or `conflicting`, keep the normalized value null, and record the evidence limitation and reviewer metadata.
- `excluded_for_provenance_failure`: use only at case level when a human determines that source/capture/document provenance prevents evaluation; a reason is mandatory.

Allowed reviewer roles are `independent_human_reviewer`, `second_independent_human_reviewer`, and `adjudication_lead`. Codex, automated reviewers, the extractor, and model judges are not independent reviewers.

If retained evidence is insufficient, fail closed. Use an unresolved decision or mark the relevant preparation risk as `source_unavailable`, `authoritative_document_missing`, `phase_3_parse_required`, `ocr_required`, or `attachment_recovery_required`. Do not invent a value from the extractor comparison.

## Remediation boundaries

Phase 3 candidates are cases where authoritative input is missing: HWP/HWPX parsing, OCR/image parsing, list-only source text, or attachment recovery. Phase 4C candidates have retained evidence but deterministic semantic limitations, including classification, provider/program separation, date roles, eligibility, document/method taxonomy, and tiered benefits. The machine-readable status report keeps these groups separate.

Partial-overlap gold remains unadjudicated. The reviewer may approve or correct independently identified condition sets, document sets, method steps, amount rows, or range boundaries. Codex does not split strings into authoritative elements. When retained evidence is inadequate, use `not_adjudicable_with_current_evidence` with a reason.

## Completion conditions

Preparation is valid when the schema passes and all 24 frozen cases and expected review items are present. Independent review is complete only when all 24 case decisions, every field, every P0 relation item, and every partial item have terminal human decisions with required reasons, evidence, roles, and timestamps. Until then:

```text
INDEPENDENT_REVIEW_COMPLETE=false
ADJUDICATED_GOLD_READY=false
PHASE_5_READY=false
PRODUCTION_READY=false
```

After preparation, the roadmap is: human adjudication, evaluation on adjudicated gold, targeted Phase 3 remediation, bounded Phase 4C experiment, deterministic-versus-selective comparison, and only then a new Phase 5 readiness decision. The user creates and merges the PR; Codex stops after implementation, validation, commit, and branch push.
