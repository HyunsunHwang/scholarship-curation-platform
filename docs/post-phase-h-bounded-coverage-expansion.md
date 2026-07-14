# Post-Phase H - Bounded Coverage Expansion

Post-Phase H compiles a bounded, fixture-backed before/after comparison for four risk-prioritized sources. Its closure adds a separately recorded, read-only live cross-check that reuses the existing fetch, list extraction, and detail/body/attachment extractor helpers without running the operational crawler workflow.

## Evidence boundary

- Target count is four, with a maximum budget of three list pages, five detail checks, three attachment metadata checks, zero attachment downloads, two retries, and a 15-second timeout per source.
- The fixture comparison records pagination lift for `cau_002`, detail extraction for `cau_003`, readable-body parser behavior for `cau_007`, and attachment metadata behavior for `cau_008`.
- `cau_012` remains deferred to J because the committed inventory lacks the source identity needed for bounded source evidence.
- The fixture builder fetches no endpoint and runs no crawler workflow. A separate closure runner records public-endpoint live observations with stricter limits of two list pages, three detail candidates, three attachment metadata checks, zero downloads attempted, two retries, and a 15-second timeout per source.
- A fixture result is not evidence that a live source currently behaves the same way. The live closure did not credit generic anchor candidates as notice details where source-specific mapping configuration was absent.

## Public and review boundary

H preserves the G exposure policy. Newly observed, duplicate-risk, blocked, parser-risk, attachment-risk, and review-required items are not automatically public. `public_exposure_change_count` is always zero.

H does not claim source exhaustion, scholarship absence, full coverage, national completeness, attachment download success, or attachment content extraction. `no_next_page_observed` remains a bounded stop reason, not an exhaustion conclusion.

## Risk disposition

- `cau_003` is mitigated only for fixture extractor evidence; the live closure records missing source-specific notice mapping and duplicate review remains in J.
- `cau_007` has live HTTP/body observations, but they are not notice evidence without source-specific mapping; the mapping recheck defers to I.
- `cau_008` has the same mapping gap; attachment metadata and complex attachment interpretation remain deferred to I.
- `cau_012` source identity and inventory alignment defer to J.
- Contextual keywords are evidence-only. The production detector is unchanged.

See `docs/post-phase-h-reuse-matrix.md`, `docs/post-phase-h-target-selection.md`, and `reports/post-phase-master-risk-register.json` for source ownership and constraints.

See `docs/post-phase-h-live-bounded-source-verification.md` for the fixture/live boundary, the TLS fail-closed result, and the source-specific mapping limitation.

## Validation baseline

The bundled Node runtime passed `tsc --noEmit` and the Next production build. The direct ESLint check of H's two changed scripts passed. `npm` was not on this shell's PATH, so the full local ESLint baseline was invoked through the installed ESLint binary instead; it reported seven existing errors and five warnings outside H files. That baseline is tracked as a non-blocking J risk and is not attributed to H.
