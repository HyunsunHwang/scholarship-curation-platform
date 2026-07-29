# Segment-reference LLM extraction evaluation (v2)

## Scope

- Repository: `HyunsunHwang/scholarship-curation-platform`
- Branch: `cursor/phase-0-handoff-schema-alignment`
- Starting commit: `c0c1376c9e7e90f292357d4cdc8201a0c013bb31`
- Schema: `segment-reference-extraction-v2`
- Fixture: `fixtures/llm-analysis/ewha-real-notices-4.json` (`ewha_068`, 4 notices)
- Model: `claude-sonnet-4-6`; sequential execution, one call per notice at most; no retry, fallback, tools, DB, crawler, or production access.
- Auditable provider run: 2 calls. DB reads/writes: 0/0. Production access: 0.

The final decision is **HOLD**. The first notice completed contract validation; the second request had a sanitized `transport` failure, so the evaluator stopped without retry and did not call notices `365411` or `365911`. A preceding local invocation did not emit a persisted report and is not used as evaluation evidence or as part of the auditable run result.

## Design change

The v1 contract made the model generate both field values and an evidence quote, and it required model-produced ISO dates. V2 separates responsibility:

- The LLM returns a semantic value and selected `source_refs` only.
- Deterministic code segments the unchanged raw body, validates IDs and offsets, reconstructs evidence directly from raw segment text, and normalizes dates, numeric Korean amounts, and contacts.

The JSON schema rejects an `evidence`, `evidence_text`, or `quote` field. Semantic values are not required to be substrings; raw dates, amounts, and contact values must occur in their selected segment.

## Segmentation verification

| Fixture | Body length | Segments | IDs unique | Offset/reconstruction |
| --- | ---: | ---: | --- | --- |
| `ewha_068_365300` | 902 | 4 | yes | valid |
| `ewha_068_365405` | 8,229 | 17 | yes | valid |
| `ewha_068_365411` | 8,699 | 21 | yes | valid |
| `ewha_068_365911` | 1,564 | 7 | yes | valid |

Segments are contiguous raw spans: their offsets cover each `body_text` exactly and concatenating `segment.text` reconstructs it without normalization or omission.

## Offline checks

`node scripts/test-llm-segment-reference-evaluation.mjs` verifies fixture count/integrity, deterministic IDs and coverage, valid/invalid source refs, cross-fixture-shaped refs, raw values, evidence reconstruction, date and amount normalization, forbidden free-evidence fields, and non-authoritative normalized-date fields.

Additional checks passed:

- `node scripts/evaluate-llm-segment-reference-fixture.mjs --dry-run` — 0 provider calls.
- Invalid model, absent live permission, and retry flag are rejected before a provider call.
- The evaluator imports no Supabase/DB consumer, pilot, lease, or routing code.
- Existing minimal-evaluation and Anthropic provider adapter regression tests still pass.

## Provider execution and structured extraction

| Notice | Status | Tokens (in/out) | Schema / refs / raw values | Dates |
| --- | --- | ---: | --- | --- |
| `365300` | completed | 2,836 / 909 | valid / valid / valid | 3 ranges normalized |
| `365405` | transport failure | — | not available | not available |
| `365411` | not executed | — | — | — |
| `365911` | not executed | — | — | — |

For `365300`, the model selected `S001` for the scholarship name; `S002` for eligibility, all three application periods, and deadline effect; `S003` for the online application method and missed-application consequence; and `S004` for payment method and contacts. The evaluator reconstructed each evidence entry directly from those raw segments. It converted the three periods to `2026-07-01`–`2026-07-31`, `2026-08-01`–`2026-08-28`, and `2026-08-01`–`2026-08-31`.

## Manual assessment and risk

For `365300`, scholarship name, eligibility, benefit scope, periods, application method, constraints, contacts, and ambiguity handling are `CORRECT`; required documents are `NOT_PRESENT`. The organizer is `HALLUCINATED` under the strict contract: its selected `S004` says `학생처 장학복지팀`, but the semantic value added `이화여자대학교`. This is one critical semantic/source-reference discrepancy even though all mechanical source-ref and raw-value checks passed.

Risk totals: critical hallucinations 1; invalid source refs 0; critical claims without refs 0; raw values not found 0; normalization failures 0; schema failures 0; provider transport failures 1.

The approach has value for a review-assistant path: it eliminated v1's quote-copy failure and moved date formatting to deterministic code. It is not ready to proceed as an automatic review assistant until a full 4/4 run succeeds and the prompt/schema prevents unsupported organization expansion.

## Explicit limitations

This evaluation does not demonstrate production readiness, crawler stability, source-registry correctness, DB ingestion, review-queue integration, UI usability, routing/escalation, batch scale, cost optimization, generalization to other universities, or publication safety.

## Git result

This document and the separate sanitized v2 report are committed only after the implementation and offline verification. The unrelated uncommitted file `reports/analysis-nonproduction-pilot-latest.json` is preserved and excluded.
