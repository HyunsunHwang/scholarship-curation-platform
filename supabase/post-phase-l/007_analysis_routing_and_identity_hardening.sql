-- Unit 3: deterministic canonical identity and durable bounded model routing.
-- Additive data model changes; replaces no scheduled production workflow.
begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
  if to_regclass('public.notice_analysis_runs') is null
     or to_regclass('public.scholarship_programs') is null then
    raise exception 'Post-Phase L migrations 004 through 006 are required';
  end if;
end
$$;

create or replace function public.scholarship_identity_normalize(p_value text)
returns text language sql immutable parallel safe as $$
  select lower(regexp_replace(coalesce(btrim(p_value), ''), '[[:space:][:punct:]]+', '', 'g'))
$$;

alter table public.scholarship_programs
  add column if not exists normalized_organization text,
  add column if not exists identity_discriminator text not null default 'default',
  add column if not exists identity_key text;

update public.scholarship_programs
set normalized_name = public.scholarship_identity_normalize(canonical_name),
    normalized_organization = coalesce(
      nullif(public.scholarship_identity_normalize(operating_organization), ''),
      'organization-unknown'
    ),
    identity_key = encode(digest(
      'v1|program|' ||
      public.scholarship_identity_normalize(canonical_name) || '|' ||
      coalesce(nullif(public.scholarship_identity_normalize(operating_organization), ''),
        'organization-unknown') || '|' ||
      public.scholarship_identity_normalize(identity_discriminator),
      'sha256'
    ), 'hex')
where identity_key is null;

alter table public.scholarship_programs
  alter column normalized_organization set not null,
  alter column identity_key set not null;

create unique index if not exists scholarship_programs_identity_key_uidx
  on public.scholarship_programs(identity_key);

create or replace function public.scholarship_program_identity_derived()
returns trigger language plpgsql set search_path = public as $$
begin
  new.normalized_name := public.scholarship_identity_normalize(new.canonical_name);
  new.normalized_organization := coalesce(
    nullif(public.scholarship_identity_normalize(new.operating_organization), ''),
    'organization-unknown'
  );
  new.identity_discriminator := coalesce(
    nullif(public.scholarship_identity_normalize(new.identity_discriminator), ''), 'default'
  );
  new.identity_key := encode(digest(
    'v1|program|' || new.normalized_name || '|' || new.normalized_organization || '|' ||
    new.identity_discriminator, 'sha256'
  ), 'hex');
  perform pg_advisory_xact_lock(hashtextextended(new.identity_key, 0));
  return new;
end
$$;

drop trigger if exists scholarship_program_identity_derived on public.scholarship_programs;
create trigger scholarship_program_identity_derived
before insert or update of canonical_name, operating_organization, identity_discriminator
on public.scholarship_programs
for each row execute function public.scholarship_program_identity_derived();

alter table public.scholarship_cycles
  add column if not exists revision_identity_key text,
  add column if not exists cycle_identity_key text;

update public.scholarship_cycles
set revision_identity_key = encode(digest(
  'v1|cycle-revision|' || program_id::text || '|' || source_revision_id::text, 'sha256'
), 'hex'),
    cycle_identity_key = case
      when cycle_year is not null
       and (nullif(public.scholarship_identity_normalize(academic_term), '') is not null
         or (application_start_at is not null and application_end_at is not null))
      then encode(digest(
        'v1|cycle-clear|' || program_id::text || '|' || cycle_year::text || '|' ||
        coalesce(nullif(public.scholarship_identity_normalize(academic_term), ''), '-') || '|' ||
        coalesce(application_start_at::text, '-') || '|' || coalesce(application_end_at::text, '-'),
        'sha256'), 'hex')
      else null
    end
where revision_identity_key is null;

alter table public.scholarship_cycles alter column revision_identity_key set not null;
create unique index if not exists scholarship_cycles_revision_identity_uidx
  on public.scholarship_cycles(revision_identity_key);
create unique index if not exists scholarship_cycles_clear_identity_uidx
  on public.scholarship_cycles(cycle_identity_key) where cycle_identity_key is not null;

