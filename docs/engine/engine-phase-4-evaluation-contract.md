# Engine Phase 4 evaluation contract

## Purpose and dataset

Gate A fixes a deterministic evaluation interface before any extractor or model is selected. `fixtures/engine-phase-4-contract/evaluation-cases.json` contains 15 synthetic, non-sensitive representative cases and is versioned independently from the canonical schema. It covers HTML, PDF, tables, attachment-only notices, multiple date roles, deadline extensions, new terms, result announcements, recommendation notices, reposts, AND/OR eligibility, amount alternatives, missing values, conflicting evidence, and low-quality OCR.

The fixtures define expected classification, field presence state, identity-pair relation, material-change class, and review requirement. They do not claim extraction quality or production readiness. Later gold annotations must preserve evidence spans, annotator policy version, adjudication state, and fixture version without importing production/private content.

## Metric groups

| Metric | Unit and interpretation |
| --- | --- |
| `document_classification_accuracy` | Exact notice-kind correctness, reported per kind as well as aggregate. |
| `field_presence_precision` / `field_presence_recall` | Per-field prediction of `present` versus explicit non-present states; missing gold fields are not automatically errors. |
| `normalized_exact_match` | Type-aware exact normalized value match, separated for dates, amounts, eligibility, and other fields. |
| `normalized_partial_match` | Predeclared set/range/condition overlap; never a free-form model judge. |
| `evidence_attribution_accuracy` | Field value supported by the correct document and locator/span. |
| `unsupported_value_rate` | Values absent from cited evidence; this is a strong negative metric and hard failure per record. |
| `identity_candidate_pair_precision` / `identity_candidate_pair_recall` | Pairwise same/different program and cycle decisions, reported separately. |
| `material_change_classification_accuracy` | Exact class across non-material, deadline, eligibility, benefit, new-cycle, and review-required changes. |
| `review_required_recall` | Recall on ambiguity, conflict, low-quality evidence, and unsafe identity cases. |

Results must be sliced by field, source type, document kind, value status, deterministic versus model extraction, model/provider/prompt version, and fixture version. Overall averages alone are prohibited. Confidence calibration is evaluated separately with reliability bins and cannot replace unsupported-value measurement.

`unknown`, `not_found`, `not_applicable`, `ambiguous`, and `conflicting` are scored as distinct labels. Multiple correct answers use normalized set comparison. Date and amount ranges use exact boundary comparison plus a separately reported bounded overlap score. Eligibility compares the normalized operator tree and individual conditions; partial credit cannot turn a logically different AND/OR expression into an exact match.

## Identity and change evaluation

Program and cycle identity are evaluated as separate pair-classification tasks. Pairs are grouped by same source, cross-source, repost, school-recommendation/foundation, and adjacent-cycle cases. Precision protects against damaging false merges; recall measures fragmentation. Neither metric authorizes automatic resolution without a reviewed threshold.

Material-change evaluation requires a correct identity boundary first. A new term/additional round is scored as a new cycle, while a deadline extension within a stable cycle is a material revision. Results, information sessions, and general guidance are related events rather than recruitment changes. Review-required is a first-class answer, not an evaluation escape hatch; its recall and overuse rate are both reported.

## Threshold stages

1. **Contract validator threshold:** fixed now. All JSON Schemas, reference integrity, semantic invariants, representative fixtures, and hard-failure tests must pass 100% deterministically.
2. **Prototype evaluation threshold:** defined numerically only after a bounded extractor/model experiment and gold-set adjudication. It gates further development, not DB writes or publication.
3. **Production candidate threshold:** defined after representative source/language/document coverage, provider reliability, cost/latency, calibration, and human-review capacity are measured.
4. **Notification-safe threshold:** strictest stage, defined only after Phase 5 identity/material-change precision and deduplicated notification simulations. It requires team approval and cannot be inferred from aggregate extraction F1.

No production, prototype, or notification-safe numeric target is asserted in Gate A.

## Hard failures effective in Gate A

- schema invalid or unknown enum
- missing or duplicate evidence reference/ID
- evidence source incompatible with its locator or document hash
- a confirmed normalized value without evidence
- unsupported invented value or model inference without reason
- invalid date or amount range
- identity hierarchy contradiction
- null or missing source/document provenance for the selected evidence type
- empty text evidence, missing OCR page/bounding box, missing table coordinates, or incomplete manual annotation provenance
- date/amount kind without its required semantic payload
- evidence-free classification, proposed program/cycle identity, or material-change event
- duplicate evaluation case ID
- raw bytes, full document replication, secrets, credentials, or absolute local paths in tracked evidence

The validator is deterministic, local, and network-free. It performs no database, production, migration, crawler, provider, or LLM operation.

An unresolved identity candidate with no supporting evidence is a valid fail-closed state only when human review remains required and publication/notification remain disabled. It is scored as unresolved, never as a correct same/different identity decision.
