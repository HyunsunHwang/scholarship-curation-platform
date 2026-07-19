# ADR — Engine Phase 4 identity, schema, evidence, and evaluation contracts

- Status: accepted for Gate A interchange contracts
- Date: 2026-07-19
- Scope: contract-only foundation; no extraction, persistence, migration, or notification implementation

## Context

A source notice, its attachments, a scholarship program, and one recruitment cycle are not a 1:1 set. A source may replace a PDF without changing its URL, repost one cycle under another URL, publish a school recommendation notice that points to a foundation notice, or publish results and information sessions beside recruitment notices. URL identity and title similarity therefore cannot decide opportunity identity on their own.

Phase 4 structured candidates will later feed Phase 5 change detection, identity resolution, review, canonical read models, and user notifications. False merges can hide a new opportunity or attach requirements to the wrong program. False splits can duplicate notifications and fragment revision history. Both are user-impacting errors, so ambiguous cross-source and cross-cycle cases fail closed to review.

This contract is a pipeline interchange contract, not a physical database schema. It extends the normalized crawler graph and Phase 3 document result without changing their tables, identity functions, cache, checkpoint, or runtime.

## Existing implementation survey

| Existing concept | Decision | Phase 4 relationship |
| --- | --- | --- |
| `notice_sources.source_id` | Reuse unchanged | DB-canonical source identity and parent of `SourceNotice`. |
| crawler `source_key` | Reuse unchanged | Stable crawler natural/idempotency key, retained as `source_key_snapshot`; never promoted to a second DB identity. |
| Post-Phase L `ingestion_notices` identity | Extend | Becomes `SourceNotice`; existing external article ID or canonical detail URL key remains authoritative within one source. |
| canonical URL and URL aliases | Reuse | Evidence for source-notice resolution and repost review, not program/cycle identity by themselves. |
| `ingestion_notice_occurrences` | Reuse | Observation/run provenance feeding a source-notice revision. |
| `ingestion_notice_revisions` content hash and stable UUID | Extend | Input to `OpportunityRevision`; not sufficient for program/cycle identity. |
| Phase 3 `document_id`, byte SHA-256, normalized-text SHA-256 | Extend | `SourceDocument` logical identity and immutable document-revision evidence. |
| Phase 3 parser/OCR version and cache key | Reuse | Extraction provenance only; parser cache remains separate and unchanged. |
| `ingestion_notice_assets` | Extend | Attachment metadata and document linkage; URL alone is not a document revision. |
| normalized graph `normalized_payload` | Extend later | Possible carrier for the interchange candidate after a separate integration gate; unchanged here. |
| `review_items`, decision events, effective decisions, evidence references | Reuse conceptually | Human decision boundary; no row or schema changes in Gate A. |
| `crawled_notices` and `scholarships` | Avoid as canonical Phase 4 identity | Retained staging/read-model/product responsibilities; no parallel writes. |
| `lib/notice-extraction.ts` provider code | Avoid for Gate A | Existing LLM/provider implementation is not called or expanded. |
| Post-Phase I evidence-linked replay | Extend contract principles | Reuse fail-closed evidence references and prompt-injection boundary; do not treat replay quality as model quality. |
| `body_quality`, confidence, candidate/review states | Extend | Quality and confidence inform review. Confidence never substitutes for evidence or approval. |
| program/cycle physical DB tables | Undecided | Deferred until identity evaluation and team-approved Phase 5 physical design. |

No existing JSON Schema served the same role. The JSON Schemas under `schemas/engine/` are the source of truth. Ajv is a direct development dependency so validation does not rely on another package's transitive dependency. JavaScript helpers add cross-reference and semantic checks that JSON Schema alone does not express clearly.

## Decision: identity hierarchy

