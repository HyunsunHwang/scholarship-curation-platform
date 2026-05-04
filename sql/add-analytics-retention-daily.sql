-- Retention daily mart (cohort-based D1/D3/D7)
-- Run in Supabase SQL editor.

create table if not exists public.analytics_retention_daily (
  cohort_date date primary key,
  cohort_size integer not null default 0,
  d1_return_users integer not null default 0,
  d3_return_users integer not null default 0,
  d7_return_users integer not null default 0,
  d1_retention_rate numeric(5,2) not null default 0,
  d3_retention_rate numeric(5,2) not null default 0,
  d7_retention_rate numeric(5,2) not null default 0,
  updated_at timestamptz not null default now()
);

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

  -- Cohort retention (D1 / D3 / D7)
  with first_seen as (
    select
      e.user_id,
      min((e.occurred_at at time zone 'Asia/Seoul')::date) as cohort_date
    from public.analytics_events e
    where e.user_id is not null
      and (e.occurred_at at time zone 'Asia/Seoul')::date <= p_target_date
    group by e.user_id
  ),
  activity as (
    select distinct
      e.user_id,
      (e.occurred_at at time zone 'Asia/Seoul')::date as activity_date
    from public.analytics_events e
    where e.user_id is not null
      and (e.occurred_at at time zone 'Asia/Seoul')::date <= p_target_date
  ),
  joined as (
    select
      f.user_id,
      f.cohort_date,
      (a.activity_date - f.cohort_date) as day_diff
    from first_seen f
    join activity a on a.user_id = f.user_id
  )
  insert into public.analytics_retention_daily (
    cohort_date,
    cohort_size,
    d1_return_users,
    d3_return_users,
    d7_return_users,
    d1_retention_rate,
    d3_retention_rate,
    d7_retention_rate,
    updated_at
  )
  select
    j.cohort_date,
    count(distinct j.user_id) filter (where j.day_diff = 0)::int as cohort_size,
    count(distinct j.user_id) filter (where j.day_diff = 1)::int as d1_return_users,
    count(distinct j.user_id) filter (where j.day_diff = 3)::int as d3_return_users,
    count(distinct j.user_id) filter (where j.day_diff = 7)::int as d7_return_users,
    round(
      100.0 * count(distinct j.user_id) filter (where j.day_diff = 1)
      / nullif(count(distinct j.user_id) filter (where j.day_diff = 0), 0),
      2
    )::numeric(5,2) as d1_retention_rate,
    round(
      100.0 * count(distinct j.user_id) filter (where j.day_diff = 3)
      / nullif(count(distinct j.user_id) filter (where j.day_diff = 0), 0),
      2
    )::numeric(5,2) as d3_retention_rate,
    round(
      100.0 * count(distinct j.user_id) filter (where j.day_diff = 7)
      / nullif(count(distinct j.user_id) filter (where j.day_diff = 0), 0),
      2
    )::numeric(5,2) as d7_retention_rate,
    now()
  from joined j
  group by j.cohort_date
  on conflict (cohort_date) do update
  set
    cohort_size = excluded.cohort_size,
    d1_return_users = excluded.d1_return_users,
    d3_return_users = excluded.d3_return_users,
    d7_return_users = excluded.d7_return_users,
    d1_retention_rate = excluded.d1_retention_rate,
    d3_retention_rate = excluded.d3_retention_rate,
    d7_retention_rate = excluded.d7_retention_rate,
    updated_at = now();
end;
$$;
