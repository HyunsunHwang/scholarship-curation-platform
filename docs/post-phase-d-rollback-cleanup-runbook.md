# Post-Phase D Rollback Cleanup Dry-run Runbook

## Purpose

Post-Phase D defines a read-only rollback scope and cleanup dry-run workflow for crawler ingest results.

This runbook does not authorize data deletion, cleanup SQL, DB writes, migrations, guarded apply changes, or production/main Supabase access.

The goal is to prove that a cleanup scope can be identified from fixture/evidence inputs and that ambiguous states fail closed before any destructive phase.

## Rollback Scope Selector Priority

Preferred primary selectors:

1. `rehearsal_label`
2. `batch_id`
3. `run_id`

Secondary evidence:

- `source_id`
- `source_key`
- `canonical_key`
- notice, occurrence, URL alias, asset, target, and keyword match identifiers
- created/updated timestamps

`source_id`, `source_key`, `canonical_key`, and timestamps must not be used alone as cleanup authority. They are evidence for reconciliation and manual review, not standalone destructive selectors.

## Count-only Dry-run Procedure

1. Prepare a local JSON evidence fixture.
2. Run `node scripts/plan-crawler-rollback-scope.mjs --input <fixture>`.
3. Review `scope`, `identifier_assessment`, and `source_resolution`.
4. Review `table_impacts` as estimated fixture counts only.
5. Review `shared_record_risks`, `orphan_risks`, and `partial_write_findings`.
6. Confirm `read_only=true`, `db_access=false`, `db_write=false`, `cleanup_execution=false`, and `sql_generation=false`.
7. Treat any `blocked_reasons` or `manual_review_required` entry as a stop condition for automation.

## Table and Entity Review Order

1. Source context: confirm `source_key` resolves exactly to `notice_sources.source_id`.
2. Crawler run and source result evidence: confirm run/batch ownership.
3. Canonical notice: confirm newly-created vs pre-existing ownership.
4. Occurrences: confirm every occurrence has an in-scope notice.
5. URL aliases: confirm aliases are not shared with out-of-scope notices.
6. Assets: confirm assets are not shared and have an in-scope owner.
7. Targets and keyword matches: confirm relations do not point outside scope.
8. Error/audit records: preserve as evidence; do not treat them as destructive targets.

## Shared Reference Checks

Stop and require manual review when:

- one canonical notice has out-of-scope occurrences,
- one URL alias points to an out-of-scope notice,
- one asset is reused by another notice,
- target or keyword relations point to out-of-scope records,
- a source row itself is being treated as a cleanup target,
- canonical ownership is inferred only from key equality.

## Orphan Checks

Stop and require manual review when:

- occurrence exists without an in-scope notice,
- URL alias exists without an in-scope owner notice,
- asset relation exists without an in-scope notice or occurrence,
- target or keyword relation exists without an owner notice,
- source result says success but expected child evidence is missing.

## Partial Write Branches

Classify and stop when:

- notice exists but occurrence is missing,
- occurrence exists but notice is missing,
- alias or asset relation remains without owner evidence,
- source result success count does not match expected child records,
- only part of a multi-source batch appears in evidence,
- pre-existing and newly-created records are mixed under one canonical key.

## Stop Conditions

The planner must fail closed for:

- missing rollback identifier,
- ambiguous identifier,
- source resolution failure,
- unclear canonical ownership,
- pre-existing/newly-created ownership ambiguity,
- shared reference,
- orphan risk,
- partial write state,
- unknown entity/table,
- schema validation failure,
- any conclusion that would require live DB state inference.

## Manual Approval Conditions

Manual review is required before any later destructive phase if:

- any blocked reason is present,
- estimated affected counts are zero or inconsistent,
- a shared/orphan/partial pattern is present,
- source identity is unresolved or ambiguous,
- the evidence does not distinguish pre-existing rows from newly-created rows.

## Production/Main Prohibitions

This phase prohibits:

- production/main Supabase access,
- personal-dev Supabase access,
- DB insert/update/delete,
- cleanup SQL generation or execution,
- migration generation or execution,
- `lib/database.types.ts` changes,
- `app/admin` or product UI changes,
- guarded apply changes,
- GitHub Actions operational workflow changes.

## Before Any Destructive Cleanup Phase

A later destructive phase would need a separate team-approved plan with:

- DB-backed count-only verification,
- immutable apply ownership evidence,
- table-by-table rollback contract,
- peer-reviewed SQL or API execution path,
- backup and restore plan,
- audit logging,
- dry-run/execute separation,
- explicit approval gates.

## What This Phase Proves

- Local fixture input can produce a deterministic rollback scope dry-run.
- Estimated table/entity impacts can be summarized without DB access.
- Missing, ambiguous, shared, orphan, and partial-write patterns fail closed.
- Source rows are context, not default cleanup targets.

## What This Phase Does Not Prove

- It does not prove production cleanup readiness.
- It does not verify live DB row counts.
- It does not approve destructive cleanup.
- It does not validate all historical personal-dev apply results.
- It does not replace team review or schema/UI integration approval.
