# Engine Phase 4 Gate C candidate-gold annotation policy

Version: `engine-phase-4-representative-gold-policy/v1`

The Gate C corpus is a purposeful, stratified sample of 24 public scholarship notices from eight source keys. Selection was fixed before the frozen deterministic extractor was executed. A poor extraction result is never a reason to remove or replace a selected case.

Each tracked case retains only a public URL, title, posted date, stable capture hash, source/document classification, field-level candidate-gold values, and one or more minimal evidence excerpts. An excerpt is limited to 500 Unicode characters. Full HTML, full document text, binaries, OCR pages, credentials, and personal absolute paths are prohibited. `source_capture_hash` covers the URL, public title, posted date, and retained minimal excerpt; its scope is explicitly `minimal_public_evidence_snapshot`, not a claim that raw source bytes were archived.

Gold values use the Gate A statuses `present`, `not_found`, `unknown`, `not_applicable`, `ambiguous`, and `conflicting`. A present, ambiguous, or conflicting annotation must reference evidence. Ambiguity is preserved and never resolved by guesswork. All annotations are `candidate_gold` with `pending_independent_review`; Codex does not claim independent adjudication.

Partial overlap is predeclared before evaluation. Sets use `set_precision_recall/v1`; ranges use exact-boundary and bounded-overlap reporting under `range_boundary_and_bounded_overlap/v1`; eligibility reports condition-set overlap separately from Boolean-structure exactness under `condition_set_and_boolean_structure/v1`. There is no string similarity, embedding similarity, model judge, or post-evaluation threshold adjustment.

HWP/HWPX and image cases are retained as coverage probes. When the representative capture has attachment metadata but no authoritative Phase 3 parse/OCR result, the case is marked `tool_unavailable` or `ocr_not_evaluated`; the report must not count those formats as successfully parsed.

Relation groups are candidate Phase 5 evaluation evidence only. Gate C does not resolve or merge programs, cycles, reposts, results, recommendations, or extensions.
