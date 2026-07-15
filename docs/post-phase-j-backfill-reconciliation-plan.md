# Post-Phase J Backfill and Reconciliation Plan

## Execution boundary

This is a future plan. J runs no backfill, crawler, attachment download, or database operation. The future sequence is:

```text
inventory -> dry-run -> human-reviewed exception set -> bounded non-production apply -> reconciliation -> separate production approval
```

## Reconciliation classes

| Class | Meaning | Planned handling |
| --- | --- | --- |
| `exactly_mappable` | Exact source identity and notice identity are supported by source/article ID or canonical URL evidence. | Eligible for dry-run candidate. |
| `mappable_with_review` | Identity is supported but reviewer/event or provenance linkage needs confirmation. | Human exception-set review. |
| `ambiguous_identity` | Multiple identity candidates, unsafe URL normalization, or duplicate ambiguity. | Exclude from apply; preserve evidence. |
| `missing_source` | No exact `source_key -> source_id` resolution. | Block; never fuzzy-match or create source. |
| `missing_notice_evidence` | Missing article ID/URL/raw evidence or unverified body/asset attribution. | Exclude pending evidence. |
| `legacy_public_only` | Existing scholarship has no safe crawled-notice source mapping. | Preserve existing public row; do not invent provenance. |
| `excluded_from_backfill` | Out of scope, invalid, or explicitly retained in legacy-only form. | Count and report. |

## Dataset treatment

`crawled_notices`: map source, article ID/canonical URL, raw URL/body/image metadata, existing status, `scholarship_id`, reviewer fields, and seen/run timestamps. Existing mutable reviewer state is not fabricated into a historic sequence: at most a clearly labeled imported legacy-state event may be proposed after approval, with original fields preserved as evidence.

`scholarships`: preserve numeric `id`, public fields, and route. Match only through an existing explicit `crawled_notices.scholarship_id` or a human-approved mapping. A direct public record without safe notice provenance is `legacy_public_only`.

Attachments: retain only discovered URL/metadata status. Missing attachments remain missing; no download/OCR/extraction occurs. Duplicate URLs and redirect aliases are reconciled to URL-alias evidence without changing notice identity.

## Required invariants

- No public record deletion and no scholarship ID change.
- No zero-match or disappearance inference.
- No duplicate public projection for one approved review item.
- No fabricated review history or source identity.
- No fuzzy source matching.
- Idempotent rerun through source-scoped identity and run idempotency keys.
- Deterministic output ordering and explicit unresolved-class counts.

## Future dry-run output

The dry-run must produce a redacted manifest: input snapshot identifier, source/mapping counts, class counts, proposed inserts/updates by table, idempotency conflicts, unresolved records, and per-record reason codes. The bounded non-production apply repeats the manifest fingerprint, verifies expected counts transactionally, then emits graph-versus-legacy and projection-versus-`scholarships` reconciliation reports.
