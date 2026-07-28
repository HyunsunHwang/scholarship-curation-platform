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
    new.normalized_name || '|' || new.normalized_organization || '|' ||
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
set revision_identity_key = encode(digest(program_id::text || '|' || source_revision_id::text, 'sha256'), 'hex'),
    cycle_identity_key = case
      when cycle_year is not null
       and (nullif(public.scholarship_identity_normalize(academic_term), '') is not null
         or (application_start_at is not null and application_end_at is not null))
      then encode(digest(
        program_id::text || '|' || cycle_year::text || '|' ||
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
    new.program_id::text || '|' || new.source_revision_id::text, 'sha256'
  ), 'hex');
  new.cycle_identity_key := case
    when new.cycle_year is not null
     and (nullif(public.scholarship_identity_normalize(new.academic_term), '') is not null
       or (new.application_start_at is not null and new.application_end_at is not null))
    then encode(digest(
      new.program_id::text || '|' || new.cycle_year::text || '|' ||
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

commit;
