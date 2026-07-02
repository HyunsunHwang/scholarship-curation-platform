-- ══════════════════════════════════════════════════════════════════════════
-- org_units Phase 1: 대학-단과대-(학부)-학과 트리 테이블 생성 + 기존 데이터 백필
--
-- 목적:
--   universities / university_colleges / university_departments 고정 3단 구조를
--   parent_id 트리 하나(org_units)로 통합한다.
--   · 깊이 가변 (대학→단과대→학과, 대학→단과대→학부→학과 모두 허용)
--   · 프로필은 "가장 구체적으로 아는 노드" 하나만 가리킴 (1학년 = 단과대 노드 가능)
--
-- 실행: Supabase SQL Editor 에서 전체 실행 (여러 번 실행해도 안전)
-- 주의: 기존 테이블/컬럼은 삭제하지 않음 (Phase 2 전환 완료 후 별도 정리)
-- ══════════════════════════════════════════════════════════════════════════


-- ── 1. enum: 노드 유형 ─────────────────────────────────────────────────────
-- UI 표시/필터용. 부모-자식 타입 전이는 강제하지 않는다
-- (단과대 바로 아래 학과 등 학부 생략 케이스가 흔하므로).

do $$
begin
  if not exists (select 1 from pg_type where typname = 'org_unit_type') then
    create type public.org_unit_type as enum
      ('university', 'college', 'division', 'department');
  end if;
end $$;


-- ── 2. org_units 테이블 ────────────────────────────────────────────────────

create table if not exists public.org_units (
  id           bigint generated always as identity primary key,
  parent_id    bigint null references public.org_units(id) on delete restrict,
  unit_type    public.org_unit_type not null,
  name         text not null,
  -- 루트(대학)부터 자기 자신까지의 id 배열. 트리거로 자동 유지.
  -- "타겟 노드가 내 조상인가" = target_id = any(path_ids) 한 번으로 판정 가능.
  path_ids     bigint[] not null default '{}',
  -- 교외 장학금 계열 매칭용 코드 (Phase 2에서 학과 노드에 부여)
  -- 표준 7대 계열 권장: 인문 / 사회 / 교육 / 공학 / 자연 / 의약 / 예체능
  field_code   text null,
  -- 기존 3개 테이블에서 이관된 행 추적용 (백필 멱등성 + 프로필 이관 조인 키)
  legacy_table text null,
  legacy_id    bigint null,
  created_at   timestamptz not null default now(),
  unique (parent_id, name)
);

comment on table public.org_units is
  '대학-단과대-(학부)-학과 계층 트리. parent_id 인접 리스트 + path_ids 조상 배열.';
comment on column public.org_units.path_ids is
  '루트부터 자기 자신까지의 조상 id 배열 (자기 포함). 트리거가 자동 유지.';

-- 루트(대학) 이름 중복 방지: unique(parent_id, name)은 NULL parent 를 구분 못 함
create unique index if not exists uq_org_units_root_name
  on public.org_units (name) where parent_id is null;

-- 백필 멱등성 보장
create unique index if not exists uq_org_units_legacy
  on public.org_units (legacy_table, legacy_id)
  where legacy_table is not null;

create index if not exists idx_org_units_parent_id on public.org_units (parent_id);
-- 서브트리 매칭(= any / && 연산) 최적화
create index if not exists idx_org_units_path_ids on public.org_units using gin (path_ids);


-- ── 3. path_ids 자동 유지 트리거 ────────────────────────────────────────────

-- 3-1. insert/parent 변경 시 자기 자신의 path 계산 (+순환 참조 방지)
create or replace function public.org_units_set_path()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.parent_id is not distinct from old.parent_id then
    return new;
  end if;

  if new.parent_id is null then
    new.path_ids := array[new.id];
  else
    -- 자기 자신/자기 후손 밑으로 이동 금지 (순환 방지)
    if tg_op = 'UPDATE' and exists (
      select 1 from public.org_units p
      where p.id = new.parent_id and new.id = any(p.path_ids)
    ) then
      raise exception 'org_units: 순환 참조 - 노드 %를 자신의 하위(%) 아래로 이동할 수 없습니다',
        new.id, new.parent_id;
    end if;

    select p.path_ids || new.id into new.path_ids
    from public.org_units p where p.id = new.parent_id;

    if new.path_ids is null then
      raise exception 'org_units: parent_id % 가 존재하지 않습니다', new.parent_id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_org_units_set_path on public.org_units;
