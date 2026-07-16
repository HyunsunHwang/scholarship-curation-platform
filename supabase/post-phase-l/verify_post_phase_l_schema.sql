-- Read-only verification for scholarship-curation-post-phase-l.
-- Run only after 001, 002, and 003 in the dedicated non-production project.

begin transaction read only;

select public.post_phase_l_assert_environment();

select
  project_ref,
  environment_kind,
  automatic_public_publish_enabled
from public.post_phase_l_environment_guard
where id = 1;

select
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as trigger_definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'post_phase_l_environment_guard'
  and t.tgname = 'post_phase_l_environment_guard_immutable'
  and not t.tgisinternal;

with expected(name) as (
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
select e.name, to_regclass(format('public.%I', e.name)) is not null as exists
from expected e
order by e.name;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'notice_sources',
    'crawled_notices',
    'scholarships',
    'ingestion_crawl_runs',
    'ingestion_source_run_results',
    'ingestion_notices',
    'ingestion_notice_url_aliases',
    'ingestion_notice_occurrences',
    'ingestion_notice_revisions',
    'ingestion_notice_assets',
    'review_items',
    'review_decision_events',
    'review_effective_decisions',
    'review_evidence_references'
  )
order by c.relname;

select source_id, id, org_unit_id, enabled
from public.notice_sources
where source_id in ('cau_001', 'cau_002', 'yonsei_060')
order by source_id;

select count(*) as pilot_source_count
from public.notice_sources
where source_id in ('cau_001', 'cau_002', 'yonsei_060');

select count(*) as public_leakage_count
from public.scholarships
where is_verified = true or list_on_home = true;

select count(*) as legacy_compatibility_row_count
from public.crawled_notices;

rollback;
