-- Post-Phase L non-production compatibility baseline.
-- Target: scholarship-curation-post-phase-l only.
-- This is not a production migration and does not claim full target-schema parity.

begin;

-- POST_PHASE_L_FRESH_PROJECT_ASSERTION_BEGIN
do $$
declare
  existing_relations text[];
begin
  select array_agg(candidate.name order by candidate.name)
  into existing_relations
  from unnest(array[
    'profiles',
    'universities',
    'org_units',
    'notice_sources',
    'scholarships',
    'scholarship_selection_stages',
    'crawled_notices',
    'crawled_contests',
    'bookmarks',
    'site_settings',
    'post_phase_l_environment_guard'
  ]::text[]) as candidate(name)
  where to_regclass(format('public.%I', candidate.name)) is not null;

  if coalesce(cardinality(existing_relations), 0) > 0 then
    raise exception
      'POST_PHASE_L_FRESH_PROJECT_REQUIRED: existing public application relations: %',
      array_to_string(existing_relations, ', ');
  end if;
end
$$;
-- POST_PHASE_L_FRESH_PROJECT_ASSERTION_END

create table public.post_phase_l_environment_guard (
  id smallint primary key default 1 check (id = 1),
  project_ref text not null check (project_ref = 'hrayfvdggbhfmmzfblly'),
  environment_kind text not null check (environment_kind = 'non_production'),
  automatic_public_publish_enabled boolean not null default false
    check (automatic_public_publish_enabled = false),
  created_at timestamptz not null default now()
);

insert into public.post_phase_l_environment_guard(
  id,
  project_ref,
  environment_kind,
  automatic_public_publish_enabled
)
values (1, 'hrayfvdggbhfmmzfblly', 'non_production', false);

create or replace function public.post_phase_l_assert_environment()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.post_phase_l_environment_guard
    where id = 1
      and project_ref = 'hrayfvdggbhfmmzfblly'
      and environment_kind = 'non_production'
      and automatic_public_publish_enabled = false
  ) then
    raise exception 'Post-Phase L environment guard is missing or invalid';
  end if;
end;
$$;

create or replace function public.post_phase_l_block_environment_guard_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'Post-Phase L environment guard is immutable; % is prohibited', tg_op;
end;
$$;

create trigger post_phase_l_environment_guard_immutable
before update or delete on public.post_phase_l_environment_guard
for each row execute function public.post_phase_l_block_environment_guard_mutation();

alter table public.post_phase_l_environment_guard enable row level security;
create policy post_phase_l_environment_guard_select
on public.post_phase_l_environment_guard
for select to authenticated using (true);

revoke all on public.post_phase_l_environment_guard from public, anon, authenticated, service_role;
grant select on public.post_phase_l_environment_guard to authenticated, service_role;
revoke all on function public.post_phase_l_assert_environment() from public;
grant execute on function public.post_phase_l_assert_environment() to authenticated, service_role;

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'notice_source_level') then
    create type public.notice_source_level as enum ('university', 'college', 'department');
  end if;
  if not exists (select 1 from pg_type where typname = 'org_unit_type') then
    create type public.org_unit_type as enum ('university', 'college', 'division', 'department');
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null default 'user' check (role in ('user', 'admin')),
  name text,
  is_onboarded boolean not null default false,
  is_org_manager boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.post_phase_l_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles(id, email, role, name)
  values (
    new.id,
    coalesce(new.email, ''),
    'user',
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'name', '')), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists post_phase_l_auth_user_profile on auth.users;
create trigger post_phase_l_auth_user_profile
after insert on auth.users
for each row execute function public.post_phase_l_handle_new_auth_user();

