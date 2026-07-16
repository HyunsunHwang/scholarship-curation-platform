-- Phase B: 서버측 최근 조회(browse_events) — 기기 간 "이어서 보기"용

create table if not exists public.browse_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  user_id uuid not null references auth.users (id) on delete cascade,
  content_kind text not null
    check (content_kind in ('scholarship', 'contest', 'education', 'activity')),
  content_id bigint not null,
  name text not null default '',
  organization text not null default '',
  poster_image_url text null,
  apply_end_date date null,
  dwell_ms integer null,
  page_path text null,
  created_at timestamptz not null default now(),
  constraint browse_events_user_content_unique unique (user_id, content_kind, content_id)
);

create index if not exists idx_browse_events_user_time
  on public.browse_events (user_id, occurred_at desc);

create index if not exists idx_browse_events_content
  on public.browse_events (content_kind, content_id, occurred_at desc);

alter table public.browse_events enable row level security;

drop policy if exists "browse_events_select_own" on public.browse_events;
create policy "browse_events_select_own"
  on public.browse_events
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "browse_events_insert_own" on public.browse_events;
create policy "browse_events_insert_own"
  on public.browse_events
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "browse_events_update_own" on public.browse_events;
create policy "browse_events_update_own"
  on public.browse_events
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "browse_events_delete_own" on public.browse_events;
create policy "browse_events_delete_own"
  on public.browse_events
  for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.track_browse_event(
  p_content_kind text,
  p_content_id bigint,
  p_name text default '',
  p_organization text default '',
  p_poster_image_url text default null,
  p_apply_end_date date default null,
  p_dwell_ms integer default null,
  p_page_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  if p_content_kind is null
     or p_content_kind not in ('scholarship', 'contest', 'education', 'activity')
     or p_content_id is null then
    return;
  end if;

  insert into public.browse_events (
    user_id,
    content_kind,
    content_id,
    name,
    organization,
    poster_image_url,
    apply_end_date,
    dwell_ms,
    page_path,
    occurred_at
  )
  values (
    v_uid,
    p_content_kind,
    p_content_id,
    coalesce(p_name, ''),
    coalesce(p_organization, ''),
    p_poster_image_url,
    p_apply_end_date,
    p_dwell_ms,
    p_page_path,
    now()
  )
  on conflict (user_id, content_kind, content_id)
  do update set
    name = excluded.name,
    organization = excluded.organization,
    poster_image_url = excluded.poster_image_url,
    apply_end_date = excluded.apply_end_date,
    dwell_ms = coalesce(excluded.dwell_ms, browse_events.dwell_ms),
    page_path = coalesce(excluded.page_path, browse_events.page_path),
    occurred_at = now();
end;
$$;

revoke all on function public.track_browse_event(
  text, bigint, text, text, text, date, integer, text
) from public, anon;
grant execute on function public.track_browse_event(
  text, bigint, text, text, text, date, integer, text
) to authenticated;

create or replace function public.get_recent_browse_events(
  p_limit integer default 24
)
returns setof public.browse_events
language sql
stable
security definer
set search_path = public
as $$
  select *
  from public.browse_events
  where user_id = auth.uid()
  order by occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 48));
$$;

revoke all on function public.get_recent_browse_events(integer) from public, anon;
grant execute on function public.get_recent_browse_events(integer) to authenticated;
