# Post-Phase H - Bounded Coverage Expansion

Post-Phase H compiles a bounded, fixture-only before/after comparison for four risk-prioritized sources. It reuses the existing detail/body/attachment extractor and does not run the operational crawler.

## Evidence boundary

- Target count is four, with a maximum budget of three list pages, five detail checks, three attachment metadata checks, zero attachment downloads, two retries, and a 15-second timeout per source.
- The fixture comparison records pagination lift for `cau_002`, detail extraction for `cau_003`, readable-body parser behavior for `cau_007`, and attachment metadata behavior for `cau_008`.
- `cau_012` remains deferred to J because the committed inventory lacks the source identity needed for bounded source evidence.
- No endpoint is fetched and no crawler workflow is run. A fixture result is not evidence that a live source currently behaves the same way.

## Public and review boundary

H preserves the G exposure policy. Newly observed, duplicate-risk, blocked, parser-risk, attachment-risk, and review-required items are not automatically public. `public_exposure_change_count` is always zero.

H does not claim source exhaustion, scholarship absence, full coverage, national completeness, attachment download success, or attachment content extraction. `no_next_page_observed` remains a bounded stop reason, not an exhaustion conclusion.

## Risk disposition

- `cau_003` is mitigated only for fixture extractor evidence; duplicate review moves to J.
- `cau_007` remains deferred until a bounded public-source readable body is captured.
- `cau_008` and complex attachment interpretation defer to I.
- `cau_012` source identity and inventory alignment defer to J.
- Contextual keywords are evidence-only. The production detector is unchanged.

See `docs/post-phase-h-reuse-matrix.md`, `docs/post-phase-h-target-selection.md`, and `reports/post-phase-master-risk-register.json` for source ownership and constraints.

## Validation baseline

The bundled Node runtime passed `tsc --noEmit` and the Next production build. The direct ESLint check of H's two changed scripts passed. `npm` was not on this shell's PATH, so the full local ESLint baseline was invoked through the installed ESLint binary instead; it reported seven existing errors and five warnings outside H files. That baseline is tracked as a non-blocking J risk and is not attributed to H.