create or replace function public.scholarship_cycle_identity_derived()
returns trigger language plpgsql set search_path = public as $$
begin
  new.revision_identity_key := encode(digest(
    'v1|cycle-revision|' || new.program_id::text || '|' || new.source_revision_id::text, 'sha256'
  ), 'hex');
  new.cycle_identity_key := case
    when new.cycle_year is not null
     and (nullif(public.scholarship_identity_normalize(new.academic_term), '') is not null
       or (new.application_start_at is not null and new.application_end_at is not null))
    then encode(digest(
      'v1|cycle-clear|' || new.program_id::text || '|' || new.cycle_year::text || '|' ||
      coalesce(nullif(public.scholarship_identity_normalize(new.academic_term), ''), '-') || '|' ||
      coalesce(new.application_start_at::text, '-') || '|' ||
      coalesce(new.application_end_at::text, '-'), 'sha256'
    ), 'hex')
    else null
  end;
  perform pg_advisory_xact_lock(hashtextextended(new.revision_identity_key, 0));
  if new.cycle_identity_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(new.cycle_identity_key, 0));
  else
    perform pg_advisory_xact_lock(hashtextextended(
      new.program_id::text || '|ambiguous|' || coalesce(new.cycle_year::text, '-') || '|' ||
      public.scholarship_identity_normalize(new.cycle_label), 0
    ));
    if exists (
      select 1 from public.scholarship_cycles existing
      where existing.program_id = new.program_id
        and existing.id is distinct from new.id
        and existing.cycle_year is not distinct from new.cycle_year
        and public.scholarship_identity_normalize(existing.cycle_label)
          = public.scholarship_identity_normalize(new.cycle_label)
    ) then
      raise exception 'cycle_identity_review_required';
    end if;
  end if;
  return new;
end
$$;

drop trigger if exists scholarship_cycle_identity_derived on public.scholarship_cycles;
create trigger scholarship_cycle_identity_derived
before insert or update of program_id, source_revision_id, cycle_year, academic_term,
  application_start_at, application_end_at
on public.scholarship_cycles
for each row execute function public.scholarship_cycle_identity_derived();

alter table public.notice_analysis_runs
  add column if not exists run_role text not null default 'baseline'
    check (run_role in ('baseline', 'economy', 'escalation'));
alter table public.notice_analysis_runs
  drop constraint if exists notice_analysis_runs_job_id_attempt_number_key;
create unique index if not exists notice_analysis_runs_job_attempt_role_uidx
  on public.notice_analysis_runs(job_id, attempt_number, run_role);

