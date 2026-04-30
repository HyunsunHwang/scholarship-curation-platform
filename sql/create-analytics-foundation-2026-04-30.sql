-- Analytics foundation (raw events + daily marts)
-- Purpose: accumulate important product data safely over time.

create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  event_name text not null,
  user_id uuid null,
  session_id text null,
  page_path text null,
  scholarship_id bigint null references public.scholarships(id) on delete set null,
  search_query text null,
  sort_key text null,
  scope_filter text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_events_occurred_at
  on public.analytics_events (occurred_at desc);
create index if not exists idx_analytics_events_event_name_time
  on public.analytics_events (event_name, occurred_at desc);
create index if not exists idx_analytics_events_user_time
  on public.analytics_events (user_id, occurred_at desc);
create index if not exists idx_analytics_events_scholarship_time
  on public.analytics_events (scholarship_id, occurred_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists "insert_analytics_events_anon_and_auth" on public.analytics_events;
create policy "insert_analytics_events_anon_and_auth"
  on public.analytics_events
  for insert
  to anon, authenticated
  with check (true);

create table if not exists public.analytics_daily_kpi (
  metric_date date primary key,
  page_view_count integer not null default 0,
  unique_user_count integer not null default 0,
  search_count integer not null default 0,
  bookmark_toggle_count integer not null default 0,
  scholarship_open_count integer not null default 0,
  apply_click_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.analytics_scholarship_daily_kpi (
  metric_date date not null,
  scholarship_id bigint not null references public.scholarships(id) on delete cascade,
  detail_view_count integer not null default 0,
  bookmark_toggle_count integer not null default 0,
  apply_click_count integer not null default 0,
  unique_user_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (metric_date, scholarship_id)
);

create index if not exists idx_analytics_scholarship_daily_kpi_scholarship
  on public.analytics_scholarship_daily_kpi (scholarship_id, metric_date desc);

create table if not exists public.analytics_search_term_daily (
  metric_date date not null,
  search_query text not null,
  search_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (metric_date, search_query)
);

create or replace function public.track_analytics_event(
  p_event_name text,
  p_page_path text default null,
  p_scholarship_id bigint default null,
  p_search_query text default null,
  p_sort_key text default null,
  p_scope_filter text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
begin
  insert into public.analytics_events (
    event_name,
    user_id,
    page_path,
    scholarship_id,
    search_query,
    sort_key,
    scope_filter,
    metadata
  )
  values (
    p_event_name,
    auth.uid(),
    p_page_path,
    p_scholarship_id,
    p_search_query,
    p_sort_key,
    p_scope_filter,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

grant execute on function public.track_analytics_event(
  text, text, bigint, text, text, text, jsonb
) to anon, authenticated;

create or replace function public.refresh_analytics_daily(
  p_target_date date default ((now() at time zone 'Asia/Seoul')::date - 1)
)
returns void
language plpgsql
as $$
begin
  insert into public.analytics_daily_kpi (
    metric_date,
    page_view_count,
    unique_user_count,
    search_count,
    bookmark_toggle_count,
    scholarship_open_count,
    apply_click_count,
    updated_at
  )
  select
    p_target_date as metric_date,
    count(*) filter (where e.event_name = 'page_view')::int as page_view_count,
    count(distinct e.user_id)::int as unique_user_count,
    count(*) filter (where e.event_name = 'search_submitted')::int as search_count,
    count(*) filter (where e.event_name = 'bookmark_toggled')::int as bookmark_toggle_count,
    count(*) filter (where e.event_name = 'scholarship_opened')::int as scholarship_open_count,
    count(*) filter (where e.event_name = 'apply_clicked')::int as apply_click_count,
    now() as updated_at
  from public.analytics_events e
  where (e.occurred_at at time zone 'Asia/Seoul')::date = p_target_date
  on conflict (metric_date) do update
  set
    page_view_count = excluded.page_view_count,
    unique_user_count = excluded.unique_user_count,
    search_count = excluded.search_count,
    bookmark_toggle_count = excluded.bookmark_toggle_count,
    scholarship_open_count = excluded.scholarship_open_count,
    apply_click_count = excluded.apply_click_count,
    updated_at = now();

  insert into public.analytics_scholarship_daily_kpi (
    metric_date,
    scholarship_id,
    detail_view_count,
    bookmark_toggle_count,
    apply_click_count,
    unique_user_count,
    updated_at
  )
  select
    p_target_date as metric_date,
    e.scholarship_id,
    count(*) filter (where e.event_name = 'scholarship_opened')::int as detail_view_count,
    count(*) filter (where e.event_name = 'bookmark_toggled')::int as bookmark_toggle_count,
    count(*) filter (where e.event_name = 'apply_clicked')::int as apply_click_count,
    count(distinct e.user_id)::int as unique_user_count,
    now() as updated_at
  from public.analytics_events e
  where (e.occurred_at at time zone 'Asia/Seoul')::date = p_target_date
    and e.scholarship_id is not null
  group by e.scholarship_id
  on conflict (metric_date, scholarship_id) do update
  set
    detail_view_count = excluded.detail_view_count,
    bookmark_toggle_count = excluded.bookmark_toggle_count,
    apply_click_count = excluded.apply_click_count,
    unique_user_count = excluded.unique_user_count,
    updated_at = now();

  insert into public.analytics_search_term_daily (
    metric_date,
    search_query,
    search_count,
    updated_at
  )
  select
    p_target_date as metric_date,
    e.search_query,
    count(*)::int as search_count,
    now() as updated_at
  from public.analytics_events e
  where (e.occurred_at at time zone 'Asia/Seoul')::date = p_target_date
    and e.event_name = 'search_submitted'
    and e.search_query is not null
    and btrim(e.search_query) <> ''
  group by e.search_query
  on conflict (metric_date, search_query) do update
  set
    search_count = excluded.search_count,
    updated_at = now();
end;
$$;

grant execute on function public.refresh_analytics_daily(date) to service_role;
