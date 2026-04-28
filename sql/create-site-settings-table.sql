-- 헤더 로고 URL 저장용 테이블 (오류: Could not find the table 'public.site_settings')
-- Supabase → SQL Editor → 아래 전체 실행 → Run

create table if not exists public.site_settings (
  id smallint primary key default 1 constraint site_settings_singleton check (id = 1),
  header_logo_url text,
  updated_at timestamptz not null default now()
);

comment on table public.site_settings is '공개 사이트 설정(헤더 로고 등). 누구나 읽기, 관리자만 쓰기.';

insert into public.site_settings (id) values (1)
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "site_settings_select_public" on public.site_settings;
create policy "site_settings_select_public"
  on public.site_settings for select
  using (true);

drop policy if exists "site_settings_admin_write" on public.site_settings;
create policy "site_settings_admin_write"
  on public.site_settings for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "site_settings_admin_update" on public.site_settings;
create policy "site_settings_admin_update"
  on public.site_settings for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "site_settings_admin_delete" on public.site_settings;
create policy "site_settings_admin_delete"
  on public.site_settings for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
