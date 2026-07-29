# Anthropic v3 request diagnosis and v3.1 evaluation

## Scope and confirmed cause

- Branch: `cursor/phase-0-handoff-schema-alignment`
- Starting commit: `db229a848de7fe41d9407a73ba4976d8f3a3dd13`
- DB reads/writes: `0/0`; production access: `0`; retries/fallbacks: `0`.
- Live calls in this stage: 5 (`1` diagnostic + `1` smoke + `3` remaining fixtures).

The single diagnostic request for `365300` returned HTTP `400`, request ID `req_011CdVpXwiS7VtRSoucBFaDx`, type `invalid_request_error`, and this bounded sanitized message:

> The compiled grammar is too large, which would cause performance issues. Simplify your tool schemas or reduce the number of strict tools.

This explicitly confirms `schema_too_complex`; it is not an inference about timeout, model support, or account availability. No raw HTTP error body, request body, key, header, or prompt was stored.

## Schema metrics and fix

| Metric | v3 | v3.1 |
| --- | ---: | ---: |
| Objects | 11 | 2 |
| Arrays | 19 | 3 |
| Properties | 40 | 10 |
| Max nesting depth | 4 | 4 |
| Type unions / nullable fields | 6 / 6 | 6 / 6 |
| Enums / values | 1 / 6 | 1 / 10 |
| Objects missing `additionalProperties: false` | 0 | 0 |

V3.1 changes only the provider-facing grammar: the separate field-specific lists become one flat `claims` array. Deterministic code validates it and regroups it into the unchanged internal v3 concepts. Trusted source institution, publishing department, scholarship-organization taxonomy, source refs, evidence reconstruction, and normalizers remain unchanged.

## Provider execution

| Stage / fixture | Status | Latency | Tokens | Result |
| --- | --- | ---: | ---: | --- |
| diagnostic `365300` | HTTP 400 | 1,883ms | — | `schema_too_complex` confirmed |
| v3.1 smoke `365300` | completed | 24,605ms | 1,633 / 1,766 | parse/schema/ref/raw valid |
| v3.1 `365405` | failed | 64,541ms | — | `json_parse` |
| v3.1 `365411` | failed | 49,298ms | — | `json_parse` |
| v3.1 `365911` | validation failed | 39,419ms | 2,312 / 3,378 | unsupported organization role `donor` |

`365300` was not called twice for evaluation: its successful smoke output is its only v3.1 evaluation result. No failed fixture was retried.

## Semantic evaluation and risk

The successful `365300` result is usable for review: scholarship name, eligibility, three application periods, application method, constraints, benefit scope, and source refs are supported; dates normalize deterministically. `publishing_department` is `장학복지팀` with a source segment containing the posting department, and no source institution was incorrectly added. Contact type/category is absent in the flat provider output, so it is `PARTIAL` rather than inferred.

`365405` and `365411` are `NOT_EVALUATED` because no parseable JSON was accepted. `365911` reached HTTP 200 but is not accepted as structured extraction: `양영재단` was labelled `donor`, outside the allowed role taxonomy. This is a schema failure, not a role confusion or hallucination finding.

- Provider/request failures: 2 JSON parse failures
- Provider-facing schema validation failures: 1
- Valid semantic results: 1/4
- Invalid source refs: 0 in the accepted result
- Role confusions / hallucinations: 0 observed in accepted results

## Decision and limits

Final decision: **HOLD**. The exact HTTP 400 cause was fixed with a minimal, evidence-backed schema flattening, and the smoke succeeded. However, only one valid semantic result is available; the required threshold for a conditional pass is not met. This does not demonstrate crawler, DB, queue/UI, production, scale, cost, generalization, or publication readiness.

Artifacts: `reports/llm-analysis/anthropic-v3-request-diagnostic.json`, `reports/llm-analysis/ewha-segment-reference-evaluation-v31-smoke.json`, and `reports/llm-analysis/ewha-segment-reference-evaluation-v31-remaining.json`. The unrelated uncommitted `reports/analysis-nonproduction-pilot-latest.json` remains untouched.