create table if not exists public.universities (
  id bigint generated by default as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.org_units (
  id bigint generated always as identity primary key,
  parent_id bigint references public.org_units(id) on delete set null,
  unit_type public.org_unit_type not null,
  name text not null,
  path_ids bigint[] not null default '{}',
  field_code text,
  legacy_table text,
  legacy_id bigint,
  created_at timestamptz not null default now()
);

create index if not exists org_units_parent_id_idx on public.org_units(parent_id);

create table if not exists public.notice_sources (
  id bigint generated always as identity primary key,
  source_id text not null unique,
  university_slug text not null check (university_slug ~ '^[a-z0-9_]+$'),
  org_unit_id bigint references public.org_units(id) on delete set null,
  source_level public.notice_source_level not null default 'department',
  source_name text not null,
  college_name text,
  department_name text,
  list_url text not null check (list_url ~* '^https?://'),
  base_url text,
  list_item_selector text,
  link_selector text,
  title_selector text,
  date_selector text,
  detail_content_selector text,
  detail_date_selector text,
  notice_url_pattern text,
  keywords text,
  adapter text,
  enabled boolean not null default true,
  university_id bigint,
  college_id bigint,
  department_id bigint,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notice_sources_enabled_slug_idx
  on public.notice_sources(enabled, university_slug);
create index if not exists notice_sources_org_unit_id_idx
  on public.notice_sources(org_unit_id);
create index if not exists notice_sources_university_slug_idx
  on public.notice_sources(university_slug);

drop trigger if exists trg_notice_sources_updated_at on public.notice_sources;
create trigger trg_notice_sources_updated_at
before update on public.notice_sources
for each row execute function public.set_updated_at();

create table if not exists public.scholarships (
  id bigserial primary key,
  name text not null,
  organization text not null,
  scholarship_type text not null default 'on_campus'
    check (scholarship_type in ('on_campus', 'off_campus')),
  institution_type text not null default '기타',
  support_types text[] not null default '{}',
  support_amount_text text,
  view_count bigint not null default 0,
  apply_start_date date not null,
  apply_end_date date not null,
  announcement_date date,
  selection_count integer,
  qual_university text[],
  qual_school_location text[],
  qual_school_category text[],
  qual_academic_year integer[],
  qual_enrollment_status text[],
  qual_major text[],
  qual_field_codes text[],
  qual_gpa_min numeric,
  qual_gpa_last_semester_min numeric,
  qual_last_semester_earned_credits_min numeric,
  qual_income_level_min integer,
  qual_income_level_max integer,
  qual_household_size_max integer,
  qual_gender text,
  qual_age_min integer,
  qual_age_max integer,
  qual_region text[],
  qual_nationality text,
  qual_admission_type text[],
  qual_parent_cohabitation text,
  qual_parent_region text[],
  qual_special_info text[],
  qual_extra_requirements text[],
  qual_parent_occupation text[],
  qual_military_status text,
  can_overlap boolean not null default false,
  required_documents text[] not null default '{}',
  apply_method text not null default '',
  apply_url text not null,
  homepage_url text,
  contact text,
  note text,
  selection_note text,
  poster_image_url text,
  original_notice_image_url text,
  original_notice_image_urls text[],
  original_notice_text text,
  collected_at timestamptz not null default now(),
  is_verified boolean not null default false,
  list_on_home boolean not null default false,
  is_advertisement boolean not null default false,
  ad_job_role text,
  ad_required_skills text[],
  ad_location text,
  is_recommended boolean not null default false,
  recommended_sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists scholarships_verified_deadline_idx
  on public.scholarships(is_verified, apply_end_date);
create index if not exists scholarships_admin_created_at_idx
  on public.scholarships(created_at desc, id desc);

drop trigger if exists trg_scholarships_updated_at on public.scholarships;
create trigger trg_scholarships_updated_at
before update on public.scholarships
for each row execute function public.set_updated_at();

create table if not exists public.scholarship_selection_stages (
  id bigint generated always as identity primary key,
  scholarship_id bigint not null references public.scholarships(id) on delete cascade,
  stage_order smallint not null check (stage_order > 0),
  title text not null check (btrim(title) <> ''),
  phase text not null default 'selection'
    check (phase in ('selection', 'post_acceptance')),
  schedule_date date,
  schedule_text text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scholarship_id, stage_order)
);

create index if not exists scholarship_selection_stages_scholarship_id_idx
  on public.scholarship_selection_stages(scholarship_id);

drop trigger if exists trg_scholarship_selection_stages_updated_at
  on public.scholarship_selection_stages;
create trigger trg_scholarship_selection_stages_updated_at
before update on public.scholarship_selection_stages
for each row execute function public.set_updated_at();

create table if not exists public.crawled_notices (
  id bigint generated always as identity primary key,
  source_group text not null default 'unknown',
  source_id text not null default '',
  source_name text not null default '',
  title text not null,
  notice_url text not null unique,
  notice_posted_at date,
  raw_date_text text,
  body text,
  scholarship_type text not null default 'on_campus'
    check (scholarship_type in ('on_campus', 'off_campus')),
  status text not null default 'new'
    check (status in ('new', 'promoted', 'rejected')),
  scholarship_id bigint references public.scholarships(id) on delete set null,
  extracted_draft jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text,
  run_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  image_urls text[]
);

create index if not exists crawled_notices_source_group_idx
  on public.crawled_notices(source_group);
create index if not exists crawled_notices_status_idx
  on public.crawled_notices(status, first_seen_at desc);

drop trigger if exists trg_crawled_notices_updated_at on public.crawled_notices;
create trigger trg_crawled_notices_updated_at
before update on public.crawled_notices
for each row execute function public.set_updated_at();

create table if not exists public.crawled_contests (
  id bigint generated always as identity primary key,
  status text not null default 'new' check (status in ('new', 'promoted', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.bookmarks (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  scholarship_id bigint not null references public.scholarships(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, scholarship_id)
);

create table if not exists public.site_settings (
  id smallint primary key default 1 check (id = 1),
  header_logo_url text,
  updated_at timestamptz not null default now()
);

insert into public.site_settings(id) values (1) on conflict (id) do nothing;

create or replace function public.get_scholarship_scrap_counts(p_scholarship_ids integer[])
returns table(scholarship_id bigint, scrap_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  select b.scholarship_id, count(*)::bigint
  from public.bookmarks b
  where b.scholarship_id = any(p_scholarship_ids::bigint[])
  group by b.scholarship_id;
$$;

create or replace function public.increment_scholarship_view_count(p_scholarship_id integer)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count bigint;
begin
  update public.scholarships
  set view_count = view_count + 1
  where id = p_scholarship_id
  returning view_count into next_count;
  return coalesce(next_count, 0);
end;
$$;

alter table public.profiles enable row level security;
alter table public.universities enable row level security;
alter table public.org_units enable row level security;
alter table public.notice_sources enable row level security;
alter table public.scholarships enable row level security;
alter table public.scholarship_selection_stages enable row level security;
alter table public.crawled_notices enable row level security;
alter table public.crawled_contests enable row level security;
alter table public.bookmarks enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists profiles_self_or_admin_select on public.profiles;
create policy profiles_self_or_admin_select on public.profiles
for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_self_or_admin_update on public.profiles;
create policy profiles_self_or_admin_update on public.profiles
for update to authenticated using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists universities_public_select on public.universities;
create policy universities_public_select on public.universities
for select to anon, authenticated using (true);
drop policy if exists org_units_public_select on public.org_units;
create policy org_units_public_select on public.org_units
for select to anon, authenticated using (true);

drop policy if exists notice_sources_select_public on public.notice_sources;
create policy notice_sources_select_public on public.notice_sources
for select to anon, authenticated using (true);
drop policy if exists notice_sources_insert_admin on public.notice_sources;
create policy notice_sources_insert_admin on public.notice_sources
for insert to authenticated with check (public.is_admin());
drop policy if exists notice_sources_update_admin on public.notice_sources;
create policy notice_sources_update_admin on public.notice_sources
for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists notice_sources_delete_admin on public.notice_sources;
create policy notice_sources_delete_admin on public.notice_sources
for delete to authenticated using (public.is_admin());

drop policy if exists scholarships_public_read on public.scholarships;
create policy scholarships_public_read on public.scholarships
for select to public using (is_verified = true);
drop policy if exists scholarships_admin_all on public.scholarships;
create policy scholarships_admin_all on public.scholarships
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists scholarship_selection_stages_public_select
  on public.scholarship_selection_stages;
create policy scholarship_selection_stages_public_select
on public.scholarship_selection_stages
for select to public using (
  exists (
    select 1 from public.scholarships s
    where s.id = scholarship_id and s.is_verified = true
  )
);
drop policy if exists scholarship_selection_stages_admin_all
  on public.scholarship_selection_stages;
create policy scholarship_selection_stages_admin_all
on public.scholarship_selection_stages
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists crawled_notices_admin_all on public.crawled_notices;
create policy crawled_notices_admin_all on public.crawled_notices
for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists crawled_contests_admin_select on public.crawled_contests;
create policy crawled_contests_admin_select on public.crawled_contests
for select to authenticated using (public.is_admin());

drop policy if exists bookmarks_owner_all on public.bookmarks;
create policy bookmarks_owner_all on public.bookmarks
for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists site_settings_public_select on public.site_settings;
create policy site_settings_public_select on public.site_settings
for select to anon, authenticated using (true);
drop policy if exists site_settings_admin_update on public.site_settings;
create policy site_settings_admin_update on public.site_settings
for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant usage on schema public to anon, authenticated, service_role;
grant select on public.universities, public.org_units, public.notice_sources,
  public.scholarships, public.scholarship_selection_stages, public.site_settings
  to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.notice_sources,
  public.scholarships, public.scholarship_selection_stages, public.crawled_notices,
  public.crawled_contests, public.bookmarks, public.site_settings to authenticated;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.get_scholarship_scrap_counts(integer[]) to anon, authenticated;
grant execute on function public.increment_scholarship_view_count(integer) to anon, authenticated;

commit;
