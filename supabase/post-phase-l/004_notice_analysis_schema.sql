-- Phase 2 notice analysis schema and durable queue contracts.
-- Additive only. Do not apply automatically; target environment guard remains operator-owned.
-- Depends on Post-Phase L graph tables from 002_post_phase_l_normalized_graph.sql.

begin;

do $$
begin
  if to_regclass('public.post_phase_l_environment_guard') is null then
    raise exception 'Post-Phase L environment guard is required';
  end if;

  perform public.post_phase_l_assert_environment();

  if to_regclass('public.ingestion_notices') is null then
    raise exception 'ingestion_notices is required';
  end if;
  if to_regclass('public.ingestion_notice_revisions') is null then
    raise exception 'ingestion_notice_revisions is required';
  end if;
  if to_regclass('public.ingestion_notice_assets') is null then
    raise exception 'ingestion_notice_assets is required';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'public.is_admin() is required';
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    raise exception 'public.set_updated_at() is required';
  end if;
end
$$;

create table if not exists public.notice_analysis_jobs (
  id uuid primary key,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  revision_id uuid not null references public.ingestion_notice_revisions(id) on delete cascade,
  status text not null check (
    status in (
      'pending',
      'leased',
      'running',
      'succeeded',
      'retryable_failed',
      'terminal_failed',
      'cancelled',
      'superseded',
      'budget_deferred'
    )
  ),
  priority integer not null default 100,
  analysis_kind text not null,
  provider_policy text not null default 'anthropic',
  model_policy text not null default 'claude-sonnet-5',
  prompt_version text not null,
  schema_version text not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  idempotency_key text not null,
  readiness_status text not null,
  readiness_reason_codes jsonb not null default '[]'::jsonb,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts > 0),
  available_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  leased_by text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  unique (idempotency_key),
  unique (revision_id, analysis_kind, prompt_version, schema_version, input_fingerprint),
  unique (id, notice_id, revision_id)
);

-- Auto-claim queue excludes budget_deferred (requires explicit release to pending).
create index if not exists notice_analysis_jobs_pending_queue_idx
  on public.notice_analysis_jobs(status, available_at, priority desc, created_at)
  where status in ('pending', 'retryable_failed');

create index if not exists notice_analysis_jobs_lease_idx
  on public.notice_analysis_jobs(lease_expires_at, status)
  where status in ('leased', 'running');

create index if not exists notice_analysis_jobs_revision_idx
  on public.notice_analysis_jobs(revision_id, created_at desc);

create index if not exists notice_analysis_jobs_notice_idx
  on public.notice_analysis_jobs(notice_id, created_at desc);

drop trigger if exists notice_analysis_jobs_set_updated_at on public.notice_analysis_jobs;
create trigger notice_analysis_jobs_set_updated_at
before update on public.notice_analysis_jobs
for each row execute function public.set_updated_at();

create table if not exists public.notice_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.notice_analysis_jobs(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  provider text not null check (provider in ('anthropic', 'openai')),
  model text not null,
  request_id text,
  status text not null check (
    status in (
      'started',
      'transport_succeeded',
      'content_received',
      'json_parsed',
      'schema_valid',
      'semantic_valid',
      'evidence_valid',
      'succeeded',
      'retryable_failed',
      'terminal_failed',
      'cancelled'
    )
  ),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_token_count integer check (input_token_count is null or input_token_count >= 0),
  output_token_count integer check (output_token_count is null or output_token_count >= 0),
  cached_input_token_count integer check (cached_input_token_count is null or cached_input_token_count >= 0),
  estimated_cost_micros bigint check (estimated_cost_micros is null or estimated_cost_micros >= 0),
  currency_code text not null default 'USD',
  prompt_version text not null,
  schema_version text not null,
  input_fingerprint text not null check (input_fingerprint ~ '^[a-f0-9]{64}$'),
  response_fingerprint text check (response_fingerprint is null or response_fingerprint ~ '^[a-f0-9]{64}$'),
  validation_status text not null default 'not_validated'
    check (validation_status in (
      'not_validated',
      'json_invalid',
      'schema_invalid',
      'semantic_invalid',
      'evidence_invalid',
      'validated'
    )),
  error_code text,
  error_message text,
  raw_response_retention_until timestamptz,
  raw_response jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (job_id, attempt_number),
  unique (id, job_id)
);

create index if not exists notice_analysis_runs_job_idx
  on public.notice_analysis_runs(job_id, attempt_number desc);

create index if not exists notice_analysis_runs_provider_created_idx
  on public.notice_analysis_runs(provider, created_at desc);

