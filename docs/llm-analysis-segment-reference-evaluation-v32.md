# Segment-reference v3.2 remaining-case evaluation

## Scope

- Branch: `cursor/phase-0-handoff-schema-alignment`
- Starting commit: `a812271`
- Provider targets: `365405`, `365411` only; each pass A/B was called once, sequentially (4 total calls).
- `365300` was not accessed or called. `365911` used persisted v3.1 JSON only (0 provider calls).
- Timeout `120000ms`, max output tokens `4096`, DB reads/writes `0/0`, production access `0`, retries/fallbacks `0`.

## Design change

V3.2 retains flat claims but replaces three always-present raw fields with `raw_values`. Pass A permits core qualification fields; pass B permits action/constraint fields. Deterministic merge de-duplicates claims, records conflicts, reconstructs evidence, and only produces `completed` when both passes validate.

`365911` uses the exact alias `donor → funding_provider`; the organization value and source refs are not changed.

## Parse diagnosis and provider execution

| Fixture / pass | Status | Stop reason | Tokens (in/out) | Response length | Parse category |
| --- | --- | --- | ---: | ---: | --- |
| 365405 A | validation failed | end_turn | 8,594 / 2,446 | 4,878 | — |
| 365405 B | validation failed | end_turn | 8,574 / 2,660 | 5,951 | — |
| 365411 A | validation failed | end_turn | 9,244 / 2,025 | 3,703 | — |
| 365411 B | validation failed | end_turn | 9,224 / 3,483 | 6,662 | — |

All four responses started and ended with a JSON object; text length and SHA-256 were retained, but raw provider text was not stored. Therefore prior `json_parse` failures were not repeated. The remaining failures are validation failures:

- Pass A: source-segment raw-value mismatches and unsupported organization roles.
- Pass B: non-raw fields returned non-empty `raw_values`, often not present in selected segments.

No pass was retried.

## 365911 deterministic revalidation

The persisted role `donor` normalized to `funding_provider` after trim/lowercase exact alias matching. Source refs stayed unchanged and internal v3 validation passed. `양영재단` is therefore accepted as the funding provider, with no role confusion observed.

The persisted application-period raw values are not date expressions and normalize to `unresolved`; this field is `UNSUPPORTED`, not silently repaired.

## Manual assessment

- `365405`, `365411`: all semantic fields are `NOT_EVALUATED` as their two-pass results were not accepted.
- `365911`: scholarship name, publishing department, funding provider, eligibility, benefits, required documents, methods, constraints, and contacts are `CORRECT` from the revalidated persisted result; application periods are `UNSUPPORTED`; ambiguity handling is `PARTIAL` because no ambiguity was recorded despite malformed raw period choices.

## Risk and decision

- Provider/parse failures: 0 in v3.2
- Pass validation failures: 4
- Partial-pass fixtures: 0
- Accepted long-notice results: 0
- `365911` role revalidation: completed
- Invalid refs in accepted result: 0
- Merge conflicts: 0
- Role confusions/hallucinations in accepted result: 0
- Unresolved `365911` application periods: 2

Final decision: **HOLD**. Splitting removed the JSON-completion failure but did not produce accepted two-pass results for either long notice; only one of the three target fixtures is accepted after deterministic revalidation. This does not prove crawler, DB, queue/UI, production, scale, cost, generalization, or publication readiness.

## Artifacts

- `reports/llm-analysis/ewha-segment-reference-evaluation-v32.json`
- `reports/llm-analysis/ewha-365911-role-revalidation-v32.json`

The unrelated `reports/analysis-nonproduction-pilot-latest.json` remains untouched and excluded.
