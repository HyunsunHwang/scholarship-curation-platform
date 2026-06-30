-- 광고/채용 공고를 장학금 카드/상세에 함께 노출하기 위한 확장
-- 1) scholarships 테이블에 광고 전용 컬럼 추가
-- 2) 홈 페이지 페이징 RPC에 is_advertisement 포함

alter table public.scholarships
  add column if not exists is_advertisement boolean not null default false,
  add column if not exists ad_job_role text,
  add column if not exists ad_required_skills text[],
  add column if not exists ad_location text;

comment on column public.scholarships.is_advertisement is '목록에서 추천 뱃지 대신 광고 뱃지를 표시하고, 상세를 광고 템플릿으로 렌더링';
comment on column public.scholarships.ad_job_role is '광고/채용 공고용 모집 직무';
comment on column public.scholarships.ad_required_skills is '광고/채용 공고용 요구 역량 목록';
comment on column public.scholarships.ad_location is '광고/채용 공고용 소재지';

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
    s.is_advertisement,
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
    and coalesce(array_length(s.qual_university, 1), 0) = 0
    and not exists (
      select 1
      from public.universities u
      where char_length(trim(u.name)) >= 3
        and position(lower(trim(u.name)) in lower(s.name || ' ' || s.organization)) > 0
    )
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
        'is_advertisement', p.is_advertisement,
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
