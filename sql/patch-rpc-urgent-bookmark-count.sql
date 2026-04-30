create or replace function public.get_urgent_bookmark_count(
  p_user_id uuid,
  p_deadline_days integer default 6
)
returns integer
language sql
stable
as $$
  select count(*)::int
  from public.bookmarks b
  join public.scholarships s on s.id = b.scholarship_id
  where b.user_id = p_user_id
    and s.apply_end_date >= (now() at time zone 'Asia/Seoul')::date
    and s.apply_end_date <= ((now() at time zone 'Asia/Seoul')::date + greatest(coalesce(p_deadline_days, 6), 0));
$$;
