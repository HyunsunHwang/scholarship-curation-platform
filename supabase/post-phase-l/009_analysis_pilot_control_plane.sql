-- Non-production analysis pilot control plane.
-- Additive only. Apply manually after 001-008 in the approved sandbox.
begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
  if to_regclass('public.notice_analysis_jobs') is null
     or to_regclass('public.notice_analysis_runs') is null
     or to_regclass('public.notice_analysis_routing_decisions') is null then
    raise exception 'Post-Phase L migrations 001 through 008 are required';
  end if;
end
$$;

create table public.notice_analysis_pilot_runs (
  id uuid primary key default gen_random_uuid(),
  namespace text not null,
  pilot_version text not null,
  target_project_ref text not null check (target_project_ref = 'hrayfvdggbhfmmzfblly'),
  status text not null check (status in (
    'prepared', 'smoke_ready', 'smoke_running', 'smoke_passed',
    'expansion_approved', 'expansion_running', 'completed', 'blocked',
    'reconciliation_required', 'failed', 'cancelled'
  )),
  current_stage text not null check (current_stage in ('smoke', 'expansion', 'completed')),
  prompt_version text not null,
  schema_version text not null,
  model_policy_version text not null,
  manifest_fingerprint text not null check (manifest_fingerprint ~ '^[a-f0-9]{64}$'),
  max_jobs integer not null check (max_jobs = 5),
  max_runs integer not null check (max_runs between 1 and 10),
  max_escalations integer not null check (max_escalations between 0 and 5),
  budget_limit_micros bigint not null check (budget_limit_micros > 0),
  reserved_cost_micros bigint not null default 0 check (reserved_cost_micros >= 0),
  actual_cost_micros bigint check (actual_cost_micros is null or actual_cost_micros >= 0),
  usage_status text not null default 'not_started'
    check (usage_status in ('not_started', 'recorded', 'missing', 'unreconciled')),
  created_at timestamptz not null default now(),
  smoke_started_at timestamptz,
  smoke_completed_at timestamptz,
  expansion_approved_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (namespace, pilot_version),
  unique (manifest_fingerprint)
);

create table public.notice_analysis_pilot_run_jobs (
  pilot_run_id uuid not null references public.notice_analysis_pilot_runs(id) on delete restrict,
  job_id uuid not null references public.notice_analysis_jobs(id) on delete restrict,
  execution_order integer not null check (execution_order between 1 and 5),
  stage text not null check (stage in ('smoke', 'expansion')),
  expected_revision_id uuid not null,
  expected_input_fingerprint text not null
    check (expected_input_fingerprint ~ '^[a-f0-9]{64}$'),
  member_status text not null default 'ready' check (member_status in (
    'ready', 'claimed', 'succeeded', 'failed', 'reconciliation_required', 'cancelled'
  )),
  claimed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (pilot_run_id, job_id),
  unique (pilot_run_id, execution_order)
);

create unique index notice_analysis_pilot_one_smoke_member_idx
  on public.notice_analysis_pilot_run_jobs(pilot_run_id)
  where stage = 'smoke';

create or replace function public.notice_analysis_pilot_membership_immutable()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.pilot_run_id is distinct from old.pilot_run_id
     or new.job_id is distinct from old.job_id
     or new.execution_order is distinct from old.execution_order
     or new.stage is distinct from old.stage
     or new.expected_revision_id is distinct from old.expected_revision_id
     or new.expected_input_fingerprint is distinct from old.expected_input_fingerprint then
    raise exception 'notice_analysis_pilot_membership_immutable';
  end if;
  return new;
end
$$;

create trigger notice_analysis_pilot_membership_immutable
before update on public.notice_analysis_pilot_run_jobs
for each row execute function public.notice_analysis_pilot_membership_immutable();

