-- Phase C: item-item 협업 필터링 (북마크 공출현) + 코호트 폴백

create or replace function public.get_collaborative_scholarship_ids(
  p_limit integer default 16
)
returns table (
  scholarship_id bigint,
  score double precision,
  source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 16), 32));
  v_today date := (timezone('Asia/Seoul', now()))::date;
  v_school text;
begin
  if v_uid is null then
    return;
  end if;

  -- 1) item-item: 나와 같은 장학금을 저장한 사용자가 함께 저장한 공고
  return query
  with my_items as (
    select b.scholarship_id
    from public.bookmarks b
    where b.user_id = v_uid
  ),
  neighbors as (
    select distinct b.user_id
    from public.bookmarks b
    join my_items m on m.scholarship_id = b.scholarship_id
    where b.user_id <> v_uid
  ),
  scored as (
    select
      b.scholarship_id,
      count(*)::double precision as score
    from public.bookmarks b
    join neighbors n on n.user_id = b.user_id
    where not exists (
      select 1 from my_items m where m.scholarship_id = b.scholarship_id
    )
    group by b.scholarship_id
  )
  select
    s.scholarship_id,
    s.score,
    'item_item'::text as source
  from scored s
  join public.scholarships sch on sch.id = s.scholarship_id
  where sch.is_verified = true
    and sch.apply_end_date >= v_today
  order by s.score desc, sch.view_count desc nulls last
  limit v_limit;

  if found then
    return;
  end if;

  -- 2) 폴백: 동일 학교 코호트의 인기 저장 공고
  select nullif(trim(p.school_name), '') into v_school
  from public.profiles p
  where p.id = v_uid;

  if v_school is not null then
    return query
    with cohort as (
      select p.id
      from public.profiles p
      where p.school_name = v_school
        and p.id <> v_uid
    ),
    scored as (
      select
        b.scholarship_id,
        count(*)::double precision as score
      from public.bookmarks b
      join cohort c on c.id = b.user_id
      where not exists (
        select 1
        from public.bookmarks mine
        where mine.user_id = v_uid
          and mine.scholarship_id = b.scholarship_id
      )
      group by b.scholarship_id
    )
    select
      s.scholarship_id,
      s.score,
      'cohort_school'::text as source
    from scored s
    join public.scholarships sch on sch.id = s.scholarship_id
    where sch.is_verified = true
      and sch.apply_end_date >= v_today
    order by s.score desc, sch.view_count desc nulls last
    limit v_limit;
  end if;
end;
$$;

revoke all on function public.get_collaborative_scholarship_ids(integer)
  from public, anon;
grant execute on function public.get_collaborative_scholarship_ids(integer)
  to authenticated;

create or replace function public.get_collaborative_contest_ids(
  p_limit integer default 16
)
returns table (
  contest_id bigint,
  score double precision,
  source text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 16), 32));
  v_today date := (timezone('Asia/Seoul', now()))::date;
begin
  if v_uid is null then
    return;
  end if;

  return query
  with my_items as (
    select b.contest_id
    from public.contest_bookmarks b
    where b.user_id = v_uid
  ),
  neighbors as (
    select distinct b.user_id
    from public.contest_bookmarks b
    join my_items m on m.contest_id = b.contest_id
    where b.user_id <> v_uid
  ),
  scored as (
    select
      b.contest_id,
      count(*)::double precision as score
    from public.contest_bookmarks b
    join neighbors n on n.user_id = b.user_id
    where not exists (
      select 1 from my_items m where m.contest_id = b.contest_id
    )
    group by b.contest_id
  )
  select
    s.contest_id,
    s.score,
    'item_item'::text as source
  from scored s
  join public.contests c on c.id = s.contest_id
  where c.is_verified = true
    and coalesce(c.apply_end_date, '2099-12-31'::date) >= v_today
  order by s.score desc, c.view_count desc nulls last
  limit v_limit;
end;
$$;

revoke all on function public.get_collaborative_contest_ids(integer)
  from public, anon;
grant execute on function public.get_collaborative_contest_ids(integer)
  to authenticated;
