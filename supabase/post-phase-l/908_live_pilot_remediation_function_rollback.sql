-- Bounded rollback for migration 008 functions only.
-- Preserves all jobs, runs, results, routing decisions, and prior failed-pilot evidence.
begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
end
$$;

drop function if exists public.record_notice_analysis_run_audit(uuid, text, jsonb);
drop function if exists public.renew_notice_analysis_job_lease(uuid, text, integer);

commit;
