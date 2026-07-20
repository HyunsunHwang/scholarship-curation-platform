# Engine Phase 4 P0 remediated extractor

## Scope

This implementation adds a deterministic P0 remediation version without changing the historical Phase 4 baseline. It produces `engine-phase-4-p0-remediation-output/v1` records for preview validation only. It does not replace the official P0 or full Gate C evaluation, persist candidates, call an external model, or permit automatic publication.

## Versioned architecture

- Historical baseline: `lib/engine-phase-4/deterministic-extractor.mjs`, contract `engine-phase-4-deterministic-baseline/v1`.
- Remediated extractor: `lib/engine-phase-4/p0-remediated-extractor.mjs`.
- Name: `engine-phase-4-p0-remediated-deterministic`.
- Version: `1.1.0` (evidence-preservation boundary; the initial remediation preview was `1.0.0`).
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

## Evidence preservation boundary

Source HTML body text is accepted when its explicit quality/extraction metadata is one of `text_sufficient`, `success`, `safe`, `normalized`, `clean`, `good_text`, `no_assets_but_text_sufficient`, or `text_sufficient_no_assets`. Explicit empty, partial, insufficient, low-quality, OCR-unevaluated, parser-failed, unsupported, download-failed, or manual-review states are rejected before classification or field extraction. Existing fixtures with no body status remain accepted for backward compatibility; the absence is not converted into a synthetic quality assertion.

Attachment text is eligible only when it has a document ID, a valid SHA-256 document hash, a supplied or deterministically derived revision ID, a recognized PDF/HWP/HWPX/image/HTML format, explicit successful extraction and quality statuses, and a stable block or document locator. A revision ID may be derived only from the document ID and valid hash. Missing provenance, partial extraction, failed parsing, unsafe quality, or manual review rejects the entire attachment and adds `upstream_evidence_incomplete`.

OCR has the attachment requirements plus a safe OCR status, page number, and bounding box. The locator serializes document ID, block index, page, and a key-sorted bounding box. OCR document-level text without a located block is rejected. This makes both revision and evidence identities deterministic.

HTML bodies are segmented only at existing paragraph or line boundaries. Attachment tables and text retain their upstream blocks; OCR retains its located block. Evidence IDs use notice ID, document revision, source type, locator, and normalized text. Exact duplicate IDs are suppressed, while equal text with different provenance remains separate.

Classification records the segment that supplied each decisive signal. Strong title decisions retain title evidence; body- or attachment-driven recruitment and correction decisions reference their actual signal segments; multi-signal decisions retain the minimal unique segment set. Every classification reference must resolve within the output evidence list.

Evidence selection priority is structured HTML/table, safe attachment table/text, safe located OCR, then title fallback. Identical dates from multiple sources resolve once using that priority; different safe dates conflict. A detailed attachment amount structure takes precedence over a body summary scalar so a composite cannot be reduced to the first number encountered.

For paid student activity, `activity_scholarship` and `work_scholarship` are contract-expressible support types and therefore use `support_type.status=present`. A combined monthly and hourly amount remains `support_amount.status=schema_expressiveness_gap` with components and the `paid_activity_feed_partition_required`, `complex_amount_structure`, and `amount_schema_expressiveness_gap` review reasons.

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

The JSON report also records rejected evidence sources and reasons, classification evidence IDs, present-field source types, low-quality body and attachment rejection counts, OCR locator/quality rejection counts, classification evidence shape, duplicate suppression, and attachment/OCR present-claim counts. These are preview diagnostics, not an official accuracy reevaluation.

The reports are generated artifacts; change the extractor or preview generator first, then regenerate them. Full-schema Gate C and Phase 5 remain HOLD until separately authorized official reevaluations are completed.
