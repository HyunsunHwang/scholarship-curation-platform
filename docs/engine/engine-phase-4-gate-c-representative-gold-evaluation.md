# Engine Phase 4 Gate C — representative public gold evaluation

## Decision

Terminal status is **HOLD**. The 24-case candidate corpus and provisional evaluation are machine-valid, but Phase 5 readiness remains on hold pending independent annotation adjudication, targeted Phase 3 attachment/OCR remediation, and a bounded Phase 4C selective semantic experiment. Production readiness is not asserted.

Recommended next stage: `HOLD_FOR_MULTIPLE_BLOCKERS`.

## Corpus freeze and correction record

- Candidate case selection, case payloads, field annotations and evidence, schema, and manifest membership were frozen in the actual first Gate C commit, `f410929e93f7f003ad39a03a2376b4a24ef755dc`, before extractor evaluation.
- Relation self-pair corrections are separately attributed to `3f5d26cd0128083b240f9ae5d8a7fa513ee63a3c`; this is intentionally not presented as the original corpus-freeze commit.
- The previously recorded `f4109294e86df35f2b9508b20edc665a18c50334` is deprecated: it does not resolve to a Git object and appears to have resulted from treating the real abbreviated prefix `f410929` as sufficient to construct an unverified full SHA. Git-aware validation now rejects nonexistent, off-branch, pre-base, or incorrectly ordered provenance.
- Manifest hash: `51567d8e11508992ea0f2a9bef4473415f2f05a8587268da6f9b9a0520725471`.
- 24 cases, eight source keys, maximum four cases per source.
- 17 cases have predeclared partial-overlap policies.
- Eight relation groups contain nine distinct-case pairs.
- After the freeze, three invalid self-pairs were removed from extension/update groups and replaced with three evidence-supported distinct-case comparisons. No case, field annotation, evidence excerpt, or extractor-facing input changed, and the correction was not based on extractor performance.
- This remediation changes provenance metadata and validation only. All corpus membership, gold payloads, report metrics, and HOLD decisions remain unchanged.
- Every annotation remains `candidate_gold` / `pending_independent_review`.

The tracked fixture contains minimal excerpts only. Full HTML, raw documents, binaries, and OCR pages were not committed.

## Coverage

| Dimension | Count / status |
| --- | ---: |
| HTML-primary | 10 |
| PDF-primary | 5 |
| Table-primary | 5 |
| HWP/HWPX selected | 3 — `NOT_EVALUATED` (metadata-only; authoritative Phase 3 parse unavailable) |
| Image/OCR selected | 1 — `NOT_EVALUATED` (authoritative bounded OCR unavailable) |
| Recruitment notice | 16 |
| Result announcement | 3 |
| Correction/deadline update | 3 |
| General guidance | 2 |

The OCR target of two cases was not met. Attachment-only coverage is represented by HWP/HWPX metadata-only cases, but successful parsing is not claimed. Source-level coverage includes university student-support boards, a college, departments, and a graduate-school board. A separately keyed external-foundation board was not selected; external foundations are represented through school notices that link or attribute the originating foundation.

## Provisional deterministic result

| Metric | Result |
| --- | ---: |
| Canonical schema valid | 24/24 (100%) |
| Evidence integrity | 24/24 (100%) |
| Document classification accuracy | 4/24 (16.67%) |
| Field presence precision | 64/70 (91.43%) |
| Field presence recall | 64/189 (33.86%) |
| Field status exact accuracy | 187/336 (55.65%) |
| Normalized exact match (jointly present fields) | 50/64 (78.13%) |
| Evidence attribution | 64/64 (100%) |
| Unsupported present value rate | 0/84 (0%) |
| Review-required recall | 19/19 (100%) |
| Review-required precision | 19/24 (79.17%) |
| Review overuse on non-review gold | 5/5 (100%) |
| Program candidate usable | 0/24 (0%) |
| Cycle candidate usable | 0/24 (0%) |
| Phase 5 handoff usable | 0/24 (0%) |

`normalized_partial_match` is `not_evaluated`. Although policies were fixed for 17 cases, independently adjudicated element-level set/range targets are not yet complete. Copying exact match, inventing thresholds, or using a model judge would overstate the evidence.

## Error analysis and ownership

All 24 records satisfy the canonical/evidence hard contracts and no unsupported present value was generated. The principal problem is semantic recall and identity usability, not schema safety.

- Phase 3: three HWP/HWPX metadata-only cases and one image/OCR case lack authoritative document text.
- Phase 4 deterministic: 20 classification misses and broad field-status misses show that the frozen title/body rules do not cover representative public phrasing.
- Phase 4C selective semantic candidates: provider/program separation (24 cases), unlabeled date roles (13), complex eligibility (8), document taxonomy (8), method taxonomy (8), tiered/multiple benefits (4).
- Phase 5: relation candidates are available, but zero usable program/cycle handoffs means identity resolution implementation should not start on this input contract yet.

The evaluator is deliberately frozen: no deterministic rule, normalizer, evidence builder, Gate A schema, or contract was changed in response to these failures.

## Recommendation

Run a bounded combined remediation plan before seeking a Phase 5 readiness decision:

1. Phase 3 targeted remediation for selected HWP/HWPX and OCR cases, retaining the same case IDs and URLs.
2. Independent review of field-level and partial-overlap targets.
3. A selective Phase 4C experiment limited to provider/program separation, date-role labeling, complex eligibility, tiered benefits, and method/document taxonomy. It must consume the same evidence contract and fail closed.

`PHASE_5_READY=HOLD`, `PRODUCTION_READY=HOLD`, and `INDEPENDENT_GOLD_ADJUDICATION_REQUIRED=true` remain binding.