create table if not exists public.notice_analysis_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null,
  run_id uuid not null,
  notice_id uuid not null,
  revision_id uuid not null,
  result_status text not null check (
    result_status in ('validated', 'rejected', 'superseded')
  ),
  analysis_schema_version text not null,
  structured_result jsonb not null,
  result_fingerprint text not null check (result_fingerprint ~ '^[a-f0-9]{64}$'),
  validation_errors jsonb not null default '[]'::jsonb,
  confidence_summary jsonb not null default '{}'::jsonb,
  requires_human_review boolean not null default true,
  created_at timestamptz not null default now(),
  superseded_at timestamptz,
  unique (run_id),
  unique (run_id, result_fingerprint),
  foreign key (job_id) references public.notice_analysis_jobs(id) on delete cascade,
  foreign key (run_id) references public.notice_analysis_runs(id) on delete cascade,
  foreign key (notice_id) references public.ingestion_notices(id) on delete cascade,
  foreign key (revision_id) references public.ingestion_notice_revisions(id) on delete cascade,
  foreign key (run_id, job_id) references public.notice_analysis_runs(id, job_id),
  foreign key (job_id, notice_id, revision_id)
    references public.notice_analysis_jobs(id, notice_id, revision_id)
);

create index if not exists notice_analysis_results_revision_idx
  on public.notice_analysis_results(revision_id, created_at desc);

create index if not exists notice_analysis_results_job_idx
  on public.notice_analysis_results(job_id, created_at desc);

create table if not exists public.notice_analysis_evidence (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references public.notice_analysis_results(id) on delete cascade,
  field_path text not null,
  evidence_kind text not null check (
    evidence_kind in (
      'body_text',
      'attachment_text',
      'table_cell',
      'heading',
      'link',
      'date_expression',
      'model_inference',
      'admin_correction'
    )
  ),
  source_revision_id uuid references public.ingestion_notice_revisions(id) on delete set null,
  source_asset_id uuid references public.ingestion_notice_assets(id) on delete set null,
  source_locator text,
  quoted_text text,
  normalized_value jsonb,
  confidence numeric,
  evidence_fingerprint text not null check (evidence_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (result_id, field_path, evidence_fingerprint)
);

create index if not exists notice_analysis_evidence_result_idx
  on public.notice_analysis_evidence(result_id, field_path);

-- Append-only protections for validated semantic artifacts.
create or replace function public.notice_analysis_block_result_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    if new.job_id is distinct from old.job_id
       or new.run_id is distinct from old.run_id
       or new.notice_id is distinct from old.notice_id
       or new.revision_id is distinct from old.revision_id
       or new.structured_result is distinct from old.structured_result
       or new.result_fingerprint is distinct from old.result_fingerprint then
      raise exception 'notice_analysis_results immutable fields cannot change';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists notice_analysis_results_immutable on public.notice_analysis_results;
create trigger notice_analysis_results_immutable
before update on public.notice_analysis_results
for each row execute function public.notice_analysis_block_result_mutation();

create or replace function public.notice_analysis_block_evidence_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'notice_analysis_evidence is append-only';
end;
$$;

drop trigger if exists notice_analysis_evidence_append_only on public.notice_analysis_evidence;
create trigger notice_analysis_evidence_append_only
before update or delete on public.notice_analysis_evidence
for each row execute function public.notice_analysis_block_evidence_mutation();

-- Lease claim RPC: pending/retryable/expired leases only.
-- budget_deferred is never auto-claimed; attempt_count must be below max_attempts.
create or replace function public.claim_notice_analysis_jobs(
  p_worker_id text,
  p_limit integer default 1,
  p_lease_seconds integer default 300
)
returns setof public.notice_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claim_limit integer := greatest(coalesce(p_limit, 1), 1);
  lease_seconds integer := greatest(coalesce(p_lease_seconds, 300), 30);
begin
  if coalesce(nullif(trim(p_worker_id), ''), '') = '' then
    raise exception 'worker_id_required';
  end if;

  return query
  with candidates as (
    select j.id
    from public.notice_analysis_jobs j
    where j.attempt_count < j.max_attempts
      and (
        (
          j.status in ('pending', 'retryable_failed')
          and j.available_at <= now()
        )
        or (
          j.status in ('leased', 'running')
          and j.lease_expires_at is not null
          and j.lease_expires_at <= now()
        )
      )
    order by j.priority desc, j.available_at asc, j.created_at asc
    for update skip locked
    limit claim_limit
  ),
  updated as (
    update public.notice_analysis_jobs j
    set
      status = 'leased',
      leased_by = p_worker_id,
      leased_at = now(),
      lease_expires_at = now() + make_interval(secs => lease_seconds),
      attempt_count = j.attempt_count + 1,
      updated_at = now()
    from candidates c
    where j.id = c.id
    returning j.*
  )
  select * from updated;
end;
$$;

create or replace function public.complete_notice_analysis_job(
  p_job_id uuid,
  p_worker_id text
)
returns public.notice_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.notice_analysis_jobs;
  result_count integer;
  validated_run_count integer;
begin
  select count(*)::integer
  into result_count
  from public.notice_analysis_results r
  where r.job_id = p_job_id
    and r.result_status = 'validated'
    and exists (
      select 1
      from public.notice_analysis_jobs j
      where j.id = r.job_id
        and j.notice_id = r.notice_id
        and j.revision_id = r.revision_id
    );

  if coalesce(result_count, 0) < 1 then
    raise exception 'complete_notice_analysis_job_rejected_missing_validated_result';
  end if;

  select count(*)::integer
  into validated_run_count
  from public.notice_analysis_results r
  join public.notice_analysis_runs run
    on run.id = r.run_id
   and run.job_id = r.job_id
  where r.job_id = p_job_id
    and r.result_status = 'validated'
    and run.status = 'succeeded'
    and run.validation_status = 'validated'
    and run.finished_at is not null
    and exists (
      select 1
      from public.notice_analysis_jobs j
      where j.id = r.job_id
        and j.notice_id = r.notice_id
        and j.revision_id = r.revision_id
    );

  if coalesce(validated_run_count, 0) < 1 then
    raise exception 'complete_notice_analysis_job_rejected_run_not_validated';
  end if;

  update public.notice_analysis_jobs
  set
    status = 'succeeded',
    completed_at = now(),
    updated_at = now(),
    leased_by = null,
    lease_expires_at = null
  where id = p_job_id
    and leased_by = p_worker_id
    and status in ('leased', 'running')
    and lease_expires_at is not null
    and lease_expires_at > now()
  returning * into row;

  if row.id is null then
    raise exception 'complete_notice_analysis_job_rejected';
  end if;
  return row;
end;
$$;

create or replace function public.fail_notice_analysis_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_error_message text,
  p_retryable boolean default true,
  p_retry_delay_seconds integer default 60
)
returns public.notice_analysis_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.notice_analysis_jobs;
  terminal boolean;
