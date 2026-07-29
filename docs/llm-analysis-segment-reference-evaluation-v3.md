# Segment-reference LLM extraction evaluation (v3)

## Scope

- Repository: `HyunsunHwang/scholarship-curation-platform`
- Branch: `cursor/phase-0-handoff-schema-alignment`
- Starting commit: `c1f030faff3c32f5d393de0205959863b8a2d579`
- Schema: `segment-reference-extraction-v3`
- Fixture: `fixtures/llm-analysis/ewha-real-notices-4.json` — 4 `ewha_068` notices
- Model: `claude-sonnet-4-6`; sequential, one call per fixture at most, no retry/fallback/tools.
- Timeout: `120000ms`; DB reads/writes: `0/0`; production access: `0`.

Final decision: **HOLD**. All four independent provider requests were made once, but each returned HTTP 400 before parsed model output was available. This is a provider/request-layer failure, not a semantic-quality result.

## Design refinement

V3 removes v2's overloaded `organizer` field.

- `source_context.publishing_institution` is deterministic trusted fixture metadata: `ewha_068 → 이화여자대학교`.
- `publishing_department` is a segment-referenced LLM field.
- `scholarship_organizations` is a segment-referenced role array: `funding_provider`, `program_operator`, `application_operator`, `recommending_institution`, `selection_body`, or `other`.

The model cannot return trusted source context, a deprecated `organizer`, or free evidence text. Deterministic code supplies trusted context, reconstructs evidence from selected raw segments, and normalizes dates, amounts, and contacts.

## Transport diagnosis

V2's second request ended at about 45 seconds, matching its adapter default timeout. V3 explicitly passes `timeoutMs: 120000` and safely records category, HTTP status, request ID when present, latency, and configured timeout—never API keys, headers, or raw provider error bodies.

| Fixture | Provider status | Latency | Category | HTTP status |
| --- | --- | ---: | --- | ---: |
| `365300` | failed | 2,430ms | `provider_4xx` | 400 |
| `365405` | failed | 392ms | `provider_4xx` | 400 |
| `365411` | failed | 423ms | `provider_4xx` | 400 |
| `365911` | failed | 456ms | `provider_4xx` | 400 |

Timeouts, authentication, rate limits, 5xx, network errors, empty content, and JSON parse failures were all zero. This low-latency, repeated 400 pattern is not a timeout. No fixture was retried.

## Offline tests

V3 tests cover trusted mapping and unknown-source rejection; `organizer` removal; source-context overwrite rejection; organization role allowlist; unsupported-context-expansion and role-confusion classification; segmentation/ref/raw-value/normalizer contracts; safe transport classification; 120-second propagation; continuation after timeout; authentication-wide stop; and dry-run 0 calls.

Existing v1/v2 evaluator and Anthropic adapter regression tests pass. The evaluator imports no Supabase, DB consumer, pilot, lease, or routing code.

## Structured extraction, evidence, and manual assessment

There is no parsed provider output, selected segment, reconstructed evidence, or semantic field result for any fixture. All fields are `NOT_EVALUATED`; none is inferred from failed requests.

## Critical-risk summary

- Critical hallucinations: 0 observed (no semantic output)
- Role confusions: 0 observed (no semantic output)
- Invalid source refs: 0 observed
- Unsupported critical claims: 0 observed
- Normalization failures: 0 observed
- Transport failures: 4 (`provider_4xx`)

The organization split and independent-fixture continuation are implemented and offline-tested, but this run cannot establish review-assistant semantic quality. A separately authorized investigation must identify the provider's 400 request/schema cause before another evaluation run.

## Limitations and Git

This does not prove crawler stability, source registry correctness, DB ingest, review queue/UI integration, production readiness, scale, cost, generalization, or publication safety. The unrelated `reports/analysis-nonproduction-pilot-latest.json` remains untouched and excluded.