create table public.notice_analysis_provider_usage_receipts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.notice_analysis_jobs(id) on delete restrict,
  pilot_run_id uuid not null references public.notice_analysis_pilot_runs(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  run_role text not null check (run_role in ('economy', 'baseline', 'escalation')),
  provider text not null check (provider in ('anthropic', 'openai')),
  model text not null,
  provider_request_id text,
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  output_token_count integer check (output_token_count is null or output_token_count >= 0),
  cached_input_token_count integer check (
    cached_input_token_count is null or cached_input_token_count >= 0
  ),
  estimated_cost_micros bigint not null check (estimated_cost_micros >= 0),
  actual_cost_micros bigint check (actual_cost_micros is null or actual_cost_micros >= 0),
  usage_status text not null check (usage_status in ('recorded', 'missing', 'unreconciled')),
  pricing_version text not null,
  received_at timestamptz not null default now(),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  response_fingerprint text check (
    response_fingerprint is null or response_fingerprint ~ '^[a-f0-9]{64}$'
  ),
  safe_diagnostics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number, run_role)
);

create unique index notice_analysis_provider_request_uidx
  on public.notice_analysis_provider_usage_receipts(provider, provider_request_id)
  where provider_request_id is not null;

create table public.notice_analysis_pilot_cost_reservations (
  pilot_run_id uuid not null references public.notice_analysis_pilot_runs(id) on delete restrict,
  job_id uuid not null references public.notice_analysis_jobs(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  run_role text not null check (run_role in ('economy', 'baseline', 'escalation')),
  estimated_cost_micros bigint not null check (estimated_cost_micros >= 0),
  reservation_status text not null default 'reserved'
    check (reservation_status in ('reserved', 'reconciled', 'released')),
  created_at timestamptz not null default now(),
  reconciled_at timestamptz,
  primary key (job_id, attempt_number, run_role)
);

create or replace function public.notice_analysis_pilot_manifest_serialize(p_members jsonb)
returns text
language sql immutable strict parallel safe
set search_path = public
as $$
  select 'pilot-manifest-v1' || coalesce(string_agg(
    octet_length((member->>'execution_order')::integer::text)::text || ':' ||
      (member->>'execution_order')::integer::text ||
    octet_length(member->>'stage')::text || ':' || (member->>'stage') ||
    octet_length(member->>'job_id')::text || ':' || (member->>'job_id') ||
    octet_length(member->>'expected_revision_id')::text || ':' ||
      (member->>'expected_revision_id') ||
    octet_length(member->>'expected_input_fingerprint')::text || ':' ||
      (member->>'expected_input_fingerprint'),
    '' order by (member->>'execution_order')::integer
  ), '')
  from jsonb_array_elements(p_members) member
$$;

create or replace function public.notice_analysis_pilot_manifest_fingerprint(p_members jsonb)
returns text
language sql immutable strict parallel safe
set search_path = public
as $$
  select encode(digest(public.notice_analysis_pilot_manifest_serialize(p_members), 'sha256'), 'hex')
$$;

create or replace function public.notice_analysis_pilot_stored_manifest_fingerprint(
  p_pilot_run_id uuid
)
returns text
language sql stable
set search_path = public
as $$
  select public.notice_analysis_pilot_manifest_fingerprint(
    coalesce(jsonb_agg(jsonb_build_object(
      'execution_order', member.execution_order,
      'stage', member.stage,
      'job_id', member.job_id::text,
      'expected_revision_id', member.expected_revision_id::text,
      'expected_input_fingerprint', member.expected_input_fingerprint
    ) order by member.execution_order), '[]'::jsonb)
  )
  from public.notice_analysis_pilot_run_jobs member
  where member.pilot_run_id = p_pilot_run_id
$$;

create or replace function public.create_or_register_notice_analysis_pilot_run(
  p_pilot_run jsonb,
  p_members jsonb
)
returns public.notice_analysis_pilot_runs
language plpgsql security definer set search_path = public as $$
declare
  pilot public.notice_analysis_pilot_runs;
  member jsonb;
  member_count integer;
  smoke_count integer;
  computed_fingerprint text;
  stored_fingerprint text;
begin
  perform public.post_phase_l_assert_environment();
  if p_pilot_run->>'target_project_ref' <> 'hrayfvdggbhfmmzfblly' then
    raise exception 'pilot_target_project_ref_mismatch';
  end if;
  if jsonb_typeof(p_members) <> 'array' then
    raise exception 'pilot_manifest_array_required';
  end if;
  member_count := jsonb_array_length(p_members);
  select count(*) into smoke_count
  from jsonb_array_elements(p_members) m
  where m->>'stage' = 'smoke';
  if member_count <> 5 or smoke_count <> 1 then
    raise exception 'pilot_manifest_requires_exactly_five_members_and_one_smoke';
  end if;
  computed_fingerprint := public.notice_analysis_pilot_manifest_fingerprint(p_members);
  if computed_fingerprint <> p_pilot_run->>'manifest_fingerprint' then
    raise exception 'pilot_manifest_fingerprint_mismatch';
  end if;

  select * into pilot
  from public.notice_analysis_pilot_runs p
  where p.namespace = p_pilot_run->>'namespace'
    and p.pilot_version = p_pilot_run->>'pilot_version'
  for update;
  if pilot.id is null then
    select * into pilot
    from public.notice_analysis_pilot_runs p
    where p.manifest_fingerprint = computed_fingerprint
    for update;
  end if;
  if pilot.id is not null then
    stored_fingerprint :=
      public.notice_analysis_pilot_stored_manifest_fingerprint(pilot.id);
    if pilot.namespace <> p_pilot_run->>'namespace'
       or pilot.pilot_version <> p_pilot_run->>'pilot_version'
       or pilot.target_project_ref <> p_pilot_run->>'target_project_ref'
       or pilot.prompt_version <> p_pilot_run->>'prompt_version'
       or pilot.schema_version <> p_pilot_run->>'schema_version'
       or pilot.model_policy_version <> p_pilot_run->>'model_policy_version'
       or pilot.manifest_fingerprint <> computed_fingerprint
       or stored_fingerprint <> computed_fingerprint
       or pilot.max_jobs <> 5
       or pilot.max_runs <> (p_pilot_run->>'max_runs')::integer
       or pilot.max_escalations <> (p_pilot_run->>'max_escalations')::integer
       or pilot.budget_limit_micros <> (p_pilot_run->>'budget_limit_micros')::bigint
       or pilot.metadata <> coalesce(p_pilot_run->'metadata', '{}'::jsonb)
       or (
         nullif(p_pilot_run->>'id', '') is not null
         and pilot.id <> (p_pilot_run->>'id')::uuid
       ) then
      raise exception 'pilot_registration_replay_conflict';
    end if;
    return pilot;
  end if;

  for member in select value from jsonb_array_elements(p_members)
  loop
    if not exists (
      select 1
      from public.notice_analysis_jobs j
      where j.id = (member->>'job_id')::uuid
        and j.revision_id = (member->>'expected_revision_id')::uuid
        and j.input_fingerprint = member->>'expected_input_fingerprint'
        and j.prompt_version = p_pilot_run->>'prompt_version'
        and j.schema_version = p_pilot_run->>'schema_version'
        and j.model_policy = p_pilot_run->>'model_policy_version'
        and j.status = 'pending'
        and j.attempt_count = 0
        and j.leased_by is null
        and (j.lease_expires_at is null or j.lease_expires_at <= now())
        and j.metadata->>'pilot_namespace' = p_pilot_run->>'namespace'
        and not exists (select 1 from public.notice_analysis_runs r where r.job_id = j.id)
        and not exists (
          select 1 from public.notice_analysis_routing_decisions d where d.job_id = j.id
        )
    ) then
      raise exception 'pilot_member_precondition_failed:%', member->>'job_id';
    end if;
  end loop;

  insert into public.notice_analysis_pilot_runs (
    id, namespace, pilot_version, target_project_ref, status, current_stage,
    prompt_version, schema_version, model_policy_version, manifest_fingerprint,
    max_jobs, max_runs, max_escalations, budget_limit_micros, metadata
  ) values (
    coalesce((p_pilot_run->>'id')::uuid, gen_random_uuid()),
    p_pilot_run->>'namespace', p_pilot_run->>'pilot_version',
    p_pilot_run->>'target_project_ref', 'smoke_ready', 'smoke',
    p_pilot_run->>'prompt_version', p_pilot_run->>'schema_version',
    p_pilot_run->>'model_policy_version', computed_fingerprint,
    5, (p_pilot_run->>'max_runs')::integer,
    (p_pilot_run->>'max_escalations')::integer,
    (p_pilot_run->>'budget_limit_micros')::bigint,
    coalesce(p_pilot_run->'metadata', '{}'::jsonb)
  ) returning * into pilot;

  for member in select value from jsonb_array_elements(p_members)
  loop
    insert into public.notice_analysis_pilot_run_jobs (
      pilot_run_id, job_id, execution_order, stage, expected_revision_id,
      expected_input_fingerprint
    ) values (
      pilot.id, (member->>'job_id')::uuid, (member->>'execution_order')::integer,
      member->>'stage', (member->>'expected_revision_id')::uuid,
      member->>'expected_input_fingerprint'
    )
    on conflict (pilot_run_id, job_id) do nothing;
  end loop;
  stored_fingerprint :=
    public.notice_analysis_pilot_stored_manifest_fingerprint(pilot.id);
  if stored_fingerprint <> computed_fingerprint then
    raise exception 'pilot_manifest_fingerprint_mismatch';
  end if;
  return pilot;
end
$$;

create or replace function public.claim_notice_analysis_pilot_job(
  p_pilot_run_id uuid,
  p_stage text,
  p_worker_id text,
  p_lease_seconds integer default 180
)
returns setof public.notice_analysis_jobs
language plpgsql security definer set search_path = public as $$
declare
  lease_seconds integer := greatest(60, least(coalesce(p_lease_seconds, 180), 600));
  pilot public.notice_analysis_pilot_runs;
begin
  perform public.post_phase_l_assert_environment();
  if coalesce(trim(p_worker_id), '') = '' then raise exception 'worker_id_required'; end if;
  if p_stage not in ('smoke', 'expansion') then raise exception 'pilot_stage_invalid'; end if;

  select * into pilot from public.notice_analysis_pilot_runs
  where id = p_pilot_run_id for update;
  if pilot.id is null then raise exception 'pilot_run_not_found'; end if;
  if pilot.target_project_ref <> 'hrayfvdggbhfmmzfblly' then
    raise exception 'pilot_target_project_ref_mismatch';
  end if;
  if public.notice_analysis_pilot_stored_manifest_fingerprint(pilot.id)
      <> pilot.manifest_fingerprint then
    raise exception 'pilot_manifest_fingerprint_mismatch';
  end if;
  if pilot.usage_status in ('missing', 'unreconciled')
     or pilot.status in ('blocked', 'reconciliation_required', 'failed', 'cancelled') then
    raise exception 'pilot_claim_blocked';
  end if;
  if coalesce(pilot.actual_cost_micros, 0) + pilot.reserved_cost_micros
      >= pilot.budget_limit_micros then
    raise exception 'pilot_budget_exhausted';
  end if;
  if p_stage = 'smoke' and pilot.status not in ('smoke_ready', 'smoke_running') then
    raise exception 'pilot_smoke_not_ready';
  end if;
  if p_stage = 'expansion' and pilot.status not in ('expansion_approved', 'expansion_running') then
    raise exception 'pilot_expansion_not_approved';
  end if;

  return query
  with candidate as (
    select j.id, m.pilot_run_id
    from public.notice_analysis_pilot_run_jobs m
    join public.notice_analysis_jobs j on j.id = m.job_id
    where m.pilot_run_id = p_pilot_run_id
      and m.stage = p_stage
      and m.member_status = 'ready'
      and j.revision_id = m.expected_revision_id
      and j.input_fingerprint = m.expected_input_fingerprint
      and j.attempt_count < j.max_attempts
      and j.status in ('pending', 'retryable_failed')
      and j.available_at <= now()
      and j.leased_by is null
    order by m.execution_order
    for update of j, m skip locked
    limit 1
  ),
  member_update as (
    update public.notice_analysis_pilot_run_jobs m
    set member_status = 'claimed', claimed_at = now()
    from candidate c
    where m.pilot_run_id = c.pilot_run_id and m.job_id = c.id
    returning m.job_id
  ),
  job_update as (
    update public.notice_analysis_jobs j
    set status = 'leased', leased_by = p_worker_id, leased_at = now(),
        lease_expires_at = now() + make_interval(secs => lease_seconds),
        attempt_count = j.attempt_count + 1, updated_at = now()
    from member_update m where j.id = m.job_id
    returning j.*
  )
  select * from job_update;

  update public.notice_analysis_pilot_runs
  set status = case when p_stage = 'smoke' then 'smoke_running' else 'expansion_running' end,
      smoke_started_at = case
        when p_stage = 'smoke' then coalesce(smoke_started_at, now()) else smoke_started_at end
  where id = p_pilot_run_id;
end
$$;

create or replace function public.record_notice_analysis_provider_usage(
  p_job_id uuid,
  p_pilot_run_id uuid,
  p_worker_id text,
  p_receipt jsonb
)
returns public.notice_analysis_provider_usage_receipts
language plpgsql security definer set search_path = public as $$
declare
  row public.notice_analysis_provider_usage_receipts;
  existing public.notice_analysis_provider_usage_receipts;
  status text := p_receipt->>'usage_status';
  actual bigint := nullif(p_receipt->>'actual_cost_micros', '')::bigint;
begin
  perform public.post_phase_l_assert_environment();
  if status not in ('recorded', 'missing', 'unreconciled') then
    raise exception 'provider_usage_status_invalid';
  end if;
  if status = 'recorded' and actual is null then
    raise exception 'provider_recorded_usage_requires_actual_cost';
  end if;
  if status <> 'recorded' and actual is not null then
    raise exception 'provider_actual_cost_requires_recorded_usage';
  end if;
  if lower(p_receipt::text) ~ '"(api_key|prompt|notice_body|attachment_body|raw_response)"' then
    raise exception 'provider_usage_receipt_sensitive_payload_rejected';
  end if;
  if not exists (
    select 1 from public.notice_analysis_jobs j
    join public.notice_analysis_pilot_run_jobs m
      on m.job_id = j.id and m.pilot_run_id = p_pilot_run_id
    where j.id = p_job_id and j.leased_by = p_worker_id
      and j.status in ('leased', 'running')
      and j.lease_expires_at > now()
      and j.attempt_count = (p_receipt->>'attempt_number')::integer
  ) then raise exception 'provider_usage_receipt_lease_or_manifest_rejected'; end if;

  select * into existing from public.notice_analysis_provider_usage_receipts
  where job_id = p_job_id
    and attempt_number = (p_receipt->>'attempt_number')::integer
    and run_role = p_receipt->>'run_role';
  if existing.id is not null then
    if existing.provider_request_id is distinct from p_receipt->>'provider_request_id'
       or existing.request_fingerprint is distinct from p_receipt->>'request_fingerprint'
       or existing.usage_status is distinct from status
       or existing.actual_cost_micros is distinct from actual then
      raise exception 'provider_usage_receipt_conflict';
    end if;
    return existing;
  end if;

  insert into public.notice_analysis_provider_usage_receipts (
    job_id, pilot_run_id, attempt_number, run_role, provider, model,
    provider_request_id, input_token_count, output_token_count,
    cached_input_token_count, estimated_cost_micros, actual_cost_micros,
    usage_status, pricing_version, request_fingerprint, response_fingerprint,
    safe_diagnostics
  ) values (
    p_job_id, p_pilot_run_id, (p_receipt->>'attempt_number')::integer,
    p_receipt->>'run_role', p_receipt->>'provider', p_receipt->>'model',
    nullif(p_receipt->>'provider_request_id', ''),
    nullif(p_receipt->>'input_token_count', '')::integer,
    nullif(p_receipt->>'output_token_count', '')::integer,
    nullif(p_receipt->>'cached_input_token_count', '')::integer,
    (p_receipt->>'estimated_cost_micros')::bigint, actual, status,
    p_receipt->>'pricing_version', p_receipt->>'request_fingerprint',
    nullif(p_receipt->>'response_fingerprint', ''),
    coalesce(p_receipt->'safe_diagnostics', '{}'::jsonb)
  ) returning * into row;

  update public.notice_analysis_pilot_runs p
  set reserved_cost_micros = greatest(
        0, p.reserved_cost_micros - (p_receipt->>'estimated_cost_micros')::bigint
      ),
      actual_cost_micros = case when status = 'recorded'
        then coalesce(p.actual_cost_micros, 0) + actual else p.actual_cost_micros end,
      usage_status = case when status = 'recorded' then
        case when p.usage_status in ('missing', 'unreconciled') then p.usage_status else 'recorded' end
        else status end,
      status = case when status = 'recorded' then p.status else 'reconciliation_required' end
  where p.id = p_pilot_run_id;
  update public.notice_analysis_pilot_cost_reservations
  set reservation_status = 'reconciled', reconciled_at = now()
  where pilot_run_id = p_pilot_run_id and job_id = p_job_id
    and attempt_number = (p_receipt->>'attempt_number')::integer
    and run_role = p_receipt->>'run_role';
  return row;
end
$$;

create or replace function public.reserve_notice_analysis_pilot_cost(
  p_pilot_run_id uuid,
  p_job_id uuid,
  p_worker_id text,
  p_attempt_number integer,
  p_run_role text,
  p_estimated_cost_micros bigint
)
returns public.notice_analysis_pilot_runs
language plpgsql security definer set search_path = public as $$
declare
  pilot public.notice_analysis_pilot_runs;
  inserted boolean := false;
begin
  perform public.post_phase_l_assert_environment();
  if p_run_role not in ('economy', 'baseline', 'escalation')
     or p_estimated_cost_micros < 0 then
    raise exception 'pilot_cost_reservation_invalid';
  end if;
  if not exists (
    select 1 from public.notice_analysis_jobs j
    join public.notice_analysis_pilot_run_jobs m
      on m.job_id = j.id and m.pilot_run_id = p_pilot_run_id
    where j.id = p_job_id and j.leased_by = p_worker_id
      and j.lease_expires_at > now() and j.attempt_count = p_attempt_number
  ) then raise exception 'pilot_cost_reservation_lease_rejected'; end if;

  insert into public.notice_analysis_pilot_cost_reservations (
    pilot_run_id, job_id, attempt_number, run_role, estimated_cost_micros
  ) values (
    p_pilot_run_id, p_job_id, p_attempt_number, p_run_role, p_estimated_cost_micros
  ) on conflict (job_id, attempt_number, run_role) do nothing
  returning true into inserted;
  if not coalesce(inserted, false) then
    select * into pilot from public.notice_analysis_pilot_runs where id = p_pilot_run_id;
    return pilot;
  end if;

  update public.notice_analysis_pilot_runs p
  set reserved_cost_micros = p.reserved_cost_micros + p_estimated_cost_micros
  where p.id = p_pilot_run_id
    and p.status not in ('blocked', 'reconciliation_required', 'failed', 'cancelled')
    and coalesce(p.actual_cost_micros, 0) + p.reserved_cost_micros
      + p_estimated_cost_micros <= p.budget_limit_micros
    and exists (
      select 1 from public.notice_analysis_pilot_cost_reservations r
      where r.pilot_run_id = p.id and r.job_id = p_job_id
        and r.attempt_number = p_attempt_number and r.run_role = p_run_role
        and r.reservation_status = 'reserved'
    )
  returning * into pilot;
  if pilot.id is null then raise exception 'pilot_budget_reservation_rejected'; end if;
  return pilot;
end
$$;

create or replace function public.approve_notice_analysis_pilot_expansion(
  p_pilot_run_id uuid
)
returns public.notice_analysis_pilot_runs
language plpgsql security definer set search_path = public as $$
declare
  row public.notice_analysis_pilot_runs;
begin
  perform public.post_phase_l_assert_environment();
  update public.notice_analysis_pilot_runs p
  set status = 'expansion_approved', current_stage = 'expansion',
      expansion_approved_at = now()
  where p.id = p_pilot_run_id
    and p.status = 'smoke_passed'
    and p.usage_status = 'recorded'
    and p.actual_cost_micros is not null
    and p.actual_cost_micros <= p.budget_limit_micros
    and exists (
      select 1
      from public.notice_analysis_pilot_run_jobs m
      join public.notice_analysis_jobs j on j.id = m.job_id
      join public.notice_analysis_results r on r.job_id = j.id and r.result_status = 'validated'
      join public.notice_analysis_routing_decisions d on d.job_id = j.id
      where m.pilot_run_id = p.id and m.stage = 'smoke'
        and m.member_status = 'succeeded' and j.status = 'succeeded'
        and exists (select 1 from public.notice_analysis_evidence e where e.result_id = r.id)
        and exists (
          select 1 from public.notice_analysis_provider_usage_receipts u
          where u.pilot_run_id = p.id and u.job_id = j.id and u.usage_status = 'recorded'
        )
    )
  returning * into row;
  if row.id is null then raise exception 'pilot_expansion_gate_rejected'; end if;
  return row;
end
$$;

create or replace function public.finish_notice_analysis_pilot_member(
  p_pilot_run_id uuid,
  p_job_id uuid,
  p_worker_id text,
  p_member_status text
)
returns public.notice_analysis_pilot_runs
language plpgsql security definer set search_path = public as $$
declare
  pilot public.notice_analysis_pilot_runs;
  member_stage text;
begin
  perform public.post_phase_l_assert_environment();
  if p_member_status not in ('succeeded', 'failed', 'reconciliation_required') then
    raise exception 'pilot_member_finish_status_invalid';
  end if;
  select m.stage into member_stage
  from public.notice_analysis_pilot_run_jobs m
  where m.pilot_run_id = p_pilot_run_id and m.job_id = p_job_id
    and m.member_status = 'claimed'
  for update;
  if member_stage is null then raise exception 'pilot_member_not_claimed'; end if;
  if p_member_status = 'succeeded' and not exists (
    select 1 from public.notice_analysis_jobs j
    where j.id = p_job_id and j.status = 'succeeded'
      and j.leased_by is null and j.completed_at is not null
  ) then raise exception 'pilot_member_success_not_durable'; end if;
  if p_member_status <> 'succeeded' and not exists (
    select 1 from public.notice_analysis_jobs j
    where j.id = p_job_id and (
      j.status in ('retryable_failed', 'terminal_failed', 'budget_deferred')
      or j.leased_by = p_worker_id
    )
  ) then raise exception 'pilot_member_failure_not_durable'; end if;

  update public.notice_analysis_pilot_run_jobs
  set member_status = p_member_status, completed_at = now()
  where pilot_run_id = p_pilot_run_id and job_id = p_job_id;

  update public.notice_analysis_pilot_runs p
  set status = case
        when p_member_status = 'reconciliation_required' then 'reconciliation_required'
        when p_member_status = 'failed' then 'failed'
        when member_stage = 'smoke'
          and p.usage_status = 'recorded'
          and p.actual_cost_micros is not null
          and p.actual_cost_micros <= p.budget_limit_micros then 'smoke_passed'
        when member_stage = 'smoke' then 'reconciliation_required'
        when not exists (
          select 1 from public.notice_analysis_pilot_run_jobs remaining
          where remaining.pilot_run_id = p.id
            and remaining.member_status not in ('succeeded', 'cancelled')
        ) then 'completed'
        else p.status end,
      smoke_completed_at = case
        when member_stage = 'smoke' and p_member_status = 'succeeded' then now()
        else p.smoke_completed_at end,
      completed_at = case
        when member_stage = 'expansion' and p_member_status = 'succeeded'
          and not exists (
            select 1 from public.notice_analysis_pilot_run_jobs remaining
            where remaining.pilot_run_id = p.id and remaining.job_id <> p_job_id
              and remaining.member_status not in ('succeeded', 'cancelled')
          ) then now()
        else p.completed_at end
  where p.id = p_pilot_run_id
  returning * into pilot;
  return pilot;
end
$$;

alter table public.notice_analysis_pilot_runs enable row level security;
alter table public.notice_analysis_pilot_run_jobs enable row level security;
alter table public.notice_analysis_provider_usage_receipts enable row level security;
alter table public.notice_analysis_pilot_cost_reservations enable row level security;

revoke all on public.notice_analysis_pilot_runs from public, anon, authenticated;
revoke all on public.notice_analysis_pilot_run_jobs from public, anon, authenticated;
revoke all on public.notice_analysis_provider_usage_receipts from public, anon, authenticated;
revoke all on public.notice_analysis_pilot_cost_reservations from public, anon, authenticated;
revoke all on public.notice_analysis_pilot_runs from service_role;
revoke all on public.notice_analysis_pilot_run_jobs from service_role;
revoke all on public.notice_analysis_provider_usage_receipts from service_role;
revoke all on public.notice_analysis_pilot_cost_reservations from service_role;
grant select on public.notice_analysis_pilot_runs to service_role;
grant select on public.notice_analysis_pilot_run_jobs to service_role;
grant select on public.notice_analysis_provider_usage_receipts to service_role;
grant select on public.notice_analysis_pilot_cost_reservations to service_role;

revoke all on function public.create_or_register_notice_analysis_pilot_run(jsonb,jsonb)
  from public, anon, authenticated;
revoke all on function public.claim_notice_analysis_pilot_job(uuid,text,text,integer)
  from public, anon, authenticated;
revoke all on function public.record_notice_analysis_provider_usage(uuid,uuid,text,jsonb)
  from public, anon, authenticated;
revoke all on function public.reserve_notice_analysis_pilot_cost(uuid,uuid,text,integer,text,bigint)
  from public, anon, authenticated;
revoke all on function public.approve_notice_analysis_pilot_expansion(uuid)
  from public, anon, authenticated;
revoke all on function public.finish_notice_analysis_pilot_member(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.create_or_register_notice_analysis_pilot_run(jsonb,jsonb)
  to service_role;
grant execute on function public.claim_notice_analysis_pilot_job(uuid,text,text,integer)
  to service_role;
grant execute on function public.record_notice_analysis_provider_usage(uuid,uuid,text,jsonb)
  to service_role;
grant execute on function public.reserve_notice_analysis_pilot_cost(uuid,uuid,text,integer,text,bigint)
  to service_role;
grant execute on function public.approve_notice_analysis_pilot_expansion(uuid)
  to service_role;
grant execute on function public.finish_notice_analysis_pilot_member(uuid,uuid,text,text)
  to service_role;

commit;