create trigger trg_org_units_set_path
  before insert or update of parent_id on public.org_units
  for each row execute function public.org_units_set_path();

-- 3-2. 노드 이동 시 모든 후손의 path 접두어 갱신
--      (후손 path = 이동한 노드의 새 path || 이동 노드 이후의 기존 suffix)
create or replace function public.org_units_repath_descendants()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  update public.org_units c
  set path_ids = new.path_ids
                 || c.path_ids[array_position(c.path_ids, new.id) + 1 :]
  where new.id = any(c.path_ids)
    and c.id <> new.id;
  return null;
end;
$$;

drop trigger if exists trg_org_units_repath_descendants on public.org_units;
create trigger trg_org_units_repath_descendants
  after update of parent_id on public.org_units
  for each row
  when (old.parent_id is distinct from new.parent_id)
  execute function public.org_units_repath_descendants();


-- ── 4. 별칭 테이블 (크롤러 표기 변형 → 노드 매핑) ──────────────────────────
-- 예: "중앙대" / "중앙대학교" → 같은 대학 노드.
-- 크롤러 코드(GROUP_ALIASES)에 하드코딩된 변형을 데이터로 옮기는 목적.
-- 별칭 텍스트 자체는 대학이 다르면 중복될 수 있으므로(예: "경영학부")
-- 조회 시 반드시 대학 서브트리로 범위를 좁혀서 사용할 것.

create table if not exists public.org_unit_aliases (
  id          bigint generated always as identity primary key,
  org_unit_id bigint not null references public.org_units(id) on delete cascade,
  alias       text not null,
  created_at  timestamptz not null default now(),
  unique (org_unit_id, alias)
);

create index if not exists idx_org_unit_aliases_alias on public.org_unit_aliases (alias);


-- ── 5. RLS: 공개 참조 데이터 (누구나 읽기, 관리자만 쓰기) ───────────────────

alter table public.org_units enable row level security;
alter table public.org_unit_aliases enable row level security;

drop policy if exists "org_units_select_public" on public.org_units;
create policy "org_units_select_public"
  on public.org_units for select using (true);

drop policy if exists "org_units_admin_insert" on public.org_units;
create policy "org_units_admin_insert"
  on public.org_units for insert with check (public.is_admin());

drop policy if exists "org_units_admin_update" on public.org_units;
create policy "org_units_admin_update"
  on public.org_units for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "org_units_admin_delete" on public.org_units;
create policy "org_units_admin_delete"
  on public.org_units for delete using (public.is_admin());

drop policy if exists "org_unit_aliases_select_public" on public.org_unit_aliases;
create policy "org_unit_aliases_select_public"
  on public.org_unit_aliases for select using (true);

drop policy if exists "org_unit_aliases_admin_insert" on public.org_unit_aliases;
create policy "org_unit_aliases_admin_insert"
  on public.org_unit_aliases for insert with check (public.is_admin());

drop policy if exists "org_unit_aliases_admin_update" on public.org_unit_aliases;
create policy "org_unit_aliases_admin_update"
  on public.org_unit_aliases for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "org_unit_aliases_admin_delete" on public.org_unit_aliases;
create policy "org_unit_aliases_admin_delete"
  on public.org_unit_aliases for delete using (public.is_admin());


-- ── 6. 기존 3개 테이블 → org_units 백필 ────────────────────────────────────
-- not exists 가드로 재실행해도 중복 생성 없음 (멱등).

-- 6-1. 대학 (루트 노드)
insert into public.org_units (parent_id, unit_type, name, legacy_table, legacy_id)
select null, 'university', u.name, 'universities', u.id
from public.universities u
where not exists (
  select 1 from public.org_units ou
  where ou.legacy_table = 'universities' and ou.legacy_id = u.id
);

-- 6-2. 단과대 (대학의 자식)
insert into public.org_units (parent_id, unit_type, name, legacy_table, legacy_id)
select pu.id, 'college', c.name, 'university_colleges', c.id
from public.university_colleges c
join public.org_units pu
  on pu.legacy_table = 'universities' and pu.legacy_id = c.university_id
