# Shadow Parity Contract — Legacy vs Normalized Graph

Status: Phase 1 Gate implemented locally (dry-run)
Phase: Phase 1 local shadow parity
Safety: no production dual-write, no DB apply, no scheduled cutover

## Goal

Compare the same crawler artifact through:

```text
legacy path
  crawler artifact
  → clean/merge CSV view
  → legacy notice rows (DB upsert NOT executed)

normalized shadow path
  crawler handoff
  → handoff→graph adapter
  → normalized graph plan (dry-run)
```

This is a Gate for shadow parity quality. It is **not** scheduled cutover.

## Runtime entrypoints

```text
npm run test:shadow-parity
npm run run:shadow-parity-dry-run
```

Core modules:

- `lib/post-phase-l/handoff-to-graph-adapter.mjs`
- `lib/post-phase-l/legacy-notice-artifact.mjs`
- `lib/post-phase-l/shadow-parity.mjs`
- `scripts/run-shadow-parity-dry-run.mjs`
- `fixtures/shadow-parity/`

## Formal classifications

External report classification is exactly one of:

```text
exact_match
explained_difference
blocking_mismatch
not_comparable
```

Optional internal detail:

```json
{
  "classification": "blocking_mismatch",
  "detail_status": "field_mismatch",
  "reason_codes": ["TITLE_MISMATCH"]
}
```

### exact_match

User-meaningful corresponding fields match and no explained model-difference reason remains.

### explained_difference

Approved model difference. Required reason codes include:

```text
INLINE_SECTIONS_COLLAPSED_TO_PAGE_NOTICE
LEGACY_GLOBAL_URL_DEDUPE_COLLAPSE
GRAPH_ONLY_PROVENANCE
GRAPH_SEPARATE_ASSET_ENTITY
IDENTITY_MODEL_DIFFERENCE
DATE_PRESENCE_ALIGNED_MISSING_OR_UNPARSED
CANDIDATE_EXCLUDED_BOTH_PATHS
```

### blocking_mismatch

Must be zero before any scheduled cutover discussion:

```text
LEGACY_NOTICE_MISSING
NORMALIZED_NOTICE_MISSING
TITLE_MISMATCH
PUBLISHED_DATE_MISMATCH
CANONICAL_URL_MISMATCH
BODY_LOSS
ATTACHMENT_LOSS
APPLICATION_LINK_LOSS
SOURCE_OWNERSHIP_MISMATCH
DUPLICATE_NORMALIZED_NOTICE
CANDIDATE_ELIGIBILITY_MISMATCH
UNSUPPORTED_IDENTITY_KIND
INLINE_SECTION_EVIDENCE_LOSS
FABRICATED_DATE
```

### not_comparable

No direct corresponding concept in one path. Do not force into exact/explained.

## Legacy global URL dedupe

Legacy ingest dedupes by `notice_url` globally. Different sources sharing one URL collapse to one legacy row.

Shadow parity treats the graph-only surviving source row as:

```text
classification = explained_difference
reason_codes = [LEGACY_GLOBAL_URL_DEDUPE_COLLAPSE]
```

This is **not** a Gate blocker when the reason code is present and accurate.

## Gate summary fields

```text
input_case_count
legacy_row_count
normalized_notice_count
exact_match_count
explained_difference_count
blocking_mismatch_count
not_comparable_count
missing_legacy_count
missing_graph_count
duplicate_legacy_count
duplicate_graph_notice_count
unsupported_identity_kind_count
inline_section_evidence_loss_count
deterministic_rerun_match
```

Gate PASS requires:

```text
blocking_mismatch_count = 0
missing_legacy_count = 0
missing_graph_count = 0
duplicate_graph_notice_count = 0
unsupported_identity_kind_count = 0
inline_section_evidence_loss_count = 0
deterministic_rerun_match = true
```

## Deterministic payload vs execution metadata

Report envelope:

```json
{
  "parity": {
    "schema_version": "...",
    "summary": {},
    "comparisons": []
  },
  "execution_metadata": {
    "generated_at": "...",
    "output_directory": "..."
  }
}
```

`deterministic_rerun_match` is computed by running handoff, graph plan, legacy projection, and canonical parity payload twice, then comparing canonical payload/hash. Execution metadata is excluded from that comparison.

## Required fixture cohort (8)

```text
external-article-id
canonical-url-only
inline-multi-section
cross-source-same-url
attachment-and-application-link
missing-or-uncertain-date
candidate-excluded-diagnostic
body-and-inline-evidence-preservation
```

## Phase 1 PASS conditions

- required 8 fixtures present
- approved four classifications in use
- explained differences are reason-coded
- blocking mismatch 0
- no body/attachment/application/section evidence loss counted as blocking
- full rerun deterministic
- Phase 0 regressions green
- no DB / network / LLM calls
- no scheduled cutover claimed