begin
  select (not coalesce(p_retryable, true)) or (attempt_count >= max_attempts)
  into terminal
  from public.notice_analysis_jobs
  where id = p_job_id
    and leased_by = p_worker_id
    and status in ('leased', 'running')
    and lease_expires_at is not null
    and lease_expires_at > now()
  for update;

  if terminal is null then
    raise exception 'fail_notice_analysis_job_rejected';
  end if;

  update public.notice_analysis_jobs
  set
    status = case when terminal then 'terminal_failed' else 'retryable_failed' end,
    last_error_code = p_error_code,
    last_error_message = p_error_message,
    updated_at = now(),
    leased_by = null,
    lease_expires_at = null,
    available_at = case
      when terminal then now()
      else now() + make_interval(secs => greatest(coalesce(p_retry_delay_seconds, 60), 1))
    end,
    completed_at = case when terminal then now() else completed_at end
  where id = p_job_id
  returning * into row;

  return row;
end;
$$;

alter table public.notice_analysis_jobs enable row level security;
alter table public.notice_analysis_runs enable row level security;
alter table public.notice_analysis_results enable row level security;
alter table public.notice_analysis_evidence enable row level security;

drop policy if exists notice_analysis_jobs_admin_select on public.notice_analysis_jobs;
create policy notice_analysis_jobs_admin_select
on public.notice_analysis_jobs
for select
to authenticated
using (public.is_admin());

drop policy if exists notice_analysis_runs_admin_select on public.notice_analysis_runs;
create policy notice_analysis_runs_admin_select
on public.notice_analysis_runs
for select
to authenticated
using (public.is_admin());

drop policy if exists notice_analysis_results_admin_select on public.notice_analysis_results;
create policy notice_analysis_results_admin_select
on public.notice_analysis_results
for select
to authenticated
using (public.is_admin());

drop policy if exists notice_analysis_evidence_admin_select on public.notice_analysis_evidence;
create policy notice_analysis_evidence_admin_select
on public.notice_analysis_evidence
for select
to authenticated
using (public.is_admin());

grant select on public.notice_analysis_jobs to authenticated;
grant select on public.notice_analysis_runs to authenticated;
grant select on public.notice_analysis_results to authenticated;
grant select on public.notice_analysis_evidence to authenticated;

grant all on public.notice_analysis_jobs to service_role;
grant all on public.notice_analysis_runs to service_role;
grant all on public.notice_analysis_results to service_role;
grant all on public.notice_analysis_evidence to service_role;

revoke all on function public.claim_notice_analysis_jobs(text, integer, integer) from public;
revoke all on function public.complete_notice_analysis_job(uuid, text) from public;
revoke all on function public.fail_notice_analysis_job(uuid, text, text, text, boolean, integer) from public;
grant execute on function public.claim_notice_analysis_jobs(text, integer, integer) to service_role;
grant execute on function public.complete_notice_analysis_job(uuid, text) to service_role;
grant execute on function public.fail_notice_analysis_job(uuid, text, text, text, boolean, integer) to service_role;

commit;
