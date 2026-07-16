-- Read-only verification immediately after 999 and before reapplying 002.
-- Run only in scholarship-curation-post-phase-l.

begin transaction read only;

select public.post_phase_l_assert_environment();

with compatibility_relations(name) as (
  values
    ('profiles'),
    ('scholarships'),
    ('scholarship_selection_stages'),
    ('notice_sources'),
    ('crawled_notices'),
    ('site_settings')
), graph_relations(name) as (
  values
    ('ingestion_crawl_runs'),
    ('ingestion_source_run_results'),
    ('ingestion_notices'),
    ('ingestion_notice_url_aliases'),
    ('ingestion_notice_occurrences'),
    ('ingestion_notice_revisions'),
    ('ingestion_notice_assets'),
    ('review_items'),
    ('review_decision_events'),
    ('review_effective_decisions'),
    ('review_evidence_references')
)
select
  (select count(*) from compatibility_relations
    where to_regclass(format('public.%I', name)) is not null) as compatibility_table_count,
  (select count(*) from graph_relations
    where to_regclass(format('public.%I', name)) is not null) as remaining_graph_table_count,
  exists (
    select 1
    from public.post_phase_l_environment_guard
    where id = 1
      and project_ref = 'hrayfvdggbhfmmzfblly'
      and environment_kind = 'non_production'
      and automatic_public_publish_enabled = false
  ) as environment_guard_preserved,
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'post_phase_l_environment_guard'
      and t.tgname = 'post_phase_l_environment_guard_immutable'
      and not t.tgisinternal
  ) as environment_guard_immutable,
  to_regprocedure('public.post_phase_l_rollback_run(uuid,text)') is null
    as graph_rollback_rpc_removed,
  to_regprocedure(
    'public.post_phase_l_apply_legacy_review_decision(bigint,text,text,text,bigint)'
  ) is null as graph_review_rpc_removed;

rollback;