where not exists (
  select 1 from public.org_units ou
  where ou.legacy_table = 'university_colleges' and ou.legacy_id = c.id
);

-- 6-3. 학과 (단과대의 자식)
--      ※ "학부" 계층은 지금 만들지 않는다. 필요해지는 대학부터
--        division 노드를 삽입하고 해당 학과들의 parent_id만 옮기면 됨.
insert into public.org_units (parent_id, unit_type, name, legacy_table, legacy_id)
select pc.id, 'department', d.name, 'university_departments', d.id
from public.university_departments d
join public.org_units pc
  on pc.legacy_table = 'university_colleges' and pc.legacy_id = d.college_id
where not exists (
  select 1 from public.org_units ou
  where ou.legacy_table = 'university_departments' and ou.legacy_id = d.id
);

-- 6-4. 대학 별칭 시드 (크롤러 GROUP_ALIASES와 동일한 표기 변형)
insert into public.org_unit_aliases (org_unit_id, alias)
select ou.id, a.alias
from (values
  ('중앙대학교',     '중앙대'),
  ('이화여자대학교', '이화여대'),
  ('한양대학교',     '한양대'),
  ('홍익대학교',     '홍익대'),
  ('경희대학교',     '경희대'),
  ('고려대학교',     '고려대'),
  ('성균관대학교',   '성균관대'),
  ('서울시립대학교', '서울시립대'),
  ('서울시립대학교', '시립대'),
  ('연세대학교',     '연세대')
) as a(univ_name, alias)
join public.org_units ou
  on ou.parent_id is null and ou.name = a.univ_name
on conflict (org_unit_id, alias) do nothing;


-- ── 7. profiles 에 org_unit 참조 추가 + 백필 ───────────────────────────────
-- 기존 university_id / college_id / department_id 는 유지 (Phase 2 안정화 후 정리).
-- 백필 우선순위: 학과 > 단과대 > 대학 (가장 구체적으로 아는 노드).

alter table public.profiles
  add column if not exists org_unit_id bigint null references public.org_units(id),
  add column if not exists double_major_org_unit_id bigint null references public.org_units(id);

comment on column public.profiles.org_unit_id is
  '소속 org_unit (가장 구체적으로 확정된 노드). 1학년 등 학과 미정이면 단과대 노드 가능.';

update public.profiles p
set org_unit_id = ou.id
from public.org_units ou
where p.org_unit_id is null
  and (
    (p.department_id is not null
      and ou.legacy_table = 'university_departments' and ou.legacy_id = p.department_id)
    or (p.department_id is null and p.college_id is not null
      and ou.legacy_table = 'university_colleges' and ou.legacy_id = p.college_id)
    or (p.department_id is null and p.college_id is null and p.university_id is not null
      and ou.legacy_table = 'universities' and ou.legacy_id = p.university_id)
  );

update public.profiles p
set double_major_org_unit_id = ou.id
from public.org_units ou
where p.double_major_org_unit_id is null
  and (
    (p.double_major_department_id is not null
      and ou.legacy_table = 'university_departments' and ou.legacy_id = p.double_major_department_id)
    or (p.double_major_department_id is null and p.double_major_college_id is not null
      and ou.legacy_table = 'university_colleges' and ou.legacy_id = p.double_major_college_id)
  );

create index if not exists idx_profiles_org_unit_id
  on public.profiles (org_unit_id);
create index if not exists idx_profiles_double_major_org_unit_id
  on public.profiles (double_major_org_unit_id);


-- ── 8. 검증 ────────────────────────────────────────────────────────────────
-- ① 노드 수가 기존 테이블 합과 일치하는지
select
  (select count(*) from public.universities)
    + (select count(*) from public.university_colleges)
    + (select count(*) from public.university_departments) as legacy_total,
  (select count(*) from public.org_units)                  as org_units_total;

-- ② path_ids 정합성 (자기 id로 끝나지 않는 행 = 0 이어야 함)
select count(*) as broken_paths
from public.org_units
where path_ids[cardinality(path_ids)] is distinct from id;

-- ③ 프로필 백필 결과: 기존 FK가 있는데 org_unit_id 못 채운 행 = 0 이어야 함
select count(*) as unmapped_profiles
from public.profiles
where org_unit_id is null
  and coalesce(department_id, college_id, university_id) is not null;
