-- Read-only verification for analysis migrations 004 through 007.
-- Run only after verify_post_phase_l_schema.sql on the exact L sandbox.
begin transaction read only;

select
  project_ref = 'hrayfvdggbhfmmzfblly' as exact_project_ref,
  environment_kind = 'non_production' as non_production,
  automatic_publication_enabled = false as automatic_publication_disabled
from public.post_phase_l_environment_guard
where singleton = 1;

with required(name) as (
  values
    ('notice_analysis_jobs'),
    ('notice_analysis_runs'),
    ('notice_analysis_results'),
    ('notice_analysis_evidence'),
    ('notice_analysis_review_events'),
    ('scholarship_programs'),
    ('scholarship_cycles'),
    ('scholarship_program_cycle_proposals'),
    ('scholarship_proposal_review_events'),
    ('scholarship_projection_links'),
    ('notice_analysis_routing_decisions')
)
select name, to_regclass('public.' || name) is not null as present
from required
order by name;

select
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notice_analysis_runs'
      and column_name = 'run_role'
  ) as run_role_present,
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'notice_analysis_jobs'
      and column_name = 'status'
      and udt_name = 'text'
  ) as analysis_job_status_present,
  exists (
    select 1 from pg_constraint
    where conrelid = 'public.notice_analysis_jobs'::regclass
      and pg_get_constraintdef(oid) like '%budget_deferred%'
  ) as budget_deferred_allowed;

with required(signature) as (
  values
    ('claim_notice_analysis_jobs(text,integer,integer)'),
    ('finalize_notice_analysis_success(uuid,text,jsonb,jsonb,jsonb)'),
    ('finalize_notice_analysis_routing(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid)'),
    ('defer_notice_analysis_job_for_budget(uuid,text,jsonb,text,bigint)'),
    ('record_notice_analysis_run_audit(uuid,text,jsonb)'),
    ('renew_notice_analysis_job_lease(uuid,text,integer)'),
    ('record_notice_analysis_review(uuid,text,jsonb,text,text)'),
    ('approve_scholarship_program_cycle_proposal(uuid,text,uuid,uuid,jsonb,jsonb,text,text)')
)
select signature, to_regprocedure('public.' || signature) is not null as present
from required
order by signature;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  not has_table_privilege('anon', c.oid, 'INSERT,UPDATE,DELETE') as anon_write_blocked,
  not has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE')
    as authenticated_direct_write_blocked
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'notice_analysis_jobs',
    'notice_analysis_runs',
    'notice_analysis_results',
    'notice_analysis_evidence',
    'notice_analysis_review_events',
    'notice_analysis_routing_decisions',
    'scholarship_programs',
    'scholarship_cycles',
    'scholarship_program_cycle_proposals',
    'scholarship_proposal_review_events',
    'scholarship_projection_links'
  )
order by c.relname;

select
  has_table_privilege('service_role', 'public.notice_analysis_jobs', 'INSERT,UPDATE')
    as service_role_job_write,
  has_table_privilege('service_role', 'public.notice_analysis_routing_decisions', 'INSERT')
    as service_role_routing_write,
  not has_function_privilege(
    'public',
    'public.finalize_notice_analysis_routing(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid)',
    'EXECUTE'
  ) as public_finalize_execute_revoked,
  not has_function_privilege(
    'anon',
    'public.finalize_notice_analysis_routing(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid)',
    'EXECUTE'
  ) as anon_finalize_execute_revoked;

rollback;
