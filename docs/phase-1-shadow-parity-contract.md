# Shadow Parity Contract — Legacy vs Normalized Graph

Status: implemented locally (dry-run)
Phase: Phase 1 local shadow parity
Safety: no production dual-write, no DB apply, no scheduled cutover

## Goal

Compare the same crawler artifact through:

```text
legacy path
  crawler artifact
  → clean/merge CSV view
  → legacy notice rows (DB upsert NOT executed)

normalized shadow path
  crawler handoff
  → handoff→graph adapter
  → normalized graph plan (dry-run)
```

## Runtime entrypoints

```text
npm run test:shadow-parity
npm run run:shadow-parity-dry-run
```

Core modules:

- `lib/post-phase-l/handoff-to-graph-adapter.mjs`
- `lib/post-phase-l/legacy-notice-artifact.mjs`
- `lib/post-phase-l/shadow-parity.mjs`
- `scripts/run-shadow-parity-dry-run.mjs`
- `fixtures/shadow-parity/`

Reports are written under `reports/shadow-parity/` by the dry-run runner.

## Required inputs

- immutable crawler handoff (`crawler-handoff-v1`) or equivalent notice rows
- legacy daily CSV/JSON artifact used by current scheduled ingest
- source identity (`source_id`)
- generated-at / run identity for reproducibility

## Minimum comparison fields

| Field | Legacy source | Normalized source | Compare rule |
| --- | --- | --- | --- |
| source | `source_id` / university group | `ingestion_notices.source_id` | exact |
| notice count | distinct legacy notice URLs | distinct `(source_id, identity_key)` | count + set diff |
| title | CSV/title column | revision.title | normalized whitespace |
| published date | `notice_posted_at` / raw date | occurrence/revision date evidence | presence + parsed equality when both parse |
| canonical URL | notice URL normalized | `canonical_url` | canonicalize then exact |
| body presence | body non-empty | revision.body non-empty | boolean |
| body quality | length/heuristic if available | `body_quality_status` | presence + coarse bucket |
| attachment count | attachment metadata length | `ingestion_notice_assets` count | integer |
| application link | extracted links if present | section/application links in payload | set compare |
| candidate classification | crawler candidate fields if present | handoff candidate_classification | exact |
| Notice identity | legacy URL uniqueness | `identity_kind` + `identity_key` | report mapping |
| duplicate count | repeated URLs in artifact | repeated identity keys / alias conflicts | count |

## Pass / fail framing for a later shadow gate

A shadow gate should report, not auto-cut over:

```text
matched
legacy_only
normalized_only
field_mismatch
identity_mapping_review
```

Known current divergence worth tracking:

- Legacy ingest dedupes by `notice_url` globally, so different sources sharing one URL collapse to one legacy row.
- Normalized graph keeps one Notice per `(source_id, identity_key)`, so the same URL may produce `normalized_only` rows.

Suggested hard blockers before any scheduled cutover discussion:

- unsupported identity kinds generated
- alias uniqueness conflicts inside one source
- review-state overwrite risk on replay
- missing section evidence for inline_section sources
- environment guard bypass

## Explicitly out of scope until a later phase

- replacing `npm run ingest:notices`
- writing `ingestion_*` tables from scheduled workflow
- creating analysis jobs from shadow revisions
- public scholarships projection

## Phase 1 deliverable status

1. dry-run adapter: handoff → `buildNormalizedGraphPlan` — implemented
2. fixture corpus from representative crawler artifacts — implemented
3. parity report JSON + markdown summary — implemented
4. replay idempotency proof for the same artifact — implemented
5. no production write path enabled by default — implemented