| Identity | Meaning | Created by | Identity inputs | Stable | Mutable | Parent | Deduplication scope | Revision relationship | Notification effect | Stored today | Gate A implementation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `SourceNotice` | One publisher's logical board article | Existing normalized graph adapter | `source_id` plus external article ID, otherwise canonical detail URL hash | Yes within source | URL aliases and last-seen metadata may change | `notice_sources.source_id` | One source | Has occurrences and content revisions | Never sufficient alone | `ingestion_notices` | Mapped, not changed |
| `SourceDocument` | One logical attachment/body document and its immutable byte revision | Phase 3 parser handoff | document reference plus byte SHA-256 and parser provenance | Logical document ID stable; revision immutable | New bytes create a revision | `SourceNotice` revision/asset | One source notice and attachment role | Byte/hash change creates document revision | May cause changed-opportunity review | Compact evidence exists in normalized payload/assets | Contract only |
| `ScholarshipProgram` | Durable scholarship program independent of a particular term | Future Phase 5 resolver plus reviewer | normalized provider, program name, stable publisher identifiers, cross-source evidence | Intended stable | Curated aliases may evolve | Provider/organization (future) | Cross-source only with evidence | Has many cycles | No direct alert without a cycle | No canonical table | Candidate only |
| `RecruitmentCycle` | One application round for a program | Future Phase 5 resolver plus reviewer | program candidate, academic term/round, application window, host/recommendation scope | Stable after resolution | Corrective metadata may be reviewed | `ScholarshipProgram` | Program plus cycle boundary | Has opportunity revisions and related events | New cycle can generate a new-opportunity alert | No canonical table | Candidate only |
| `OpportunityRevision` | Immutable structured view of one cycle as observed through one or more source notices/documents | Phase 4 candidate builder (future) | cycle candidate, source-notice revision, document revision IDs, content fingerprint | Immutable | New material or non-material content creates another revision | `RecruitmentCycle` candidate and `SourceNotice` | One cycle and evidence set | Ordered revisions | Never alerts before validation/review policy | Notice revisions exist, not this interchange object | Schema only |
| `MaterialChangeEvent` | Classified semantic delta between opportunity revisions | Future Phase 5 comparator plus reviewer | before/after field values and evidence | Immutable event | Effective disposition may be reviewed | `RecruitmentCycle` | One cycle | References two revisions | Eligible for changed-opportunity alert only after notification-safe approval | No canonical table | Schema only |

`OpportunityRevision` is the user-exposure opportunity representation requested by this roadmap. It is not a public row and is never automatically published in Gate A.

## Stable identity and revision rules

1. A source notice remains the same when its source-scoped external article ID remains stable. Canonical URL and explicit aliases are fallback evidence, not cross-source identity.
2. A document revision is identified by immutable bytes (`document_hash`) plus its logical document identity. Same attachment URL with different bytes creates a new document revision.
3. Program candidates require provider and program evidence. Title similarity, URL, or document hash alone cannot resolve them.
4. Cycle candidates require a program candidate and bounded round evidence such as academic term, application window, or explicit round label. A new term or explicit additional recruitment normally creates a new cycle.
5. Title-only edits are non-material revisions unless they change program, cycle, eligibility, benefit, or application meaning.
6. Deadline extensions, eligibility changes, and benefit changes are material revisions of the same cycle when cycle evidence remains stable.
7. Result announcements, information sessions, and general guidance are related events, not recruitment opportunities. Their relationship requires evidence and can remain review-required.
8. School recommendation and foundation notices may describe the same program, but their opportunity/cycle relationship is not automatically identical because deadlines, applicant scope, and submission steps can differ.
9. Automatic identity is allowed only for source-scoped notice/revision rules already deterministic in the normalized graph. Cross-source program/cycle resolution and material changes with conflicting evidence require review.

## Identity decision matrix

“Same document” means the same logical document; “new revision” means its bytes/content revision changed.

| Case | Same source notice | Same logical document | Same program | Same cycle | New alert | Change alert | Binding Phase 5 rule |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Title only edited | Yes | Yes/NA | Yes | Yes | No | No by default | New opportunity revision; review if semantic fields changed. |
| PDF replaced | Yes | Yes, new revision | Usually yes | Review if cycle evidence changes | No | Review required | Compare document hash and extracted material fields. |
| Deadline extended | Yes | Yes or new revision | Yes | Yes | No | Yes after validation | `deadline_extension` material event. |
| Additional recruitment | Same or new | Same or different | Yes | Usually no | Yes after cycle resolution | No | Explicit additional round creates a new cycle. |
| Next semester recruitment | Usually no | Usually different | Yes | No | Yes after cycle resolution | No | Academic-term boundary is cycle identity evidence. |
| Selection result notice | No | Different/NA | Review | Related cycle, not a cycle opportunity | No | No recruitment alert | Classify as related result event. |
| School recommendation and foundation notice | No | Different | Possibly yes | Review required | At most one after review | Possibly | Never merge solely by program/title similarity. |
| Same notice reposted | Review via alias/evidence | Same or different | Usually yes | Usually yes | No until review | No/possibly | Repost candidate must preserve both source-notice evidence sets. |
| Attachment only, no body | Yes | Yes | Review required | Review required | No until review | No until review | Attachment evidence may support values; missing body is not automatic failure. |
| Content replaced at same URL | Yes | Same logical document if same role, new revision | Review | Review | No until comparison | Review/yes | URL stability never suppresses content revision. |

## Canonical structured schema

`schemas/engine/phase-4-canonical-scholarship.schema.json` is the source of truth. It is versioned as `engine-phase-4-canonical-scholarship/v1` and represents an extraction candidate, not an approved scholarship or database row.

Field values distinguish `present`, `not_found`, `unknown`, `not_applicable`, `ambiguous`, and `conflicting`. `null` therefore cannot carry state by itself. Present values retain raw and normalized forms, confidence in `[0,1]`, evidence references, and validation errors. Confidence combines extraction method reliability and evidence quality; it is not a model's unchecked self-rating and never authorizes publication.

