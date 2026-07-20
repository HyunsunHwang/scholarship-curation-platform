# Engine Phase 4 P0 remediated extractor

## Scope

This implementation adds a deterministic P0 remediation version without changing the historical Phase 4 baseline. It produces `engine-phase-4-p0-remediation-output/v1` records for preview validation only. It does not replace the official P0 or full Gate C evaluation, persist candidates, call an external model, or permit automatic publication.

## Versioned architecture

- Historical baseline: `lib/engine-phase-4/deterministic-extractor.mjs`, contract `engine-phase-4-deterministic-baseline/v1`.
- Remediated extractor: `lib/engine-phase-4/p0-remediated-extractor.mjs`.
- Name: `engine-phase-4-p0-remediated-deterministic`.
- Version: `1.0.0`.
- Entry point: `extractP0RemediatedCandidate({ sourceNotice, sourceDocuments, extractionContext })`.

The new extractor imports the baseline whitespace, explicit-label, and date-candidate normalizers read-only. Its classification priority, source-role separation, amount preservation, URL route checks, lifecycle calculation, review-reason generation, and evidence adapter are remediation-specific. This keeps the official baseline reproducible and avoids copying the baseline extractor wholesale.

`case_id` is selected from `extractionContext.caseId`, then `sourceNotice.case_id`, then `sourceNotice.notice_id`. Lifecycle uses only the injected `extractionContext.asOf` or `extractionContext.extractedAt`; wall-clock time and random values are not used.

## Safety rules

Document classification gives updated recruitment pages, correction notices, result announcements, information sessions, and general guidance explicit handling before the general recruitment decision. Weak scholarship vocabulary alone does not establish recruitment. Results and guidance are terminal; corrections remain relation-dependent; uncertain documents require classification review.

A recruitment notice is publishable only when a program identity is evidence-backed and the notice is not a composite opportunity. A non-publishable recruitment always requires `publishability_requires_confirmation`. `automatic_publish_allowed` is always false.

Application dates require an application or intake role. Recommendation, result, interview, payment, and other downstream dates are excluded by the reused role normalizer. Yearless dates are not assigned a year. Reversed windows fail closed, mixed precision produces an unknown lifecycle, and correction notices require relation resolution.

Application URLs require explicit application context and a distinct route. Route comparison ignores protocol, default ports, trailing slash, query, and fragment while preserving host, non-default port, and path.

Amounts preserve exact values, caps, ranges, tuition percentages, full tuition, and monthly, semester, or hourly periods. Tiered and multi-component values use `schema_expressiveness_gap` with components instead of an invented representative scalar. Applicant-requested and not-predefined amounts remain explicit contract kinds.

Every present value references evidence included in the output. Parser failures, unsafe document quality states, and unlocated OCR text are excluded from present-value extraction and force review where applicable.

## Preview and validation

Run:

```text
npm run engine:phase4:p0-extractor:preview
npm run engine:phase4:p0-extractor:test
npm run engine:phase4:p0-extractor:validate
```

The preview executes the frozen 24-case corpus twice with a fixed clock, validates every output against JSON Schema and the semantic contract, checks evidence and source-route integrity, verifies protected hashes, and writes:

```text
reports/engine-phase-4-p0-remediation-preview.json
reports/engine-phase-4-p0-remediation-preview.md
```

The reports are generated artifacts; change the extractor or preview generator first, then regenerate them. Full-schema Gate C and Phase 5 remain HOLD until separately authorized official reevaluations are completed.
