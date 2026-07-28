-- Unit 2: reviewed Program/Cycle canonical domain and review-safe scholarships projection.
-- Additive only. Depends on 004 and 005.

begin;

do $$
begin
  perform public.post_phase_l_assert_environment();
  if to_regclass('public.notice_analysis_results') is null
     or to_regclass('public.notice_analysis_review_events') is null then
    raise exception 'Unit 1 migrations 004 and 005 are required';
  end if;
  if to_regclass('public.scholarships') is null then
    raise exception 'scholarships compatibility table is required';
  end if;
end
$$;

create table if not exists public.scholarship_programs (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (btrim(canonical_name) <> ''),
  normalized_name text not null check (btrim(normalized_name) <> ''),
  operating_organization text,
  funding_organization text,
  description text,
  status text not null default 'active' check (status in ('active', 'inactive', 'superseded')),
  created_from_proposal_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scholarship_programs_name_org_idx
  on public.scholarship_programs(normalized_name, operating_organization);

create table if not exists public.scholarship_program_aliases (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.scholarship_programs(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  normalized_alias text not null check (btrim(normalized_alias) <> ''),
  alias_kind text not null check (alias_kind in ('canonical', 'historical', 'source_observed')),
  source_proposal_id uuid,
  created_at timestamptz not null default now(),
  unique (program_id, normalized_alias)
);

create index if not exists scholarship_program_aliases_lookup_idx
  on public.scholarship_program_aliases(normalized_alias);

create table if not exists public.scholarship_program_cycle_proposals (
  id uuid primary key,
  analysis_result_id uuid not null references public.notice_analysis_results(id) on delete cascade,
  analysis_review_event_id uuid not null references public.notice_analysis_review_events(id) on delete cascade,
  notice_id uuid not null references public.ingestion_notices(id) on delete cascade,
  revision_id uuid not null references public.ingestion_notice_revisions(id) on delete cascade,
  proposed_program jsonb not null,
  proposed_cycle jsonb not null,
  suggested_existing_program_id uuid references public.scholarship_programs(id),
  suggested_existing_cycle_id uuid,
  duplicate_candidates jsonb not null default '[]'::jsonb,
  evidence_snapshot jsonb not null default '[]'::jsonb,
  source_snapshot jsonb not null default '{}'::jsonb,
  confidence jsonb not null default '{}'::jsonb,
  proposal_fingerprint text not null check (proposal_fingerprint ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'needs_revision', 'rejected')),
  canonical_program_id uuid references public.scholarship_programs(id),
  canonical_cycle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (analysis_review_event_id),
  unique (proposal_fingerprint)
);

create table if not exists public.scholarship_cycles (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.scholarship_programs(id) on delete cascade,
  cycle_label text not null check (btrim(cycle_label) <> ''),
  cycle_year integer,
  academic_term text,
  application_start_at date,
  application_end_at date,
  benefits jsonb not null default '[]'::jsonb,
  eligibility jsonb not null default '[]'::jsonb,
  target_scope jsonb,
  required_documents jsonb not null default '[]'::jsonb,
  application_method text,
  application_url text,
  source_detail_url text,
  source_notice_id uuid not null references public.ingestion_notices(id),
  source_revision_id uuid not null references public.ingestion_notice_revisions(id),
  canonical_status text not null default 'approved'
    check (canonical_status in ('approved', 'superseded', 'cancelled')),
  publication_status text not null default 'review_safe'
    check (publication_status in ('review_safe', 'projected_hidden', 'published', 'withdrawn')),
  idempotency_key text not null,
  created_from_proposal_id uuid not null references public.scholarship_program_cycle_proposals(id),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (program_id, source_revision_id)
);

alter table public.scholarship_program_cycle_proposals
  drop constraint if exists scholarship_program_cycle_proposals_suggested_existing_cycle_id_fkey;
alter table public.scholarship_program_cycle_proposals
  add constraint scholarship_program_cycle_proposals_suggested_existing_cycle_id_fkey
  foreign key (suggested_existing_cycle_id) references public.scholarship_cycles(id);
alter table public.scholarship_program_cycle_proposals
  drop constraint if exists scholarship_program_cycle_proposals_canonical_cycle_id_fkey;
alter table public.scholarship_program_cycle_proposals
  add constraint scholarship_program_cycle_proposals_canonical_cycle_id_fkey
  foreign key (canonical_cycle_id) references public.scholarship_cycles(id);
alter table public.scholarship_programs
  drop constraint if exists scholarship_programs_created_from_proposal_id_fkey;
alter table public.scholarship_programs
  add constraint scholarship_programs_created_from_proposal_id_fkey
  foreign key (created_from_proposal_id)
  references public.scholarship_program_cycle_proposals(id);
alter table public.scholarship_program_aliases
  drop constraint if exists scholarship_program_aliases_source_proposal_id_fkey;
alter table public.scholarship_program_aliases
  add constraint scholarship_program_aliases_source_proposal_id_fkey
  foreign key (source_proposal_id)
  references public.scholarship_program_cycle_proposals(id);

create table if not exists public.scholarship_proposal_review_events (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.scholarship_program_cycle_proposals(id) on delete cascade,
  decision text not null check (decision in (
    'approve_new_program_and_cycle',
    'approve_existing_program_new_cycle',
    'approve_existing_program_existing_cycle',
    'needs_revision',
    'reject'
  )),
  actor_id uuid not null references auth.users(id),
  program_id uuid references public.scholarship_programs(id),
  cycle_id uuid references public.scholarship_cycles(id),
  program_patch jsonb not null default '{}'::jsonb,
  cycle_patch jsonb not null default '{}'::jsonb,
  reason text,
  event_idempotency_key text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.scholarship_projection_links (
  id uuid primary key default gen_random_uuid(),
  cycle_id uuid not null references public.scholarship_cycles(id) on delete restrict unique,
  scholarship_id bigint not null references public.scholarships(id) on delete restrict unique,
  source_kind text not null default 'canonical_projection'
    check (source_kind = 'canonical_projection'),
  projection_status text not null default 'review_safe'
    check (projection_status in ('review_safe', 'published', 'conflict', 'withdrawn')),
  projection_fingerprint text not null check (projection_fingerprint ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.preserve_scholarship_proposal_immutable_fields()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.analysis_result_id is distinct from old.analysis_result_id
     or new.analysis_review_event_id is distinct from old.analysis_review_event_id
     or new.notice_id is distinct from old.notice_id
     or new.revision_id is distinct from old.revision_id
     or new.proposed_program is distinct from old.proposed_program
     or new.proposed_cycle is distinct from old.proposed_cycle
     or new.source_snapshot is distinct from old.source_snapshot
     or new.evidence_snapshot is distinct from old.evidence_snapshot
     or new.proposal_fingerprint is distinct from old.proposal_fingerprint then
    raise exception 'scholarship proposal immutable fields cannot change';
  end if;
  return new;
end;
$$;
drop trigger if exists scholarship_proposal_immutable_fields
  on public.scholarship_program_cycle_proposals;
create trigger scholarship_proposal_immutable_fields
before update on public.scholarship_program_cycle_proposals
for each row execute function public.preserve_scholarship_proposal_immutable_fields();

create or replace function public.notice_analysis_effective_output_is_valid(
  p_output jsonb,
  p_notice_id uuid,
  p_revision_id uuid
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select jsonb_typeof(p_output) = 'object'
    and p_output ?& array[
      'lineage', 'notice_classification', 'program', 'cycle', 'organizations',
      'benefits', 'application', 'eligibility_conditions', 'required_documents',
      'important_cautions', 'unresolved_fields', 'evidence'
    ]
    and p_output->'lineage'->>'notice_id' = p_notice_id::text
    and p_output->'lineage'->>'revision_id' = p_revision_id::text
    and jsonb_typeof(p_output->'evidence') = 'array'
    and jsonb_typeof(p_output->'program') = 'object'
    and jsonb_typeof(p_output->'cycle') = 'object';
$$;

-- Replaces the Unit 1 RPC with an additional DB-side approve validation guard.
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
  effective_output jsonb;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  if p_decision not in ('approve', 'reject', 'needs_revision', 'reanalysis_requested') then
    raise exception 'invalid_review_decision';
  end if;
  select * into result_row from public.notice_analysis_results where id = p_result_id;
  if result_row.id is null or result_row.result_status <> 'validated' then
    raise exception 'validated_analysis_result_required';
  end if;
  effective_output := coalesce(p_corrected_output, result_row.structured_result);
  if p_decision = 'approve' and not public.notice_analysis_effective_output_is_valid(
    effective_output, result_row.notice_id, result_row.revision_id
  ) then
    raise exception 'approve_effective_output_schema_or_lineage_invalid';
  end if;
  insert into public.notice_analysis_review_events (
    result_id, notice_id, revision_id, reviewer_id, decision,
    original_result_fingerprint, corrected_output, effective_output,
    correction_fingerprint, reason, event_idempotency_key
  ) values (
    result_row.id, result_row.notice_id, result_row.revision_id, auth.uid(), p_decision,
    result_row.result_fingerprint, p_corrected_output, effective_output,
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

create or replace function public.approve_scholarship_program_cycle_proposal(
  p_proposal_id uuid,
  p_decision text,
  p_existing_program_id uuid,
  p_existing_cycle_id uuid,
  p_program_patch jsonb,
  p_cycle_patch jsonb,
  p_reason text,
  p_event_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal_row public.scholarship_program_cycle_proposals;
  analysis_review public.notice_analysis_review_events;
  prior_event public.scholarship_proposal_review_events;
  program_row public.scholarship_programs;
  cycle_row public.scholarship_cycles;
  program_data jsonb;
  cycle_data jsonb;
  logical_key text;
begin
  if not public.is_admin() then raise exception 'admin_required'; end if;
  select * into prior_event from public.scholarship_proposal_review_events
    where event_idempotency_key = p_event_idempotency_key;
  if prior_event.id is not null then
    return jsonb_build_object('replayed', true, 'program_id', prior_event.program_id,
      'cycle_id', prior_event.cycle_id, 'event_id', prior_event.id);
  end if;
  select * into proposal_row from public.scholarship_program_cycle_proposals
    where id = p_proposal_id for update;
  if proposal_row.id is null or proposal_row.status <> 'pending' then
    raise exception 'pending_proposal_required';
  end if;
  select * into analysis_review from public.notice_analysis_review_events
    where id = proposal_row.analysis_review_event_id;
  if analysis_review.decision <> 'approve'
     or analysis_review.result_id <> proposal_row.analysis_result_id
     or analysis_review.notice_id <> proposal_row.notice_id
     or analysis_review.revision_id <> proposal_row.revision_id
     or not public.notice_analysis_effective_output_is_valid(
       analysis_review.effective_output, proposal_row.notice_id, proposal_row.revision_id
     ) then
    raise exception 'approved_analysis_review_lineage_required';
  end if;
  if p_decision in ('needs_revision', 'reject') then
    update public.scholarship_program_cycle_proposals
      set status = case when p_decision = 'reject' then 'rejected' else 'needs_revision' end,
          updated_at = now()
      where id = proposal_row.id;
    insert into public.scholarship_proposal_review_events (
      proposal_id, decision, actor_id, reason, event_idempotency_key
    ) values (proposal_row.id, p_decision, auth.uid(), p_reason, p_event_idempotency_key)
    returning * into prior_event;
    return jsonb_build_object('replayed', false, 'event_id', prior_event.id);
  end if;

  program_data := proposal_row.proposed_program || coalesce(p_program_patch, '{}'::jsonb);
  cycle_data := proposal_row.proposed_cycle || coalesce(p_cycle_patch, '{}'::jsonb);
  if coalesce(btrim(program_data->>'canonical_name'), '') = ''
     or coalesce(btrim(cycle_data->>'cycle_label'), '') = '' then
    raise exception 'program_name_and_cycle_label_required';
  end if;
  if p_decision = 'approve_new_program_and_cycle' then
    insert into public.scholarship_programs (
      canonical_name, normalized_name, operating_organization, funding_organization,
      description, created_from_proposal_id, created_by
    ) values (
      program_data->>'canonical_name', program_data->>'normalized_name',
      program_data->>'operating_organization', program_data->>'funding_organization',
      program_data->>'description', proposal_row.id, auth.uid()
    ) returning * into program_row;
    insert into public.scholarship_program_aliases (
      program_id, alias, normalized_alias, alias_kind, source_proposal_id
    ) values (
      program_row.id, program_row.canonical_name, program_row.normalized_name,
      'canonical', proposal_row.id
    ) on conflict (program_id, normalized_alias) do nothing;
  else
    select * into program_row from public.scholarship_programs
      where id = p_existing_program_id for update;
    if program_row.id is null then raise exception 'target_program_not_found'; end if;
  end if;

  if p_decision = 'approve_existing_program_existing_cycle' then
    select * into cycle_row from public.scholarship_cycles
      where id = p_existing_cycle_id and program_id = program_row.id for update;
    if cycle_row.id is null then raise exception 'target_cycle_not_found'; end if;
  else
    logical_key := encode(digest(
      program_row.id::text || '|' || proposal_row.revision_id::text || '|'
      || coalesce(cycle_data->>'cycle_label', ''), 'sha256'
    ), 'hex');
    insert into public.scholarship_cycles (
      program_id, cycle_label, cycle_year, academic_term,
      application_start_at, application_end_at, benefits, eligibility,
      target_scope, required_documents, application_method, application_url,
      source_detail_url,
      source_notice_id, source_revision_id, idempotency_key,
      created_from_proposal_id, created_by
    ) values (
      program_row.id, cycle_data->>'cycle_label', (cycle_data->>'cycle_year')::integer,
      cycle_data->>'academic_term', (cycle_data->>'application_start_at')::date,
      (cycle_data->>'application_end_at')::date, coalesce(cycle_data->'benefits', '[]'),
      coalesce(cycle_data->'eligibility', '[]'), cycle_data->'target_scope',
      coalesce(cycle_data->'required_documents', '[]'), cycle_data->>'application_method',
      cycle_data->>'application_url', cycle_data->>'source_detail_url',
      proposal_row.notice_id, proposal_row.revision_id,
      logical_key, proposal_row.id, auth.uid()
    )
    on conflict (idempotency_key) do update set idempotency_key = excluded.idempotency_key
    returning * into cycle_row;
  end if;

  update public.scholarship_program_cycle_proposals
    set status = 'approved', canonical_program_id = program_row.id,
        canonical_cycle_id = cycle_row.id, updated_at = now()
    where id = proposal_row.id;
  insert into public.scholarship_proposal_review_events (
    proposal_id, decision, actor_id, program_id, cycle_id, program_patch,
    cycle_patch, reason, event_idempotency_key
  ) values (
    proposal_row.id, p_decision, auth.uid(), program_row.id, cycle_row.id,
    coalesce(p_program_patch, '{}'), coalesce(p_cycle_patch, '{}'),
    p_reason, p_event_idempotency_key
  ) returning * into prior_event;
  return jsonb_build_object('replayed', false, 'program_id', program_row.id,
    'cycle_id', cycle_row.id, 'event_id', prior_event.id);
end;
$$;

create or replace function public.project_scholarship_cycle(
  p_cycle_id uuid,
  p_projection_fingerprint text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cycle_row public.scholarship_cycles;
  program_row public.scholarship_programs;
  link_row public.scholarship_projection_links;
  scholarship_id bigint;
  amount_text text;
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'admin_or_service_role_required';
  end if;
  select * into link_row from public.scholarship_projection_links
    where cycle_id = p_cycle_id;
  if link_row.id is not null then
    return jsonb_build_object('replayed', true, 'scholarship_id', link_row.scholarship_id,
      'link_id', link_row.id);
  end if;
  select * into cycle_row from public.scholarship_cycles where id = p_cycle_id for update;
  if cycle_row.id is null or cycle_row.canonical_status <> 'approved' then
    raise exception 'approved_cycle_required';
  end if;
  if cycle_row.application_start_at is null or cycle_row.application_end_at is null
     or coalesce(btrim(cycle_row.application_url), '') = '' then
    raise exception 'projection_required_fields_missing';
  end if;
  select * into program_row from public.scholarship_programs where id = cycle_row.program_id;
  if exists (
    select 1 from public.scholarships s
    where s.name = program_row.canonical_name and s.apply_url = cycle_row.application_url
      and not exists (
        select 1 from public.scholarship_projection_links l where l.scholarship_id = s.id
      )
  ) then raise exception 'manual_scholarship_collision'; end if;
  select string_agg(value->>'amount_text', ', ')
    into amount_text from jsonb_array_elements(cycle_row.benefits) value
    where nullif(value->>'amount_text', '') is not null;
  insert into public.scholarships (
    name, organization, scholarship_type, institution_type, support_types,
    support_amount_text, apply_start_date, apply_end_date, qual_university,
    qual_major, qual_enrollment_status, qual_extra_requirements,
    required_documents, apply_method, apply_url, homepage_url,
    is_verified, list_on_home
  ) values (
    program_row.canonical_name,
    coalesce(program_row.operating_organization, program_row.funding_organization, '미상'),
    'on_campus', '기타',
    array(
      select distinct case value->>'type'
        when 'tuition' then '등록금'
        when 'cash' then '생활비'
        when 'living_expense' then '생활비'
        when 'activity' then '학업장려금'
        when 'in_kind' then '기타'
        when 'other' then '기타'
        else null
      end
      from jsonb_array_elements(cycle_row.benefits) value
      where value->>'type' <> 'unknown'
    ),
    amount_text,
    cycle_row.application_start_at, cycle_row.application_end_at,
    case when cycle_row.target_scope ? 'universities'
      then array(select jsonb_array_elements_text(cycle_row.target_scope->'universities')) end,
    case when cycle_row.target_scope ? 'majors'
      then array(select jsonb_array_elements_text(cycle_row.target_scope->'majors')) end,
    case when cycle_row.target_scope ? 'enrollment_statuses'
      then array(select jsonb_array_elements_text(cycle_row.target_scope->'enrollment_statuses')) end,
    array(select jsonb_array_elements_text(cycle_row.eligibility)),
    array(select jsonb_array_elements_text(cycle_row.required_documents)),
    coalesce(cycle_row.application_method, ''), cycle_row.application_url,
    coalesce(cycle_row.source_detail_url, cycle_row.application_url), false, false
  ) returning id into scholarship_id;
  insert into public.scholarship_projection_links (
    cycle_id, scholarship_id, projection_fingerprint
  ) values (cycle_row.id, scholarship_id, p_projection_fingerprint)
  returning * into link_row;
  update public.scholarship_cycles set publication_status = 'projected_hidden',
    updated_at = now() where id = cycle_row.id;
  return jsonb_build_object('replayed', false, 'scholarship_id', scholarship_id,
    'link_id', link_row.id, 'public', false);
end;
$$;

-- Append-only review events.
create or replace function public.block_scholarship_proposal_review_mutation()
returns trigger language plpgsql set search_path = public as $$
begin raise exception 'scholarship_proposal_review_events is append-only'; end;
$$;
drop trigger if exists scholarship_proposal_review_events_append_only
  on public.scholarship_proposal_review_events;
create trigger scholarship_proposal_review_events_append_only
before update or delete on public.scholarship_proposal_review_events
for each row execute function public.block_scholarship_proposal_review_mutation();

drop trigger if exists scholarship_programs_set_updated_at on public.scholarship_programs;
create trigger scholarship_programs_set_updated_at before update on public.scholarship_programs
for each row execute function public.set_updated_at();
drop trigger if exists scholarship_cycles_set_updated_at on public.scholarship_cycles;
create trigger scholarship_cycles_set_updated_at before update on public.scholarship_cycles
for each row execute function public.set_updated_at();
drop trigger if exists scholarship_proposals_set_updated_at on public.scholarship_program_cycle_proposals;
create trigger scholarship_proposals_set_updated_at before update on public.scholarship_program_cycle_proposals
for each row execute function public.set_updated_at();

alter table public.scholarship_programs enable row level security;
alter table public.scholarship_program_aliases enable row level security;
alter table public.scholarship_cycles enable row level security;
alter table public.scholarship_program_cycle_proposals enable row level security;
alter table public.scholarship_proposal_review_events enable row level security;
alter table public.scholarship_projection_links enable row level security;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'scholarship_programs', 'scholarship_program_aliases', 'scholarship_cycles',
    'scholarship_program_cycle_proposals', 'scholarship_proposal_review_events',
    'scholarship_projection_links'
  ] loop
    execute format(
      'drop policy if exists %I on public.%I',
      table_name || '_admin_select', table_name
    );
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_admin())',
      table_name || '_admin_select', table_name
    );
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end
$$;

revoke all on function public.approve_scholarship_program_cycle_proposal(
  uuid, text, uuid, uuid, jsonb, jsonb, text, text
) from public;
grant execute on function public.approve_scholarship_program_cycle_proposal(
  uuid, text, uuid, uuid, jsonb, jsonb, text, text
) to authenticated;
revoke all on function public.project_scholarship_cycle(uuid, text) from public;
grant execute on function public.project_scholarship_cycle(uuid, text)
to authenticated, service_role;
revoke all on function public.record_notice_analysis_review(uuid, text, jsonb, text, text)
from public;
grant execute on function public.record_notice_analysis_review(uuid, text, jsonb, text, text)
to authenticated;

commit;