Dates preserve exact date/datetime, ranges, open-ended/recurring/relative forms, source text, timezone, and inferred state. Amounts preserve currency, exact/range, period, tuition-waiver/full/partial tuition, non-cash benefit, and raw text. Eligibility uses bounded AND/OR groups of inclusion/exclusion conditions with dimension, comparator, values, scope, and raw expression. This is an interchange representation, not a complete rule engine.

## Evidence and provenance

`schemas/engine/phase-4-evidence.schema.json` unifies HTML text/attributes/table cells, PDF text/table cells, HWP/HWPX text, OCR regions, attachment and URL metadata, and manual annotations. Locators support page, section, selector/attribute, text span, table coordinates, and OCR bounding boxes. Document-backed evidence must link to a document revision and SHA-256.

Confirmed normalized values require evidence references. Deterministic identity metadata is allowed through explicit source-notice/document provenance rather than a fabricated text quote. Model inference requires both evidence and an inference reason. Values absent from evidence are validation failures. Canonical records contain only minimal evidence spans; they do not duplicate raw bytes or complete extracted documents. Evidence must exclude unnecessary personal information and secrets.

Document-backed evidence requires a non-null logical document ID, document-revision ID, SHA-256, and locator. HTML/URL evidence requires a non-null source-notice ID; OCR requires a page and bounding box; table evidence requires coordinates; manual annotations require an annotation ID and reason. Text evidence must carry non-empty raw or normalized text. Metadata evidence must carry text, a non-empty metadata object, or an attributable attachment URL. JSON Schema enforces these shapes and the semantic validator repeats them with diagnostic error codes.

Confirmed classification and material-change events always require evidence. Proposed program and cycle candidates require evidence. An `unresolved` identity candidate may have no evidence only while the record remains explicitly review-required, automatic publication and notification remain disabled, and no identity is treated as resolved. This represents insufficient evidence, not an evidence-free identity conclusion.

Extractor kind/name/version, parser version, model/provider/prompt version when applicable, document hash, and creation time make results comparable. Manual annotations use non-personal annotation IDs; actor identity remains in the existing review event boundary.

## Pipeline connection

| Stage | Input | Output | Responsibility | Mutability | Failure state | Evidence location |
| --- | --- | --- | --- | --- | --- | --- |
| Crawler source | exact source config | source result | Transport/list/detail observation | Config mutable; result immutable | blocked/zero-match/partial | run and source-result evidence |
| Source notice | observed detail | normalized notice/occurrence/revision | Source-scoped identity and raw observation | Notice metadata mutable; occurrences/revisions immutable | ambiguous identity fails closed | normalized graph |
| Source document | attachment/body bytes | Phase 3 document result | Bounded parsing, fingerprint, quality | Document revision immutable | parser/OCR/manual review states | Phase 3 result/cache and compact handoff |
| Phase 4 candidate | notice/document revisions | canonical extraction candidate | Field normalization with evidence | Immutable candidate | schema/semantic invalid or review required | Phase 4 interchange record |
| Deterministic validation | candidate and schemas | errors/warnings | Schema, refs, ranges, hierarchy, invented values | Immutable result | invalid/review required | validation object/report |
| Review decision | candidate and evidence | append-only decision | Human acceptance/rejection/correction | Events immutable; projection mutable | open/blocked | existing review model |
| Phase 5 resolution | reviewed candidates/revisions | program/cycle/change resolution | Cross-source identity and semantic delta | Resolution event immutable | conflict/review required | future design |
| Canonical read model | approved resolution | product shape | Compatibility/public projection | Rebuildable | hidden/fail closed | future adapter/read model |
| Notification eligibility | approved material event | eligible notification | Deduped safety policy | Event immutable | suppressed/review required | future notification ledger |

## Alternatives considered

- **URL identity only:** rejected because URLs move, reposts occur, and content can change at a stable URL.
- **Title similarity only:** rejected because templated titles collide and minor wording can hide new cycles or unrelated guidance.
- **One-table upsert model:** rejected because it destroys occurrence, revision, document, and review provenance.
- **LLM-only identity decision:** rejected because outputs are nondeterministic, difficult to audit, and unsafe without evidence/review.
- **Document hash as opportunity identity:** rejected because one cycle can have many documents and one replaced document need not create a new cycle.
- **No program/cycle distinction:** rejected because recurring programs require cycle-specific eligibility, dates, benefits, review, and notifications.

## Consequences

The hierarchy improves semantic accuracy, auditability, and notification safety. It also adds schema and review complexity. Cross-source resolution, reposts, recommendation flows, conflicting sources, low-quality OCR, and uncertain cycle boundaries remain conservative review cases. DB migration, physical keys, extraction implementation, automated identity resolution, UI, and notification policy are deliberately deferred to separately reviewed gates.
