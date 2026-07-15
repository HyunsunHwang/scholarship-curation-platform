# Post-Phase L Baseline and Migration Decision

## Decision

Post-Phase L uses strategy B: a sanitized, L-only application compatibility baseline followed by the additive normalized ingestion and review graph. The files live under `supabase/post-phase-l/` so the incomplete committed migration history is not presented as a replayable production chain.

Historical migrations under `supabase/migrations/` remain unchanged. The baseline is not a production migration and does not claim full production parity.

## Authoritative evidence

`docs/post-phase-l-schema-inventory.json` is the authoritative sanitized inventory. Its repository copy is byte-identical to the owner-provided source and has SHA-256 `97602a9649fcb8ccd9ab93b9c06402d03a07fc8e1f4a50852cd8f39cff290406`.

The inventory confirms 57 applied migrations, 24 public tables, no public views, the unique `notice_sources.source_id` boundary, the legacy `crawled_notices.notice_url` uniqueness boundary, the existing review status values, RLS, functions, enums, and all three pilot identities. Its `governance_status` values are historical extraction state and are superseded by the current owner decisions.

## Why the committed chain is not replayed

The repository has 10 committed migration files. The earliest committed `notice_sources` migration depends on `org_units` and `is_admin()`, neither of which is created earlier in that chain. Generated application types also describe product objects that are absent from the committed chain. Replaying it into a fresh project would therefore neither build the current application baseline nor reproduce the 57-migration target history.

## Apply order

1. `supabase/post-phase-l/001_post_phase_l_compatibility_baseline.sql`
2. `supabase/post-phase-l/002_post_phase_l_normalized_graph.sql`
3. `supabase/post-phase-l/003_post_phase_l_pilot_seed.sql`

The first file creates only the minimum product/admin compatibility required by the L pilot. The second adds J-named graph and review entities. The third seeds only `cau_001`, `cau_002`, and `yonsei_060` plus their minimal org-unit references.

The schema files are written before the owner gate but are not applied before that gate. This workstation has no `psql` or Supabase CLI executable, so the approved first apply requires the L project SQL Editor unless a separately authorized connection method is provided.

After the three apply files, `supabase/post-phase-l/verify_post_phase_l_schema.sql` is the read-only SQL Editor verification step. It checks the environment guard, required graph objects, RLS, the exact three-source seed, and zero public leakage without mutating data.

## Release and recovery ownership

- Migration and release owner: 고지석
- Backup/export owner: 고지석
- Allowed target: `scholarship-curation-post-phase-l` (`hrayfvdggbhfmmzfblly`)
- Automatic GitHub deployment: disabled
- Production action: not authorized

## Rollback boundary

`post_phase_l_rollback_run` removes only one isolated run, graph rows that have no observations outside that run, and linked `new`/unpromoted compatibility rows. The compatibility baseline is preserved. Full graph schema rollback is a separate, explicitly confirmed L-only file and is never part of normal apply order.
