-- Live-pilot remediation: failed-run audit and bounded lease renewal.
-- Additive only. Depends on 001 through 007 and never schedules a worker.
begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
  if to_regclass('public.notice_analysis_runs') is null
     or to_regprocedure(
       'public.finalize_notice_analysis_routing(uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,uuid,uuid)'
     ) is null then
    raise exception 'Post-Phase L migrations 001 through 007 are required';
  end if;
end
$$;

create or replace function public.renew_notice_analysis_job_lease(
  p_job_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns public.notice_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.notice_analysis_jobs;
  bounded_seconds integer := least(greatest(coalesce(p_lease_seconds, 180), 60), 600);
begin
  update public.notice_analysis_jobs
  set status = 'running',
      lease_expires_at = greatest(
        lease_expires_at,
        now() + make_interval(secs => bounded_seconds)
      ),
      updated_at = now()
  where id = p_job_id
    and leased_by = p_worker_id
    and status in ('leased', 'running')
    and lease_expires_at is not null
    and lease_expires_at > now()
  returning * into job_row;

  if job_row.id is null then
    raise exception 'renew_notice_analysis_job_lease_rejected';
  end if;
  return job_row;
end
$$;

create or replace function public.record_notice_analysis_run_audit(
  p_job_id uuid,
  p_worker_id text,
  p_run jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.notice_analysis_jobs;
  existing_run public.notice_analysis_runs;
  run_id uuid := nullif(p_run->>'id', '')::uuid;
  run_role_value text := p_run->>'run_role';
  safe_metadata jsonb;
  inserted_count integer := 0;
  error_code_value text;
  error_message_value text;
begin
  select * into job_row
  from public.notice_analysis_jobs
  where id = p_job_id
  for update;

  if job_row.id is null
     or job_row.leased_by is distinct from p_worker_id
     or job_row.status not in ('leased', 'running')
     or job_row.lease_expires_at is null
     or job_row.lease_expires_at <= now() then
    raise exception 'record_notice_analysis_run_audit_rejected_lease';
  end if;

  if run_id is null
     or p_run->>'job_id' is distinct from p_job_id::text
     or (p_run->>'attempt_number')::integer is distinct from job_row.attempt_count
     or run_role_value not in ('baseline', 'economy', 'escalation')
     or p_run->>'status' not in ('succeeded', 'retryable_failed', 'terminal_failed')
     or (
       (p_run->>'status' = 'succeeded' and p_run->>'validation_status' <> 'validated')
       or
       (p_run->>'status' <> 'succeeded' and p_run->>'validation_status' not in (
         'not_validated', 'json_invalid', 'schema_invalid', 'semantic_invalid', 'evidence_invalid'
       ))
     )
     or coalesce(p_run->'raw_response', 'null'::jsonb) <> 'null'::jsonb then
    raise exception 'record_notice_analysis_run_audit_rejected_contract';
  end if;

  safe_metadata := jsonb_build_object(
    'mode', left(coalesce(p_run->'metadata'->>'mode', 'unknown'), 40),
    'run_key', left(coalesce(p_run->'metadata'->>'run_key', run_role_value), 40),
    'diagnostics', coalesce(p_run->'metadata'->'diagnostics', '{}'::jsonb)
  );
  error_code_value := case
    when p_run->>'status' = 'succeeded' then null
    else left(coalesce(p_run->>'error_code', 'analysis_failed'), 120)
  end;
  error_message_value := case
    when p_run->>'status' = 'succeeded' then null
    else left(coalesce(p_run->>'error_message', 'analysis failed'), 500)
  end;

  insert into public.notice_analysis_runs (
    id, job_id, attempt_number, run_role, provider, model, request_id, status,
    started_at, finished_at, latency_ms, input_token_count, output_token_count,
    cached_input_token_count, estimated_cost_micros, currency_code,
    prompt_version, schema_version, input_fingerprint, response_fingerprint,
    validation_status, error_code, error_message, raw_response_retention_until,
    raw_response, metadata, created_at
  ) values (
    run_id, p_job_id, (p_run->>'attempt_number')::integer, run_role_value,
    p_run->>'provider', p_run->>'model', nullif(p_run->>'request_id', ''),
    p_run->>'status', (p_run->>'started_at')::timestamptz,
    (p_run->>'finished_at')::timestamptz, nullif(p_run->>'latency_ms', '')::integer,
    nullif(p_run->>'input_token_count', '')::integer,
    nullif(p_run->>'output_token_count', '')::integer,
    nullif(p_run->>'cached_input_token_count', '')::integer,
    nullif(p_run->>'estimated_cost_micros', '')::bigint,
    coalesce(nullif(p_run->>'currency_code', ''), 'USD'),
    p_run->>'prompt_version', p_run->>'schema_version',
    p_run->>'input_fingerprint', nullif(p_run->>'response_fingerprint', ''),
    p_run->>'validation_status', error_code_value, error_message_value,
    null, null, safe_metadata,
    coalesce((p_run->>'created_at')::timestamptz, now())
  )
  on conflict (job_id, attempt_number, run_role) do nothing;
  get diagnostics inserted_count = row_count;

  select * into existing_run
  from public.notice_analysis_runs
  where job_id = p_job_id
    and attempt_number = (p_run->>'attempt_number')::integer
    and run_role = run_role_value;

  if existing_run.id is distinct from run_id
     or existing_run.status is distinct from p_run->>'status'
     or existing_run.response_fingerprint is distinct from
       nullif(p_run->>'response_fingerprint', '')
     or existing_run.error_code is distinct from error_code_value then
    raise exception 'failed_run_audit_conflict';
  end if;

  return jsonb_build_object(
    'replayed', inserted_count = 0,
    'job_id', p_job_id,
    'run_id', existing_run.id,
    'run_role', existing_run.run_role,
    'status', existing_run.status
  );
end
$$;

revoke all on function public.renew_notice_analysis_job_lease(
  uuid, text, integer
) from public, anon, authenticated;
grant execute on function public.renew_notice_analysis_job_lease(
  uuid, text, integer
) to service_role;

revoke all on function public.record_notice_analysis_run_audit(
  uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_notice_analysis_run_audit(
  uuid, text, jsonb
) to service_role;

commit;
