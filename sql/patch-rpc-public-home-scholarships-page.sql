create or replace function public.get_public_home_scholarships_page(
  p_page integer,
  p_page_size integer
)
returns jsonb
language sql
stable
as $$
with params as (
  select
    greatest(coalesce(p_page, 1), 1) as page,
    greatest(least(coalesce(p_page_size, 24), 50), 1) as page_size
),
ordered as (
  select
    s.id,
    s.name,
    s.organization,
    s.qual_university,
    s.institution_type,
    s.support_types,
    s.support_amount,
    s.support_amount_text,
    s.apply_end_date,
    s.poster_image_url,
    s.created_at,
    s.view_count,
    s.is_recommended,
    s.recommended_sort_order,
    row_number() over (
      order by
        s.is_recommended desc,
        s.recommended_sort_order asc nulls last,
        s.apply_end_date asc,
        s.id asc
    ) as rn
  from public.scholarships s
  where s.is_verified = true
    and s.list_on_home = true
    and s.apply_end_date >= (now() at time zone 'Asia/Seoul')::date
),
paged as (
  select o.*
  from ordered o
  cross join params p
  where o.rn > (p.page - 1) * p.page_size
    and o.rn <= p.page * p.page_size
),
scrap_counts as (
  select
    b.scholarship_id,
    count(*)::int as scrap_count
  from public.bookmarks b
  group by b.scholarship_id
),
rows_json as (
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'name', p.name,
        'organization', p.organization,
        'qual_university', p.qual_university,
        'institution_type', p.institution_type,
        'support_types', p.support_types,
        'support_amount', p.support_amount,
        'support_amount_text', p.support_amount_text,
        'apply_end_date', p.apply_end_date,
        'poster_image_url', p.poster_image_url,
        'created_at', p.created_at,
        'view_count', p.view_count,
        'is_recommended', p.is_recommended,
        'recommended_sort_order', p.recommended_sort_order,
        'scrap_count', coalesce(sc.scrap_count, 0)
      )
      order by p.rn
    ),
    '[]'::jsonb
  ) as rows
  from paged p
  left join scrap_counts sc on sc.scholarship_id = p.id
)
select jsonb_build_object(
  'page', params.page,
  'page_size', params.page_size,
  'total_count', (select count(*)::int from ordered),
  'rows', rows_json.rows
)
from params
cross join rows_json;
$$;
