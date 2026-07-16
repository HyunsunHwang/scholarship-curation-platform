-- Destructive only inside the dedicated L project after explicit owner approval.
-- Compatibility baseline tables and the immutable environment guard are preserved.

begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
  if current_setting('post_phase_l.schema_rollback_confirmation', true)
     <> 'ROLLBACK_POST_PHASE_L_SCHEMA' then
    raise exception 'Set post_phase_l.schema_rollback_confirmation before schema rollback';
  end if;
end
$$;

create temporary table post_phase_l_schema_rollback_baseline_counts (
  table_name text primary key,
  row_count bigint not null
) on commit drop;

insert into post_phase_l_schema_rollback_baseline_counts (table_name, row_count)
select 'profiles', count(*) from public.profiles
union all select 'scholarships', count(*) from public.scholarships
union all select 'scholarship_selection_stages', count(*) from public.scholarship_selection_stages
union all select 'notice_sources', count(*) from public.notice_sources
union all select 'crawled_notices', count(*) from public.crawled_notices
union all select 'site_settings', count(*) from public.site_settings
union all select 'post_phase_l_environment_guard', count(*) from public.post_phase_l_environment_guard;

drop function if exists public.post_phase_l_rollback_run(uuid, text);
drop function if exists public.post_phase_l_apply_legacy_review_decision(bigint, text, text, text, bigint);
drop table if exists public.review_evidence_references;
drop table if exists public.review_effective_decisions;
drop table if exists public.review_decision_events;
drop table if exists public.review_items;
drop table if exists public.ingestion_notice_assets;
drop table if exists public.ingestion_notice_revisions;
drop table if exists public.ingestion_notice_occurrences;
drop table if exists public.ingestion_notice_url_aliases;
drop table if exists public.ingestion_notices;
drop table if exists public.ingestion_source_run_results;
drop table if exists public.ingestion_crawl_runs;
drop function if exists public.post_phase_l_sync_effective_decision();
drop function if exists public.post_phase_l_block_immutable_change();
drop function if exists public.post_phase_l_assign_revision_ordinal();
drop function if exists public.post_phase_l_preserve_notice_replay_metadata();
drop function if exists public.post_phase_l_preserve_alias_replay_metadata();
drop function if exists public.post_phase_l_preserve_review_state_on_ingest();

do $$
declare
  baseline record;
  current_count bigint;
  unrelated_change_count integer := 0;
begin
  for baseline in
    select table_name, row_count
    from post_phase_l_schema_rollback_baseline_counts
    order by table_name
  loop
    execute format('select count(*) from public.%I', baseline.table_name)
      into current_count;
    if current_count is distinct from baseline.row_count then
      unrelated_change_count := unrelated_change_count + 1;
    end if;
  end loop;

  if unrelated_change_count <> 0 then
    raise exception 'Schema rollback changed % compatibility baseline tables',
      unrelated_change_count;
  end if;
end
$$;

with graph_relations(name) as (
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
), compatibility_relations(name) as (
  values
    ('profiles'),
    ('scholarships'),
    ('scholarship_selection_stages'),
    ('notice_sources'),
    ('crawled_notices'),
    ('site_settings')
)
select
  count(*) filter (
    where to_regclass(format('public.%I', graph_relations.name)) is not null
  ) = 0 as graph_review_tables_removed,
  (
    select count(*) = 6
    from compatibility_relations
    where to_regclass(format('public.%I', compatibility_relations.name)) is not null
  ) as compatibility_baseline_preserved,
  exists (
    select 1
    from public.post_phase_l_environment_guard
    where id = 1
      and project_ref = 'hrayfvdggbhfmmzfblly'
      and environment_kind = 'non_production'
      and automatic_public_publish_enabled = false
  ) as environment_guard_preserved,
  0::integer as unrelated_table_change_count
from graph_relations;

commit;
