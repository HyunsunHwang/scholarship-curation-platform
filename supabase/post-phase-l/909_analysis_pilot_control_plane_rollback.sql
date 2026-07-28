-- Bounded rollback for migration 009 only. Apply manually in the approved sandbox.
begin;
select public.post_phase_l_assert_environment();

drop function if exists public.approve_notice_analysis_pilot_expansion(uuid);
drop function if exists public.finish_notice_analysis_pilot_member(uuid,uuid,text,text);
drop function if exists public.record_notice_analysis_provider_usage(uuid,uuid,text,jsonb);
drop function if exists public.reserve_notice_analysis_pilot_cost(uuid,uuid,text,integer,text,bigint);
drop function if exists public.claim_notice_analysis_pilot_job(uuid,text,text,integer);
drop function if exists public.create_or_register_notice_analysis_pilot_run(jsonb,jsonb);
drop table if exists public.notice_analysis_provider_usage_receipts;
drop table if exists public.notice_analysis_pilot_cost_reservations;
drop table if exists public.notice_analysis_pilot_run_jobs;
drop table if exists public.notice_analysis_pilot_runs;
drop function if exists public.notice_analysis_pilot_membership_immutable();

commit;
