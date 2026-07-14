# Post-Phase H Reuse Matrix

H inspected the latest main at `83c1d3f` before adding files. The phase adds no parallel crawler, parser, detector, source adapter, or public data route.

| Requirement | Existing implementation path | Current behavior | Decision | Reason |
| --- | --- | --- | --- | --- |
| Source allowlist, timeout, retries, item cap | `scripts/crawl-scholarship-notices.mjs` | Supports `CRAWL_SOURCE_ID_ALLOWLIST`, `CRAWL_MAX_ITEMS_PER_SOURCE`, retry and timeout configuration. | test-only | The operational crawler is not run in H; fixtures document a stricter bounded budget. |
| Detail URL and canonical URL handling | `scripts/crawl-scholarship-notices.mjs` | Resolves list links, filters non-detail URLs, and normalizes URL keys. | test-only | H supplies before/after fixture evidence instead of another resolver. |
| Detail body parsing | `lib/notice-body-extraction.mjs` | Reuses source-specific selectors, preferred selectors, quality signals, and fail-closed classification. | reuse | H builder calls `extractDetailFromHtml` for fixture-only detail evidence. |
| Attachment metadata | `lib/notice-body-extraction.mjs` | Extracts attachment metadata and marks downloads unverified. | reuse | H exercises metadata extraction only; no download or content parser is added. |
| Keyword detector | `scripts/crawl-scholarship-notices.mjs` and A triage fixtures | Uses existing configured keywords and records keyword-miss evidence. | test-only | H records `contextual_only` and `insufficient_evidence`; production detector rules are unchanged. |
| Source health and false-negative metrics | A, E, F0, F1 reports | Existing reports retain zero-match, parser, no-assets, and review states. | extend | H compiles bounded before/after fixture comparison without replacing those reports. |
| Public exposure policy | `lib/scholarships/public-scholarship-exposure-policy.ts` | Fail-closed policy exposes only reviewed safe items. | reuse | H fixes `public_exposure_change_count` at zero. |
| Master risk register | `reports/post-phase-master-risk-register.json` | Carries phase ownership and safety risk metadata. | extend | H adds bounded dispositions and explicit deferred ownership; it does not resolve schema/apply risks. |

No duplicate implementation was introduced. `scripts/build-post-phase-h-bounded-coverage-expansion.mjs` is a phase report compiler, not a crawler, adapter, parser, detector, or public read-model.
