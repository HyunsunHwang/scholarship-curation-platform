# Engine Phase 4 Gate B — deterministic extraction baseline

## Scope and contract

Gate B proves that a bounded, non-LLM extractor can consume the existing normalized `SourceNotice`/notice revision plus Engine Phase 3 document results and emit `scholarship_extraction_candidate` directly under `engine-phase-4-canonical-scholarship/v1`.

The pure entry point is:

```js
extractDeterministicScholarshipCandidate({
  sourceNotice,
  sourceDocuments,
  extractionContext,
})
```

`extractionContext.extractedAt`, extractor version, parser contract version, and fixture version are injected. The extractor does not read the current clock. The same input and context produce identical field states, normalized values, evidence IDs, identity candidate keys, content fingerprints, and review reason codes.

Gate A schema, evidence, identity, value-status, evaluation, publication, and notification semantics are consumed unchanged. Gate B does not call a model/provider, access a database, write candidates, resolve cross-source identity, compare revisions, or generate material changes.

## Existing implementation survey and reuse

- `lib/post-phase-l/normalized-graph.mjs`: reuses `canonicalizeNoticeUrl`, `sha256`, and `stableUuid`; source notice identity remains the normalized graph identity.
- `lib/crawler-engine/document-parsing/contract.mjs`: reuses the Phase 3 contract version and text normalization. Phase 3 byte SHA-256, parser version, content blocks, page/table/OCR locators, extraction status, and quality flags are mapped into Gate A provenance.
- `lib/crawler-engine/common-runner.mjs`, the generic HTML strategy, and the authoritative Phase 3 runtime are reused by the bounded public live runner.
- `lib/notice-body-extraction.mjs` remains the shared crawler-side HTML/body/table normalization path. Gate B consumes its normalized output rather than introducing another crawler or ingestion graph.
- `lib/scholarship-dates.ts` is an application display/expiry helper, not an extraction parser. `lib/support-amount.ts` formats card benefits, not canonical amounts. Reusing either would change their semantics, so Gate B adds narrowly scoped deterministic normalizers instead.
- `lib/notice-extraction.ts` is the existing provider/LLM path. Gate B neither imports nor invokes it.

Phase 3 does not expose a standalone document-revision row. When an adapter input omits `document_revision_id`, Gate B deterministically derives a revision reference from the existing Phase 3 `document_id + byte_sha256` using the repository's stable UUID helper. It does not merge documents or infer cross-source identity.

## Capability matrix

| Field / task | Supported patterns | Unsupported patterns | Failure state | Review required |
| --- | --- | --- | --- | --- |
| Classification | Recruitment signals from title/body plus application period/method/eligibility; result, information session, guidance, correction | Semantic paraphrases with insufficient rule signals; result/recruitment conflict | `unknown` | Yes when uncertain/conflicting |
| Dates by role | `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD`, Korean year/month/day, time, explicit application range, application/recommendation/result roles | Missing year, relative dates, implicit “latest date”, role-free date lists | `ambiguous`, `conflicting`, or `unknown` | Yes |
| Amounts | Exact KRW, comma form, 만/백만 units, ranges, month/semester/year/program period, full/partial tuition, simple non-cash benefits | Currency conversion, per-person arithmetic, tier tables requiring semantic selection, mixed alternatives | `ambiguous`, `conflicting`, or `not_found` | Yes for mixed/conflicting values |
| Provider/program candidate | Explicit labeled provider and program name | Name inferred from similar sources or organization domain | `not_found`; identity `unresolved` | Yes when insufficient |
| Cycle candidate | Explicit year + term/half/season/round | Cross-source cycle matching, implicit academic year | `not_found`; identity `unresolved` | Yes when insufficient |
| URLs | Explicit HTTP(S) application link near application context, normalized with existing URL helper | Text-similarity URL guesses, synthesized paths | `not_found` | No unless another risky condition applies |
| Contacts | Explicit email and Korean phone pattern in contact context | Person/entity inference, redacted or obfuscated contacts | `not_found` | No unless input quality is insufficient |
| Application methods | Explicit online, email, institution-office, or postal submission phrases | Unlabeled verbs or inferred delivery channel | `not_found` | No unless unsupported method is material |
| Required documents | Explicit application form, transcript, enrollment certificate, recommendation, income evidence in a document-list context | Free-form document taxonomy outside the allowlist | `not_found` | No unless core submission instructions remain unclear |
| Eligibility | Explicit enrollment, grade, GPA lower bound, income-decile upper bound, nationality, residence; simple conjunction | Nested AND/OR, exceptions, ambiguous ranges, policy interpretation | `ambiguous` | Yes |
| Source language | Deterministic Hangul/Latin script signal | Translation, mixed-language semantic classification | `unknown` | No by itself |
| HTML | Heading/body spans and table cells tied to source notice identity | Missing selector/span or low-quality body | `unknown` or review | Yes when provenance/quality is insufficient |
| PDF | Phase 3 page text and table cells with byte hash/revision/page locator | Encrypted, failed, bounded, or partial parse as confirmed values | `unknown` | Yes |
| HWP/HWPX | Phase 3 extracted text with section locator | Binary HWP without injected parser; failed/partial parse | `unknown` | Yes |
| OCR | Only successful OCR blocks with page and bounding box | Low confidence, missing page/bounding box, skipped pages | `unknown` | Yes |
| Table extraction | Phase 3 table cell text with row/column coordinates | Merged semantic headers requiring interpretation | `ambiguous` or `not_found` | Yes when interpretation is required |
| Conflicting evidence | Distinct normalized values across notice/document evidence | Automatic source precedence | `conflicting` | Yes |

