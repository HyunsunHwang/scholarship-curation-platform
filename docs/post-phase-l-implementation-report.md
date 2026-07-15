# Post-Phase L Implementation Report

## Current checkpoint

This document describes the implementation at the pre-apply owner gate. Repository implementation, SQL, local fixtures, dry-run, and validators are present. No remote Supabase read or write, migration apply, live crawl, review mutation, or public exposure was performed before the gate.

## Implemented surfaces

- `lib/post-phase-l/target-guard.mjs`: exact L target guard and production denylist
- `lib/post-phase-l/source-resolver.mjs`: exact one-row source resolution
- `lib/post-phase-l/normalized-graph.mjs`: deterministic graph planning and replay simulation
- `scripts/ingest-post-phase-l.mjs`: dry-run default and guarded L-only persistence
- `scripts/run-post-phase-l-pilot.mjs`: exact one-source/cohort orchestration with hard item/page bounds
- `scripts/verify-post-phase-l-runtime.mjs`: guarded DB read-back for duplicates, reconciliation, review state, and public leakage
- `scripts/bootstrap-post-phase-l-test-admin.mjs`: guarded test-admin bootstrap without credential output
- `scripts/crawl-scholarship-notices.mjs`: bounded page count and source strategy evidence
- `lib/crawler-adapters/index.mjs`: Yonsei UIC detail URL strategy
- `app/admin/review/scholarships/[id]`: graph evidence, event history, legacy comparison, and controlled preview
- `app/admin/crawler-review`: report-backed diagnostics plus honest L DB-backed run state when available
- `app/admin/crawled-notices/actions.ts`: L-only append-event lifecycle and hidden scholarship enforcement
- `supabase/post-phase-l/`: compatibility baseline, graph/review schema, pilot seed, and rollback files
- `supabase/post-phase-l/verify_post_phase_l_schema.sql`: post-apply read-only object, RLS, seed, and leakage checks

## K convergence result

| Capability | K decision | Canonical owner | Pre-apply evidence | Remaining runtime evidence |
| --- | --- | --- | --- | --- |
| Ingestion runner | merge | main runner | bounded fixture and syntax | live bounded run |
| Exact source resolution | port | L resolver plus DB exact query | positive and negative tests | target readback |
| Source adapters | merge | main adapter registry | Yonsei UIC URL/pagination tests | live parser result |
| URL aliases | port | normalized graph | canonicalization and alias plan | redirect readback |
| Normalized representation | merge | normalized graph | deterministic fixture | DB persistence |
| Attachment evidence | port | `ingestion_notice_assets` | metadata plan | live metadata |
| Body quality | port | revision evidence | quality-state fixture | live body evidence |
| Observability | merge | existing crawler diagnostics | source/type checks | authenticated DB view |
| Review state | merge | append-only review graph | immutable SQL and action code | runtime event/supersede |
| Public projection | merge | existing admin detail preview | fail-closed calculation | approved preview walkthrough |

The three source pilot proves one integration path only. It does not establish broad source coverage.

## Local validation at this checkpoint

- exact resolver/guard/graph/replay/revision/URL/adapter/review/rollback tests: 13/13
- TypeScript `--noEmit`: pass
- guarded ingest dry-run: pass, remote read/write false
- migration application: pending owner gate
- authenticated browser walkthrough: pending schema apply and test-admin bootstrap
- rollback/reapply rehearsal: pending owner gate

## Worktree preservation

The 43 preexisting modified report paths are recorded in `reports/post-phase-l-preexisting-worktree.json`. L generation uses new `post-phase-l-*` artifacts only. The shared modified report files are not edited or staged, and final staging must keep `preexisting_file_inclusion_count=0`.

The shared risk-register JSON was already modified before L. L therefore records its machine-readable risk delta in `reports/post-phase-l-risk-register-update.json` and does not overwrite the protected file.
