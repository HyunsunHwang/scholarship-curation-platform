\set ON_ERROR_STOP on

begin transaction read only;
set local statement_timeout = '90s';
set local lock_timeout = '5s';
set local idle_in_transaction_session_timeout = '120s';

with
schemas as (
  select jsonb_agg(
    jsonb_build_object('name', nspname)
    order by nspname
  ) as value
  from pg_namespace
  where nspname not like 'pg_%'
    and nspname <> 'information_schema'
),
tables as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'name', c.relname,
      'rls_enabled', c.relrowsecurity,
      'row_security_forced', c.relforcerowsecurity,
      'estimated_rows', greatest(c.reltuples::bigint, 0)
    )
    order by n.nspname, c.relname
  ) as value
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p')
    and n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
),
columns as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', table_schema,
      'table', table_name,
      'name', column_name,
      'ordinal_position', ordinal_position,
      'data_type', data_type,
      'udt_name', udt_name,
      'nullable', is_nullable = 'YES',
      'default', column_default
    )
    order by table_schema, table_name, ordinal_position
  ) as value
  from information_schema.columns
  where table_schema not like 'pg_%'
    and table_schema <> 'information_schema'
),
constraints as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', con.conname,
      'type', con.contype,
      'definition', pg_get_constraintdef(con.oid, true)
    )
    order by n.nspname, c.relname, con.conname
  ) as value
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
),
indexes as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'name', indexname,
      'definition', indexdef
    )
    order by schemaname, tablename, indexname
  ) as value
  from pg_indexes
  where schemaname not like 'pg_%'
    and schemaname <> 'information_schema'
),
policies as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', schemaname,
      'table', tablename,
      'name', policyname,
      'permissive', permissive,
      'roles', roles,
      'command', cmd,
      'using', qual,
      'check', with_check
    )
    order by schemaname, tablename, policyname
  ) as value
  from pg_policies
  where schemaname not like 'pg_%'
),
grants as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', table_schema,
      'table', table_name,
      'grantee', grantee,
      'privilege', privilege_type,
      'grantable', is_grantable = 'YES'
    )
    order by table_schema, table_name, grantee, privilege_type
  ) as value
  from information_schema.role_table_grants
  where table_schema not like 'pg_%'
    and table_schema <> 'information_schema'
),
functions as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'name', p.proname,
      'signature', pg_get_function_identity_arguments(p.oid),
      'result', pg_get_function_result(p.oid),
      'language', l.lanname,
      'security_definer', p.prosecdef,
      'volatility', p.provolatile,
      'definition_hash', md5(pg_get_functiondef(p.oid)),
      'definition_hash_algorithm', 'md5_builtin'
    )
    order by n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
  ) as value
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_language l on l.oid = p.prolang
  where n.nspname not like 'pg_%'
    and n.nspname <> 'information_schema'
    and p.prokind in ('f', 'p', 'w')
),
triggers as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', n.nspname,
      'table', c.relname,
      'name', t.tgname,
      'definition', pg_get_triggerdef(t.oid, true)
    )
    order by n.nspname, c.relname, t.tgname
  ) as value
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where not t.tgisinternal
    and n.nspname not like 'pg_%'
),
views as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', schemaname,
      'name', viewname,
      'definition_hash', md5(definition),
      'definition_hash_algorithm', 'md5_builtin'
    )
    order by schemaname, viewname
  ) as value
  from pg_views
  where schemaname not like 'pg_%'
    and schemaname <> 'information_schema'
),
materialized_views as (
  select jsonb_agg(
    jsonb_build_object(
      'schema', schemaname,
      'name', matviewname,
      'definition_hash', md5(definition),
      'definition_hash_algorithm', 'md5_builtin'
    )
    order by schemaname, matviewname
  ) as value
  from pg_matviews
  where schemaname not like 'pg_%'
)
select jsonb_pretty(jsonb_build_object(
  'schema_version', 'post-phase-n-fingerprint/v1',
  'generated_at', clock_timestamp(),
  'evidence', jsonb_build_object(
    'evidence_kind', 'database_production_read_only',
    'environment', 'production',
    'bounded_scope', 'schema-agnostic catalog metadata; optional aggregates are runner-gated',
    'limitations', jsonb_build_array(
      'This output contains no row bodies.',
      'estimated_rows comes from pg_class statistics and is not an exact count.',
      'Optional migration metadata and state distributions are queried only after catalog checks.'
    )
  ),
  'objects', jsonb_build_object(
    'schemas', coalesce(schemas.value, '[]'::jsonb),
    'tables', coalesce(tables.value, '[]'::jsonb),
    'columns', coalesce(columns.value, '[]'::jsonb),
    'constraints', coalesce(constraints.value, '[]'::jsonb),
    'indexes', coalesce(indexes.value, '[]'::jsonb),
    'policies', coalesce(policies.value, '[]'::jsonb),
    'grants', coalesce(grants.value, '[]'::jsonb),
    'functions', coalesce(functions.value, '[]'::jsonb),
    'triggers', coalesce(triggers.value, '[]'::jsonb),
    'views', coalesce(views.value, '[]'::jsonb),
    'materialized_views', coalesce(materialized_views.value, '[]'::jsonb)
  ),
  'migration_metadata', jsonb_build_object(
    'status', 'pending_runner_catalog_check',
    'items', jsonb_build_array()
  ),
  'aggregates', jsonb_build_object(
    'selected_state_distributions', jsonb_build_array()
  ),
  'safety', jsonb_build_object(
    'transaction_read_only', current_setting('transaction_read_only')::boolean,
    'ddl_performed', false,
    'dml_performed', false,
    'row_body_dumped', false
  )
))
from schemas, tables, columns, constraints, indexes, policies, grants,
  functions, triggers, views, materialized_views;

rollback;
