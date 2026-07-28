-- Read-only verification for analysis migrations 004 through 009.
-- Run only after verify_post_phase_l_schema.sql on the exact L sandbox.
begin transaction read only;

select
  project_ref = 'hrayfvdggbhfmmzfblly' as exact_project_ref,
  environment_kind = 'non_production' as non_production,
  automatic_public_publish_enabled = false as automatic_publication_disabled
from public.post_phase_l_environment_guard
where id = 1;

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
    ('notice_analysis_routing_decisions'),
    ('notice_analysis_pilot_runs'),
    ('notice_analysis_pilot_run_jobs'),
    ('notice_analysis_provider_usage_receipts'),
    ('notice_analysis_pilot_cost_reservations')
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
    ('create_or_register_notice_analysis_pilot_run(jsonb,jsonb)'),
    ('notice_analysis_pilot_manifest_serialize(jsonb)'),
    ('notice_analysis_pilot_manifest_fingerprint(jsonb)'),
    ('notice_analysis_pilot_stored_manifest_fingerprint(uuid)'),
    ('claim_notice_analysis_pilot_job(uuid,text,text,integer)'),
    ('record_notice_analysis_provider_usage(uuid,uuid,text,jsonb)'),
    ('reserve_notice_analysis_pilot_cost(uuid,uuid,text,integer,text,bigint)'),
    ('finish_notice_analysis_pilot_member(uuid,uuid,text,text)'),
    ('approve_notice_analysis_pilot_expansion(uuid)'),
    ('record_notice_analysis_review(uuid,text,jsonb,text,text)'),
    ('approve_scholarship_program_cycle_proposal(uuid,text,uuid,uuid,jsonb,jsonb,text,text)')
)
select signature, to_regprocedure('public.' || signature) is not null as present
from required
order by signature;

select public.notice_analysis_pilot_manifest_fingerprint(
  $manifest$[
    {"execution_order":1,"stage":"smoke","job_id":"00000000-0000-4000-8000-000000000001","expected_revision_id":"10000000-0000-4000-8000-000000000001","expected_input_fingerprint":"1111111111111111111111111111111111111111111111111111111111111111"},
    {"execution_order":2,"stage":"expansion","job_id":"00000000-0000-4000-8000-000000000002","expected_revision_id":"10000000-0000-4000-8000-000000000002","expected_input_fingerprint":"2222222222222222222222222222222222222222222222222222222222222222"},
    {"execution_order":3,"stage":"expansion","job_id":"00000000-0000-4000-8000-000000000003","expected_revision_id":"10000000-0000-4000-8000-000000000003","expected_input_fingerprint":"3333333333333333333333333333333333333333333333333333333333333333"},
    {"execution_order":4,"stage":"expansion","job_id":"00000000-0000-4000-8000-000000000004","expected_revision_id":"10000000-0000-4000-8000-000000000004","expected_input_fingerprint":"4444444444444444444444444444444444444444444444444444444444444444"},
    {"execution_order":5,"stage":"expansion","job_id":"00000000-0000-4000-8000-000000000005","expected_revision_id":"10000000-0000-4000-8000-000000000005","expected_input_fingerprint":"5555555555555555555555555555555555555555555555555555555555555555"}
  ]$manifest$::jsonb
) = 'b116bb8ce8219b23609384da348d098f85a5e6730854e03c275c6de31c009f10'
  as pilot_manifest_golden_vector_match;

select
  pilot.id as pilot_run_id,
  public.notice_analysis_pilot_stored_manifest_fingerprint(pilot.id)
    = pilot.manifest_fingerprint as stored_manifest_fingerprint_match
from public.notice_analysis_pilot_runs pilot
order by pilot.created_at;

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
    'scholarship_projection_links',
    'notice_analysis_pilot_runs',
    'notice_analysis_pilot_run_jobs',
    'notice_analysis_provider_usage_receipts',
    'notice_analysis_pilot_cost_reservations'
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
  ) as anon_finalize_execute_revoked,
  has_function_privilege(
    'service_role',
    'public.claim_notice_analysis_pilot_job(uuid,text,text,integer)',
    'EXECUTE'
  ) as service_role_pilot_claim_execute,
  not has_function_privilege(
    'anon',
    'public.record_notice_analysis_provider_usage(uuid,uuid,text,jsonb)',
    'EXECUTE'
  ) as anon_usage_receipt_execute_revoked,
  not has_table_privilege(
    'service_role',
    'public.notice_analysis_pilot_run_jobs',
    'INSERT,UPDATE,DELETE'
  ) as service_role_pilot_membership_direct_write_blocked,
  not has_table_privilege(
    'service_role',
    'public.notice_analysis_provider_usage_receipts',
    'INSERT,UPDATE,DELETE'
  ) as service_role_usage_receipt_direct_write_blocked;

rollback;