## Evidence and fail-closed behavior

Evidence IDs hash canonical serialization of source notice identity, notice/document revision, source type, complete locator, normalized minimal text, and field role. The `ev_` ID is stable, duplicate evidence is deduplicated, and document evidence retains the Phase 3 document hash and parser version. HTML provenance retains the normalized source notice ID and span/selector; table evidence retains row/column; OCR evidence is accepted only with page and bounding box.

Every `present` field, confirmed classification, and `proposed` program/cycle candidate has evidence. Low-quality/partial/failed documents are excluded from confirmed extraction. Missing years are never filled from the current year. Multiple benefit alternatives, cross-source relationships, attachment-only gaps, complex eligibility, conflicting dates, and insufficient program/cycle evidence remain review-required. `automatic_publish_allowed` and `notification_allowed` are always `false`.

## Identity and revision boundary

Source notice and revision identity are mapped from the normalized graph. Program and cycle outputs are source-local candidates only. Explicit provider + program evidence permits `proposed`; an explicit cycle label plus a proposed program permits a proposed cycle. Otherwise candidates remain `unresolved` and review-required.

Possible reposts, school/foundation relationships, and other cross-source links are never auto-resolved. Without an explicit before/after revision pair, `material_changes` is always empty. Pair resolution and material-change comparison remain Phase 5 work.

## Fixtures and evaluation

The deterministic fixture corpus preserves all 15 Gate A scenario names: normal HTML, PDF-primary, table-primary, attachment-only, multiple dates, deadline extension, new term, result announcement, school recommendation, repost, complex eligibility, amount range/tuition alternatives, missing value, conflicting sources, and low-quality OCR. Each case contains synthetic normalized notice and Phase 3-shaped document input plus expected classification, selected field states, review policy, normalized values, and evidence source types.

The evaluator reuses Gate A metric names. Classification, annotated field presence, normalized exact/partial match, evidence attribution, unsupported value rate, and risky-case review recall are measured. Identity pair precision/recall and material-change classification are explicitly `not_evaluated` because Gate B has neither a pair resolver nor before/after comparator.

## Bounded public live proof

The live runner is read-only and bounded to `korea_002` and `yonsei_001`, one notice per source, two PDFs total, five pages per PDF, and document parsing enabled. It reuses the common crawler, normalized graph plan, and Phase 3 parser. It writes only a sanitized summary under ignored temporary output: no title/body, URL, evidence text, raw HTML, document bytes, credential, database value, or local path is tracked.

## Candidate areas for Phase 4C

The Gate B evidence suggests a limited Phase 4C experiment may be useful for semantic document classification when surface rules conflict, complex/nested eligibility, tiered benefit tables, unlabeled date-role assignment, organization/program separation in unstructured titles, and normalization of uncommon application/document terminology. Any such experiment must retain Gate A evidence and review boundaries and must not perform Phase 5 identity or material-change decisions. Gate B alone does not decide whether Phase 4C is required before a Phase 5 prototype; that decision should use representative evaluation beyond the synthetic baseline.
