-- 상세 페이지 조회수 증가를 원자적으로 처리하는 RPC
-- 기존 select->update 방식의 동시성 유실(lost update)을 방지합니다.

create or replace function public.increment_scholarship_view_count(
  p_scholarship_id integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  update public.scholarships
  set view_count = coalesce(view_count, 0) + 1
  where id = p_scholarship_id
  returning view_count into v_next;

  return coalesce(v_next, 0);
end;
$$;

revoke all on function public.increment_scholarship_view_count(integer) from public;
grant execute on function public.increment_scholarship_view_count(integer) to anon;
grant execute on function public.increment_scholarship_view_count(integer) to authenticated;
