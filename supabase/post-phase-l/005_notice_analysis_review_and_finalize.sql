-- Unit 1: atomic validated analysis persistence and append-only semantic review.
-- Additive only. Depends on 004_notice_analysis_schema.sql.

begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
  if to_regclass('public.notice_analysis_jobs') is null then
    raise exception 'notice_analysis_jobs is required';
  end if;
end
$$;

create table if not exists public.notice_analysis_review_events (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.notice_analysis_results(id) on delete cascade,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  revision_id uuid not null references public.ingestion_notice_revisions(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id),
  decision text not null check (
    decision in ('approve', 'reject', 'needs_revision', 'reanalysis_requested')
  ),
  original_result_fingerprint text not null check (
    original_result_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  corrected_output jsonb,
  effective_output jsonb,
  correction_fingerprint text check (
    correction_fingerprint is null or correction_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  reason text,
  event_idempotency_key text not null,
  reviewed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (event_idempotency_key)
);

create index if not exists notice_analysis_review_events_result_idx
  on public.notice_analysis_review_events(result_id, reviewed_at desc);

create or replace function public.notice_analysis_block_review_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'notice_analysis_review_events is append-only';
end;
$$;

drop trigger if exists notice_analysis_review_events_append_only
on public.notice_analysis_review_events;
create trigger notice_analysis_review_events_append_only
before update or delete on public.notice_analysis_review_events
for each row execute function public.notice_analysis_block_review_event_mutation();

create or replace function public.finalize_notice_analysis_success(
  p_job_id uuid,
  p_worker_id text,
  p_run jsonb,
  p_result jsonb,
  p_evidence jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.notice_analysis_jobs;
  run_id uuid := (p_run->>'id')::uuid;
  result_id uuid := (p_result->>'id')::uuid;
  evidence_row jsonb;
  inserted_evidence integer := 0;
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
    raise exception 'finalize_notice_analysis_success_rejected_lease';
  end if;

  if p_run->>'job_id' is distinct from p_job_id::text
     or p_result->>'job_id' is distinct from p_job_id::text
     or p_result->>'notice_id' is distinct from job_row.notice_id::text
     or p_result->>'revision_id' is distinct from job_row.revision_id::text
     or p_result->>'run_id' is distinct from run_id::text then
    raise exception 'finalize_notice_analysis_success_rejected_lineage';
  end if;

  if p_run->>'status' <> 'succeeded'
     or p_run->>'validation_status' <> 'validated'
     or nullif(p_run->>'finished_at', '') is null
     or p_result->>'result_status' <> 'validated' then
    raise exception 'finalize_notice_analysis_success_rejected_validation';
  end if;

  insert into public.notice_analysis_runs (
    id, job_id, attempt_number, provider, model, request_id, status,
    started_at, finished_at, latency_ms, input_token_count, output_token_count,
    cached_input_token_count, estimated_cost_micros, currency_code,
    prompt_version, schema_version, input_fingerprint, response_fingerprint,
    validation_status, error_code, error_message, raw_response_retention_until,
    raw_response, metadata, created_at
  ) values (
    run_id, p_job_id, (p_run->>'attempt_number')::integer,
    p_run->>'provider', p_run->>'model', p_run->>'request_id', p_run->>'status',
    (p_run->>'started_at')::timestamptz, (p_run->>'finished_at')::timestamptz,
    (p_run->>'latency_ms')::integer, (p_run->>'input_token_count')::integer,
    (p_run->>'output_token_count')::integer,
    (p_run->>'cached_input_token_count')::integer,
    (p_run->>'estimated_cost_micros')::bigint,
    coalesce(p_run->>'currency_code', 'USD'),
    p_run->>'prompt_version', p_run->>'schema_version',
    p_run->>'input_fingerprint', p_run->>'response_fingerprint',
    p_run->>'validation_status', p_run->>'error_code', p_run->>'error_message',
    (p_run->>'raw_response_retention_until')::timestamptz,
    p_run->'raw_response', coalesce(p_run->'metadata', '{}'::jsonb),
    coalesce((p_run->>'created_at')::timestamptz, now())
  )
  on conflict (job_id, attempt_number) do nothing;

  insert into public.notice_analysis_results (
    id, job_id, run_id, notice_id, revision_id, result_status,
    analysis_schema_version, structured_result, result_fingerprint,
    validation_errors, confidence_summary, requires_human_review, created_at
  ) values (
    result_id, p_job_id, run_id, job_row.notice_id, job_row.revision_id,
    'validated', p_result->>'analysis_schema_version',
    p_result->'structured_result', p_result->>'result_fingerprint',
    coalesce(p_result->'validation_errors', '[]'::jsonb),
    coalesce(p_result->'confidence_summary', '{}'::jsonb),
    true, coalesce((p_result->>'created_at')::timestamptz, now())
  )
  on conflict (run_id) do nothing;

  for evidence_row in
    select value from jsonb_array_elements(coalesce(p_evidence, '[]'::jsonb))
  loop
    if evidence_row->>'result_id' is distinct from result_id::text
       or evidence_row->>'source_revision_id' is distinct from job_row.revision_id::text then
      raise exception 'finalize_notice_analysis_success_rejected_evidence_lineage';
    end if;
    insert into public.notice_analysis_evidence (
      id, result_id, field_path, evidence_kind, source_revision_id,
      source_asset_id, source_locator, quoted_text, normalized_value,
      confidence, evidence_fingerprint, created_at
    ) values (
      (evidence_row->>'id')::uuid, result_id, evidence_row->>'field_path',
      evidence_row->>'evidence_kind', job_row.revision_id,
      nullif(evidence_row->>'source_asset_id', '')::uuid,
      evidence_row->>'source_locator', evidence_row->>'quoted_text',
      evidence_row->'normalized_value', (evidence_row->>'confidence')::numeric,
      evidence_row->>'evidence_fingerprint',
      coalesce((evidence_row->>'created_at')::timestamptz, now())
    )
    on conflict (result_id, field_path, evidence_fingerprint) do nothing;
    inserted_evidence := inserted_evidence + 1;
  end loop;

  update public.notice_analysis_jobs
  set status = 'succeeded', completed_at = now(), updated_at = now(),
      leased_by = null, lease_expires_at = null
  where id = p_job_id;

  return jsonb_build_object(
    'job_id', p_job_id,
    'run_id', run_id,
    'result_id', result_id,
    'evidence_count', inserted_evidence,
    'status', 'succeeded'
  );
end;
$$;

create or replace function public.claim_notice_analysis_job_by_revision(
  p_revision_id uuid,
  p_worker_id text,
  p_lease_seconds integer default 300
)
returns public.notice_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.notice_analysis_jobs;
begin
  if coalesce(nullif(trim(p_worker_id), ''), '') = '' then
    raise exception 'worker_id_required';
  end if;
  update public.notice_analysis_jobs
  set status = 'leased', leased_by = p_worker_id, leased_at = now(),
      lease_expires_at = now() + make_interval(secs => greatest(p_lease_seconds, 30)),
      attempt_count = attempt_count + 1, updated_at = now()
  where id = (
    select id from public.notice_analysis_jobs
    where revision_id = p_revision_id
      and attempt_count < max_attempts
      and (
        (status in ('pending', 'retryable_failed') and available_at <= now())
        or (status in ('leased', 'running') and lease_expires_at <= now())
      )
    order by priority desc, created_at asc
    for update skip locked
    limit 1
  )
  returning * into row;
  if row.id is null then raise exception 'claimable_revision_job_not_found'; end if;
  return row;
end;
$$;

create or replace function public.record_notice_analysis_review(
  p_result_id uuid,
  p_decision text,
  p_corrected_output jsonb,
  p_reason text,
  p_event_idempotency_key text
)
returns public.notice_analysis_review_events
language plpgsql
security definer
set search_path = public
as $$
declare
  result_row public.notice_analysis_results;
  review_row public.notice_analysis_review_events;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if p_decision not in ('approve', 'reject', 'needs_revision', 'reanalysis_requested') then
    raise exception 'invalid_review_decision';
  end if;

  select * into result_row from public.notice_analysis_results where id = p_result_id;
  if result_row.id is null then raise exception 'analysis_result_not_found'; end if;
  if result_row.result_status <> 'validated' then
    raise exception 'only_validated_analysis_result_is_reviewable';
  end if;

  insert into public.notice_analysis_review_events (
    result_id, notice_id, revision_id, reviewer_id, decision,
    original_result_fingerprint, corrected_output, effective_output,
    correction_fingerprint, reason, event_idempotency_key
  ) values (
    result_row.id, result_row.notice_id, result_row.revision_id, auth.uid(), p_decision,
    result_row.result_fingerprint, p_corrected_output,
    coalesce(p_corrected_output, result_row.structured_result),
    case when p_corrected_output is null then null
      else encode(digest(p_corrected_output::text, 'sha256'), 'hex') end,
    p_reason, p_event_idempotency_key
  )
  on conflict (event_idempotency_key) do update
    set event_idempotency_key = excluded.event_idempotency_key
  returning * into review_row;

  return review_row;
end;
$$;

alter table public.notice_analysis_review_events enable row level security;
drop policy if exists notice_analysis_review_events_admin_select
on public.notice_analysis_review_events;
create policy notice_analysis_review_events_admin_select
on public.notice_analysis_review_events for select to authenticated
using (public.is_admin());

grant select on public.notice_analysis_review_events to authenticated;
grant all on public.notice_analysis_review_events to service_role;
revoke all on function public.finalize_notice_analysis_success(uuid, text, jsonb, jsonb, jsonb)
from public;
grant execute on function public.finalize_notice_analysis_success(uuid, text, jsonb, jsonb, jsonb)
to service_role;
revoke all on function public.claim_notice_analysis_job_by_revision(uuid, text, integer)
from public;
grant execute on function public.claim_notice_analysis_job_by_revision(uuid, text, integer)
to service_role;
revoke all on function public.record_notice_analysis_review(uuid, text, jsonb, text, text)
from public;
grant execute on function public.record_notice_analysis_review(uuid, text, jsonb, text, text)
to authenticated;

commit;
