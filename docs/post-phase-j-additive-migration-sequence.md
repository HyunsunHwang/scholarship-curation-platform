# Post-Phase J Additive Migration Sequence

No SQL is created by this plan. Each work unit requires the stated gate and separate human approval.

## J-M0 Target schema inventory gate

Prerequisites: authorized read-only sanitized inventory. Allowed: collect metadata only. Prohibited: row contents, credentials, writes, migrations. Validate table/column/constraint/index/RLS/migration-history/schema-cache evidence and schema fingerprint. Rollback: discard inventory artifact if redaction fails. Success: implementation inputs are complete; missing evidence blocks progression.

Authorized operator SQL, not executed by J:

```sql
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
select table_name, column_name, data_type, is_nullable
from information_schema.columns where table_schema = 'public'
order by table_name, ordinal_position;
select conrelid::regclass::text as table_name, conname, contype
from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2;
select tablename, indexname, indexdef from pg_indexes
where schemaname = 'public' order by tablename, indexname;
select schemaname, tablename, policyname, cmd, roles
from pg_policies where schemaname = 'public' order by tablename, policyname;
select relname as table_name, n_live_tup::bigint as approximate_row_count
from pg_stat_user_tables where schemaname = 'public' order by relname;
select version, name from supabase_migrations.schema_migrations order by version;
```

## J-M1 Additive graph foundation

Prerequisites: J-M0 complete and final table-name/RLS review. Allowed: additive graph, review event, evidence, asset metadata, constraints, and indexes only. Prohibited: legacy mutation, drop, rename, incompatible conversion, public projection activation. Validate DDL review, FK/unique/index plan, RLS policy review, and empty-table rollback. Rollback: disable new writers and retain legacy data. Approval: schema owner and security/RLS owner.

## J-M2 Read-only compatibility adapter

Prerequisites: J-M1 approved implementation and representative non-production graph records. Allowed: graph-to-existing-read-model comparison with no legacy writes. Prohibited: replacement view while writers remain, dual-write. Validate deterministic rows, source resolution, counts, status parity, and exception reporting. Rollback: disable adapter read path. Approval: review and operations owners.

## J-M3 Bounded backfill rehearsal

Prerequisites: J-M2 comparison is accepted and exception classes are triaged. Allowed: limited non-production dry-run, then bounded apply under an idempotency key. Prohibited: production apply, unbounded writes, fuzzy mapping, fabricated history. Validate row counts, source identity, revision/asset idempotency, public-ID preservation, and reconciliation. Rollback: scoped audit-key rollback or disable graph records without deleting original legacy evidence. Approval: data owner.

## J-M4 Consumer cutover rehearsal

Prerequisites: J-M3 reconciliation passes. Allowed: non-production read consumer shadow/compare rehearsal. Prohibited: disabling legacy reads/writes or replacing `crawled_notices`. Validate queue ordering, statuses, reviewer evidence, and fallback. Rollback: restore legacy reader configuration. Approval: admin product owner.

## J-M5 Public projection integration

Prerequisites: effective-review projection is proven and public reconciliation is approved. Allowed: design then separately approved implementation that maps approved events to existing `scholarships` rows. Prohibited: numeric ID change, route change, automatic approval, duplicate public row. Validate projection mapping uniqueness, public list/detail parity, and replay. Rollback: stop projection writer and serve existing `scholarships` state. Approval: public product and data owners.

## J-M6 Legacy write retirement

Future only. Requires all writers migrated, completed replay/reconciliation, retention decision, and separate approval. Rollback retains legacy reads and archived auditable evidence.

## J-M7 Optional legacy replacement

Future only. No view replacement, drop, or destructive action until all readers/writers are proven migrated and recovery rehearsal is accepted.
