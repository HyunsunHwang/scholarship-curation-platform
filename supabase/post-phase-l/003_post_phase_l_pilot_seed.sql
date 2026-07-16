-- Minimal reference seed for the fixed Post-Phase L pilot cohort.
-- Numeric IDs are compatibility evidence only; source_id is canonical identity.

begin;

insert into public.org_units(id, parent_id, unit_type, name, path_ids, legacy_table, legacy_id)
overriding system value
values
  (46, null, 'college', '언더우드국제대학', array[46]::bigint[], 'university_colleges', 53),
  (719, null, 'department', '경영학부', array[719]::bigint[], 'university_departments', 910),
  (720, null, 'department', '경제학부', array[720]::bigint[], 'university_departments', 509)
on conflict (id) do update
set unit_type = excluded.unit_type,
    name = excluded.name,
    path_ids = excluded.path_ids,
    legacy_table = excluded.legacy_table,
    legacy_id = excluded.legacy_id;

insert into public.notice_sources(
  id,
  source_id,
  university_slug,
  org_unit_id,
  source_level,
  source_name,
  college_name,
  department_name,
  list_url,
  base_url,
  link_selector,
  keywords,
  adapter,
  enabled,
  university_id,
  college_id,
  department_id,
  notes
)
overriding system value
values
  (
    1, 'cau_001', 'cau', 719, 'department', '중앙대 경영학부',
    '경영경제대학', '경영학부',
    'https://biz.cau.ac.kr/2016/sub06/sub06_01_list.php',
    'https://biz.cau.ac.kr', 'a[href]',
    '장학|장학금|학자금|등록금|scholarship|tuition|fellowship',
    null, true, 9, 136, 910,
    'Post-Phase L minimal pilot seed; source_id is canonical.'
  ),
  (
    2, 'cau_002', 'cau', 720, 'department', '중앙대 경제학부',
    '경영경제대학', '경제학부',
    'https://econ.cau.ac.kr/news/notice/',
    'https://econ.cau.ac.kr', 'a[href]',
    '장학|장학금|학자금|등록금|scholarship|tuition|fellowship',
    null, true, 9, 136, 509,
    'Post-Phase L minimal pilot seed; transport failure is not absence.'
  ),
  (
    547, 'yonsei_060', 'yonsei', 46, 'college', '연세대 언더우드국제대학',
    '언더우드국제대학', null,
    'https://uic.yonsei.ac.kr/main/news.php?mid=m06_01_01',
    'https://uic.yonsei.ac.kr', 'a[href]',
    '장학|장학금|학자금|등록금|scholarship|tuition|fellowship',
    null, true, 3, 53, null,
    'Post-Phase L minimal pilot seed; code selects the yonsei_uic strategy.'
  )
on conflict (source_id) do update
set university_slug = excluded.university_slug,
    org_unit_id = excluded.org_unit_id,
    source_level = excluded.source_level,
    source_name = excluded.source_name,
    college_name = excluded.college_name,
    department_name = excluded.department_name,
    list_url = excluded.list_url,
    base_url = excluded.base_url,
    link_selector = excluded.link_selector,
    keywords = excluded.keywords,
    adapter = excluded.adapter,
    enabled = excluded.enabled,
    university_id = excluded.university_id,
    college_id = excluded.college_id,
    department_id = excluded.department_id,
    notes = excluded.notes;

select setval(
  pg_get_serial_sequence('public.org_units', 'id'),
  greatest((select max(id) from public.org_units), 1),
  true
);
select setval(
  pg_get_serial_sequence('public.notice_sources', 'id'),
  greatest((select max(id) from public.notice_sources), 1),
  true
);

commit;