create table if not exists public.notice_analysis_routing_decisions (
  id uuid primary key,
  job_id uuid not null references public.notice_analysis_jobs(id) on delete cascade,
  economy_run_id uuid references public.notice_analysis_runs(id) on delete set null,
  escalation_run_id uuid references public.notice_analysis_runs(id) on delete set null,
  selected_run_id uuid references public.notice_analysis_runs(id) on delete restrict,
  selected_result_id uuid references public.notice_analysis_results(id) on delete restrict,
  reason_codes jsonb not null default '[]'::jsonb,
  policy_version text not null,
  decision_fingerprint text not null check (decision_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (job_id),
  unique (decision_fingerprint)
);

alter table public.notice_analysis_routing_decisions enable row level security;
drop policy if exists notice_analysis_routing_decisions_admin_select
  on public.notice_analysis_routing_decisions;
create policy notice_analysis_routing_decisions_admin_select
  on public.notice_analysis_routing_decisions for select to authenticated
  using (public.is_admin());

revoke all on public.notice_analysis_routing_decisions from public, anon, authenticated;
grant select on public.notice_analysis_routing_decisions to authenticated;
grant all on public.notice_analysis_routing_decisions to service_role;

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
  run_role text := coalesce(nullif(p_run->>'run_role', ''), 'baseline');
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
    id, job_id, attempt_number, run_role, provider, model, request_id, status,
    started_at, finished_at, latency_ms, input_token_count, output_token_count,
    cached_input_token_count, estimated_cost_micros, currency_code,
    prompt_version, schema_version, input_fingerprint, response_fingerprint,
    validation_status, error_code, error_message, raw_response_retention_until,
    raw_response, metadata, created_at
  ) values (
    run_id, p_job_id, (p_run->>'attempt_number')::integer, run_role,
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
  on conflict (job_id, attempt_number, run_role) do nothing;

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

create or replace function public.finalize_notice_analysis_routing(
  p_job_id uuid,
  p_worker_id text,
  p_economy_run jsonb,
  p_economy_result jsonb,
  p_economy_evidence jsonb,
  p_escalation_run jsonb,
  p_escalation_result jsonb,
  p_escalation_evidence jsonb,
  p_decision jsonb,
  p_selected_run_id uuid,
  p_selected_result_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.notice_analysis_jobs;
  existing_decision public.notice_analysis_routing_decisions;
  evidence_row jsonb;
begin
  select * into job_row
  from public.notice_analysis_jobs
  where id = p_job_id
  for update;

  if job_row.id is null then
    raise exception 'finalize_notice_analysis_routing_rejected_job';
  end if;

  select * into existing_decision
  from public.notice_analysis_routing_decisions
  where job_id = p_job_id;

  if existing_decision.id is not null then
    if existing_decision.decision_fingerprint = p_decision->>'decision_fingerprint'
       and existing_decision.selected_run_id = p_selected_run_id
       and existing_decision.selected_result_id = p_selected_result_id
       and existing_decision.economy_run_id is not distinct from
         nullif(p_decision->>'economy_run_id', '')::uuid
       and existing_decision.escalation_run_id is not distinct from
         nullif(p_decision->>'escalation_run_id', '')::uuid
       and existing_decision.policy_version = p_decision->>'policy_version'
    then
      return jsonb_build_object(
        'replayed', true,
        'job_id', p_job_id,
        'status', 'succeeded',
        'routing_decision_id', existing_decision.id,
        'selected_run_id', existing_decision.selected_run_id,
        'selected_result_id', existing_decision.selected_result_id
      );
    end if;
    raise exception 'routing_decision_conflict';
  end if;

  if job_row.leased_by is distinct from p_worker_id
     or job_row.status not in ('leased', 'running')
     or job_row.lease_expires_at is null
     or job_row.lease_expires_at <= now() then
    raise exception 'finalize_notice_analysis_routing_rejected_lease';
  end if;

  if p_selected_run_id is null or p_selected_result_id is null then
    raise exception 'finalize_notice_analysis_routing_rejected_missing_selection';
  end if;

  if p_economy_run is not null and p_economy_result is not null then
    insert into public.notice_analysis_runs (
      id, job_id, attempt_number, run_role, provider, model, request_id, status,
      started_at, finished_at, latency_ms, input_token_count, output_token_count,
      cached_input_token_count, estimated_cost_micros, currency_code,
      prompt_version, schema_version, input_fingerprint, response_fingerprint,
      validation_status, error_code, error_message, raw_response_retention_until,
      raw_response, metadata, created_at
    ) values (
      (p_economy_run->>'id')::uuid, p_job_id,
      (p_economy_run->>'attempt_number')::integer,
      coalesce(nullif(p_economy_run->>'run_role', ''), 'economy'),
      p_economy_run->>'provider', p_economy_run->>'model',
      p_economy_run->>'request_id', p_economy_run->>'status',
      (p_economy_run->>'started_at')::timestamptz,
      (p_economy_run->>'finished_at')::timestamptz,
      (p_economy_run->>'latency_ms')::integer,
      (p_economy_run->>'input_token_count')::integer,
      (p_economy_run->>'output_token_count')::integer,
      (p_economy_run->>'cached_input_token_count')::integer,
      (p_economy_run->>'estimated_cost_micros')::bigint,
      coalesce(p_economy_run->>'currency_code', 'USD'),
      p_economy_run->>'prompt_version', p_economy_run->>'schema_version',
      p_economy_run->>'input_fingerprint', p_economy_run->>'response_fingerprint',
      p_economy_run->>'validation_status', p_economy_run->>'error_code',
      p_economy_run->>'error_message',
      (p_economy_run->>'raw_response_retention_until')::timestamptz,
      p_economy_run->'raw_response', coalesce(p_economy_run->'metadata', '{}'::jsonb),
      coalesce((p_economy_run->>'created_at')::timestamptz, now())
    )
    on conflict (job_id, attempt_number, run_role) do nothing;

    insert into public.notice_analysis_results (
      id, job_id, run_id, notice_id, revision_id, result_status,
      analysis_schema_version, structured_result, result_fingerprint,
      validation_errors, confidence_summary, requires_human_review, created_at
    ) values (
      (p_economy_result->>'id')::uuid, p_job_id,
      (p_economy_run->>'id')::uuid, job_row.notice_id, job_row.revision_id,
      p_economy_result->>'result_status',
      p_economy_result->>'analysis_schema_version',
      p_economy_result->'structured_result',
      p_economy_result->>'result_fingerprint',
      coalesce(p_economy_result->'validation_errors', '[]'::jsonb),
      coalesce(p_economy_result->'confidence_summary', '{}'::jsonb),
      true, coalesce((p_economy_result->>'created_at')::timestamptz, now())
    )
    on conflict (run_id) do nothing;

    for evidence_row in
      select value from jsonb_array_elements(coalesce(p_economy_evidence, '[]'::jsonb))
    loop
      insert into public.notice_analysis_evidence (
        id, result_id, field_path, evidence_kind, source_revision_id,
        source_asset_id, source_locator, quoted_text, normalized_value,
        confidence, evidence_fingerprint, created_at
      ) values (
        (evidence_row->>'id')::uuid,
        (p_economy_result->>'id')::uuid,
        evidence_row->>'field_path', evidence_row->>'evidence_kind',
        job_row.revision_id,
        nullif(evidence_row->>'source_asset_id', '')::uuid,
        evidence_row->>'source_locator', evidence_row->>'quoted_text',
        evidence_row->'normalized_value', (evidence_row->>'confidence')::numeric,
        evidence_row->>'evidence_fingerprint',
        coalesce((evidence_row->>'created_at')::timestamptz, now())
      )
      on conflict (result_id, field_path, evidence_fingerprint) do nothing;
    end loop;
  elsif p_economy_run is not null then
    insert into public.notice_analysis_runs (
      id, job_id, attempt_number, run_role, provider, model, request_id, status,
      started_at, finished_at, latency_ms, input_token_count, output_token_count,
      cached_input_token_count, estimated_cost_micros, currency_code,
      prompt_version, schema_version, input_fingerprint, response_fingerprint,
      validation_status, error_code, error_message, raw_response_retention_until,
      raw_response, metadata, created_at
    ) values (
      (p_economy_run->>'id')::uuid, p_job_id,
      (p_economy_run->>'attempt_number')::integer,
      coalesce(nullif(p_economy_run->>'run_role', ''), 'economy'),
      p_economy_run->>'provider', p_economy_run->>'model',
      p_economy_run->>'request_id', p_economy_run->>'status',
      (p_economy_run->>'started_at')::timestamptz,
      (p_economy_run->>'finished_at')::timestamptz,
      (p_economy_run->>'latency_ms')::integer,
      (p_economy_run->>'input_token_count')::integer,
      (p_economy_run->>'output_token_count')::integer,
      (p_economy_run->>'cached_input_token_count')::integer,
      (p_economy_run->>'estimated_cost_micros')::bigint,
      coalesce(p_economy_run->>'currency_code', 'USD'),
      p_economy_run->>'prompt_version', p_economy_run->>'schema_version',
      p_economy_run->>'input_fingerprint', p_economy_run->>'response_fingerprint',
      p_economy_run->>'validation_status', p_economy_run->>'error_code',
      p_economy_run->>'error_message',
      (p_economy_run->>'raw_response_retention_until')::timestamptz,
      p_economy_run->'raw_response', coalesce(p_economy_run->'metadata', '{}'::jsonb),
      coalesce((p_economy_run->>'created_at')::timestamptz, now())
    )
    on conflict (job_id, attempt_number, run_role) do nothing;
  end if;

  if p_escalation_run is not null and p_escalation_result is not null then
    insert into public.notice_analysis_runs (
      id, job_id, attempt_number, run_role, provider, model, request_id, status,
      started_at, finished_at, latency_ms, input_token_count, output_token_count,
      cached_input_token_count, estimated_cost_micros, currency_code,
      prompt_version, schema_version, input_fingerprint, response_fingerprint,
      validation_status, error_code, error_message, raw_response_retention_until,
      raw_response, metadata, created_at
    ) values (
      (p_escalation_run->>'id')::uuid, p_job_id,
      (p_escalation_run->>'attempt_number')::integer,
      coalesce(nullif(p_escalation_run->>'run_role', ''), 'escalation'),
      p_escalation_run->>'provider', p_escalation_run->>'model',
      p_escalation_run->>'request_id', p_escalation_run->>'status',
      (p_escalation_run->>'started_at')::timestamptz,
      (p_escalation_run->>'finished_at')::timestamptz,
      (p_escalation_run->>'latency_ms')::integer,
      (p_escalation_run->>'input_token_count')::integer,
      (p_escalation_run->>'output_token_count')::integer,
      (p_escalation_run->>'cached_input_token_count')::integer,
      (p_escalation_run->>'estimated_cost_micros')::bigint,
      coalesce(p_escalation_run->>'currency_code', 'USD'),
      p_escalation_run->>'prompt_version', p_escalation_run->>'schema_version',
      p_escalation_run->>'input_fingerprint', p_escalation_run->>'response_fingerprint',
      p_escalation_run->>'validation_status', p_escalation_run->>'error_code',
      p_escalation_run->>'error_message',
      (p_escalation_run->>'raw_response_retention_until')::timestamptz,
      p_escalation_run->'raw_response', coalesce(p_escalation_run->'metadata', '{}'::jsonb),
      coalesce((p_escalation_run->>'created_at')::timestamptz, now())
    )
    on conflict (job_id, attempt_number, run_role) do nothing;

    insert into public.notice_analysis_results (
      id, job_id, run_id, notice_id, revision_id, result_status,
      analysis_schema_version, structured_result, result_fingerprint,
      validation_errors, confidence_summary, requires_human_review, created_at
    ) values (
      (p_escalation_result->>'id')::uuid, p_job_id,
      (p_escalation_run->>'id')::uuid, job_row.notice_id, job_row.revision_id,
      p_escalation_result->>'result_status',
      p_escalation_result->>'analysis_schema_version',
      p_escalation_result->'structured_result',
      p_escalation_result->>'result_fingerprint',
      coalesce(p_escalation_result->'validation_errors', '[]'::jsonb),
      coalesce(p_escalation_result->'confidence_summary', '{}'::jsonb),
      true, coalesce((p_escalation_result->>'created_at')::timestamptz, now())
    )
    on conflict (run_id) do nothing;

    for evidence_row in
      select value from jsonb_array_elements(coalesce(p_escalation_evidence, '[]'::jsonb))
    loop
      insert into public.notice_analysis_evidence (
        id, result_id, field_path, evidence_kind, source_revision_id,
        source_asset_id, source_locator, quoted_text, normalized_value,
        confidence, evidence_fingerprint, created_at
      ) values (
        (evidence_row->>'id')::uuid,
        (p_escalation_result->>'id')::uuid,
        evidence_row->>'field_path', evidence_row->>'evidence_kind',
        job_row.revision_id,
        nullif(evidence_row->>'source_asset_id', '')::uuid,
        evidence_row->>'source_locator', evidence_row->>'quoted_text',
        evidence_row->'normalized_value', (evidence_row->>'confidence')::numeric,
        evidence_row->>'evidence_fingerprint',
        coalesce((evidence_row->>'created_at')::timestamptz, now())
      )
      on conflict (result_id, field_path, evidence_fingerprint) do nothing;
    end loop;
  elsif p_escalation_run is not null then
    insert into public.notice_analysis_runs (
      id, job_id, attempt_number, run_role, provider, model, request_id, status,
      started_at, finished_at, latency_ms, input_token_count, output_token_count,
      cached_input_token_count, estimated_cost_micros, currency_code,
      prompt_version, schema_version, input_fingerprint, response_fingerprint,
      validation_status, error_code, error_message, raw_response_retention_until,
      raw_response, metadata, created_at
    ) values (
      (p_escalation_run->>'id')::uuid, p_job_id,
      (p_escalation_run->>'attempt_number')::integer,
      coalesce(nullif(p_escalation_run->>'run_role', ''), 'escalation'),
      p_escalation_run->>'provider', p_escalation_run->>'model',
      p_escalation_run->>'request_id', p_escalation_run->>'status',
      (p_escalation_run->>'started_at')::timestamptz,
      (p_escalation_run->>'finished_at')::timestamptz,
      (p_escalation_run->>'latency_ms')::integer,
      (p_escalation_run->>'input_token_count')::integer,
      (p_escalation_run->>'output_token_count')::integer,
      (p_escalation_run->>'cached_input_token_count')::integer,
      (p_escalation_run->>'estimated_cost_micros')::bigint,
      coalesce(p_escalation_run->>'currency_code', 'USD'),
      p_escalation_run->>'prompt_version', p_escalation_run->>'schema_version',
      p_escalation_run->>'input_fingerprint', p_escalation_run->>'response_fingerprint',
      p_escalation_run->>'validation_status', p_escalation_run->>'error_code',
      p_escalation_run->>'error_message',
      (p_escalation_run->>'raw_response_retention_until')::timestamptz,
      p_escalation_run->'raw_response', coalesce(p_escalation_run->'metadata', '{}'::jsonb),
      coalesce((p_escalation_run->>'created_at')::timestamptz, now())
    )
    on conflict (job_id, attempt_number, run_role) do nothing;
  end if;

  if not exists (
    select 1 from public.notice_analysis_results r
    join public.notice_analysis_runs run on run.id = r.run_id and run.job_id = r.job_id
    where r.id = p_selected_result_id
      and run.id = p_selected_run_id
      and r.job_id = p_job_id
      and r.result_status = 'validated'
      and run.status = 'succeeded'
      and run.validation_status = 'validated'
      and run.finished_at is not null
  ) then
    raise exception 'finalize_notice_analysis_routing_rejected_selection';
  end if;

  insert into public.notice_analysis_routing_decisions (
    id, job_id, economy_run_id, escalation_run_id, selected_run_id,
    selected_result_id, reason_codes, policy_version, decision_fingerprint, created_at
  ) values (
    (p_decision->>'id')::uuid, p_job_id,
    nullif(p_decision->>'economy_run_id', '')::uuid,
    nullif(p_decision->>'escalation_run_id', '')::uuid,
    p_selected_run_id, p_selected_result_id,
    coalesce(p_decision->'reason_codes', '[]'::jsonb),
    p_decision->>'policy_version', p_decision->>'decision_fingerprint',
    coalesce((p_decision->>'created_at')::timestamptz, now())
  )
  on conflict (job_id) do nothing;

  update public.notice_analysis_jobs
  set status = 'succeeded', completed_at = now(), updated_at = now(),
      leased_by = null, lease_expires_at = null
  where id = p_job_id;

  return jsonb_build_object(
    'replayed', false,
    'job_id', p_job_id,
    'status', 'succeeded',
    'routing_decision_id', (p_decision->>'id')::uuid,
    'selected_run_id', p_selected_run_id,
    'selected_result_id', p_selected_result_id
  );
end;
$$;

create or replace function public.defer_notice_analysis_job_for_budget(
  p_job_id uuid,
  p_worker_id text,
  p_reason_codes jsonb default '[]'::jsonb,
  p_error_message text default null,
  p_estimated_cost_micros bigint default null
)
returns public.notice_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job_row public.notice_analysis_jobs;
begin
  select * into job_row
  from public.notice_analysis_jobs
  where id = p_job_id
  for update;

  if job_row.id is null then
    raise exception 'defer_notice_analysis_job_for_budget_rejected_job';
  end if;

  if job_row.status = 'budget_deferred'
     and job_row.last_error_code = 'budget_deferred' then
    return job_row;
  end if;

  if job_row.leased_by is distinct from p_worker_id
     or job_row.status not in ('leased', 'running')
     or job_row.lease_expires_at is null
     or job_row.lease_expires_at <= now() then
    raise exception 'defer_notice_analysis_job_for_budget_rejected_lease';
  end if;

  update public.notice_analysis_jobs
  set status = 'budget_deferred',
      last_error_code = 'budget_deferred',
      last_error_message = coalesce(
        p_error_message,
        coalesce(p_reason_codes, '[]'::jsonb)::text,
        'budget_deferred'
      ),
      updated_at = now(),
      leased_by = null,
      lease_expires_at = null,
      completed_at = null,
      metadata = case
        when p_estimated_cost_micros is not null then
          coalesce(metadata, '{}'::jsonb)
          || jsonb_build_object('estimated_cost_micros', p_estimated_cost_micros)
        else metadata
      end
  where id = p_job_id
  returning * into job_row;

  return job_row;
end;
$$;

revoke all on function public.defer_notice_analysis_job_for_budget(
  uuid, text, jsonb, text, bigint
) from public, anon, authenticated;
grant execute on function public.defer_notice_analysis_job_for_budget(
  uuid, text, jsonb, text, bigint
) to service_role;

revoke all on function public.finalize_notice_analysis_routing(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, uuid
) from public;
grant execute on function public.finalize_notice_analysis_routing(
  uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, uuid, uuid
) to service_role;

commit;
