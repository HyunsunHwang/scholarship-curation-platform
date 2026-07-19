# Engine Phase 4 Gate C candidate-gold annotation policy

Version: `engine-phase-4-representative-gold-policy/v1`

The Gate C corpus is a purposeful, stratified sample of 24 public scholarship notices from eight source keys. Selection was fixed before the frozen deterministic extractor was executed. A poor extraction result is never a reason to remove or replace a selected case.

Each tracked case retains only a public URL, title, posted date, stable capture hash, source/document classification, field-level candidate-gold values, and one or more minimal evidence excerpts. An excerpt is limited to 500 Unicode characters. Full HTML, full document text, binaries, OCR pages, credentials, and personal absolute paths are prohibited. `source_capture_hash` covers the URL, public title, posted date, and retained minimal excerpt; its scope is explicitly `minimal_public_evidence_snapshot`, not a claim that raw source bytes were archived.

Gold values use the Gate A statuses `present`, `not_found`, `unknown`, `not_applicable`, `ambiguous`, and `conflicting`. A present, ambiguous, or conflicting annotation must reference evidence. Ambiguity is preserved and never resolved by guesswork. All annotations are `candidate_gold` with `pending_independent_review`; Codex does not claim independent adjudication.

Partial overlap is predeclared before evaluation. Sets use `set_precision_recall/v1`; ranges use exact-boundary and bounded-overlap reporting under `range_boundary_and_bounded_overlap/v1`; eligibility reports condition-set overlap separately from Boolean-structure exactness under `condition_set_and_boolean_structure/v1`. There is no string similarity, embedding similarity, model judge, or post-evaluation threshold adjustment.

HWP/HWPX and image cases are retained as coverage probes. When the representative capture has attachment metadata but no authoritative Phase 3 parse/OCR result, the case is marked `tool_unavailable` or `ocr_not_evaluated`; the report must not count those formats as successfully parsed.

Relation groups are candidate Phase 5 evaluation evidence only. Gate C does not resolve or merge programs, cycles, reposts, results, recommendations, or extensions.

## Provenance model

Gate C uses separate provenance for the corpus and its relation corrections. `corpus_freeze_sha` identifies the commit that introduced the representative case selection, case payloads, field annotations and evidence, schema, and manifest membership. `relation_correction_sha` identifies the later commit that removed invalid self-pairs and substituted distinct-case comparisons. Both values must be full 40-character commit IDs, resolve to commit objects, be ancestors of the evaluated branch, and be at or after the Gate C base (`origin/main`). The relation correction must not precede the corpus freeze.

The previously recorded value `f4109294e86df35f2b9508b20edc665a18c50334` is deprecated because it does not resolve to a Git object. Its replacement is the actual first Gate C commit, `f410929e93f7f003ad39a03a2376b4a24ef755dc`. This provenance-only correction does not alter selected cases, candidate-gold annotations, evidence, evaluation inputs, extractor behavior, or evaluation metrics.
