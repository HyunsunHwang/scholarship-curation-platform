# Post-Phase F-3 P1 Quality / Attachment / Encoding Remediation

## Purpose

Post-Phase F-3 handles the two P1 remediation decisions from Post-Phase A with bounded fixtures and read-only reports. It preserves attachment metadata where present, records encoding risk, and prevents attachment-only or corrupted text from silently becoming clean.

## Relationship to A, F-1, and F-2

Post-Phase A supplies the P1 decisions. F-2's deferred `cau_003` detail evidence and `cau_012` inventory evidence remain explicit handoff items rather than being inferred away. F-1 consumes the F-3 report in its existing read-only admin diagnostics, showing remediation status, before/after classification, risk codes, and next actions.

## P1 Decisions

| Decision | Result | Evidence | Boundary |
| --- | --- | --- | --- |
| `A-P1-001` encoding normalization review (`cau_007`) | Resolved | Replacement characters are counted and route the bounded item to blocked/review. A separate normalization fixture can be clean only with sufficient readable text and no remaining risk. | No source text repair is claimed. |
| `A-P1-002` attachment parser (`cau_008`) | Deferred | Attachment metadata parsing preserves URL, filename, extension, mime-like hint, and detail-page relation in a representative fixture. | `cau_008` still lacks trustworthy metadata and remains blocked until attachment check. |

## Policy

- `no_assets` can be clean only with sufficient readable text.
- `attachment_only_possible` without metadata is `blocked_until_attachment_check`.
- Metadata present with a short body remains `admin_review_required`; downloads are not attempted.
- `image_only_suspected` and `short_body` remain review cases.
- Replacement characters or mojibake suspicion are `blocked_until_encoding_review`.
- Detail-body and list-only uncertainty remain parser or manual-spot-check work.

The fixture set separately demonstrates these states. A clean fixture is a policy proof with sufficient text, not a promotion of a real source item whose evidence remains incomplete.

## Non-Goals

No attachment is downloaded, no full crawl runs, and no detector keyword behavior changes. F-3 does not create a DB/Supabase write, migration, production apply path, automatic approval, or nationwide coverage claim. Zero-match remains an observation, never absence proof.

## Next Steps

- Resolve `cau_003` only after a reviewed list-to-detail fixture exists.
- Resolve `cau_012` only after explicit source identity and inventory evidence exists.
- Post-Phase G: User-facing Scholarship MVP.
- Post-Phase H: Bounded Coverage Expansion.
- Post-Phase I: LLM-assisted Review Prototype.
- Post-Phase J: Schema Proposal and Production Migration Planning.
