# Segment-reference manual semantic audit v3.3.3

This is a static, claim-by-claim review of the 32 persisted v3.3.2 audit items for `ewha_068_365405` and `ewha_068_365411`. It does not call a provider, database, crawler, or production system.

Each record preserves the v3.3.2 fixture ID, claim index, semantic value, and source references. `CORRECT` is assigned only after comparing the claim value and scope to its cited fixture evidence. Punctuation and date-spacing differences are noted as normalized matches, not newly inferred facts.

| Fixture | Claims | Correct | Partial | Unsupported | Hallucinated |
| --- | ---: | ---: | ---: | ---: | ---: |
| `ewha_068_365405` | 16 | 16 | 0 | 0 | 0 |
| `ewha_068_365411` | 16 | 8 | 8 | 0 | 0 |

The eight partial claims in `365411` have valid period/contact evidence and an appropriate scope label, but their `semantic_value` is `null`. They are not hallucinations and are not usable semantic facts. One narrow next-step repair candidate remains: re-extract those eight claims from their cited period/contact segments. Both organization identities are correct; their missing canonical roles remain separately `PARTIAL` and must not be inferred from the process description.

Decision: **CONDITIONAL PASS**. All 32 claims have specific evidence-based assessments, no invalid source reference or critical hallucination was found, and the remaining repair scope is bounded.
