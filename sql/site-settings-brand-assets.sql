-- 사이트 공개 설정(헤더 로고 URL) + 브랜드 이미지 Storage
-- Supabase SQL Editor에서 실행하거나 마이그레이션으로 적용하세요.

-- 1) 테이블 (단일 행 id = 1)
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

-- 2) Storage 버킷 (공개 읽기)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'brand-assets',
  'brand-assets',
  true,
  5242880,
  array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 기존 정책 제거 후 재생성 (재실행 안전)
drop policy if exists "brand_assets_public_select" on storage.objects;
drop policy if exists "brand_assets_admin_insert" on storage.objects;
drop policy if exists "brand_assets_admin_update" on storage.objects;
drop policy if exists "brand_assets_admin_delete" on storage.objects;

create policy "brand_assets_public_select"
  on storage.objects for select
  using (bucket_id = 'brand-assets');

create policy "brand_assets_admin_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'brand-assets'
    and name like 'header-logo/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "brand_assets_admin_update"
  on storage.objects for update
  using (
    bucket_id = 'brand-assets'
    and name like 'header-logo/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    bucket_id = 'brand-assets'
    and name like 'header-logo/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

create policy "brand_assets_admin_delete"
  on storage.objects for delete
  using (
    bucket_id = 'brand-assets'
    and name like 'header-logo/%'
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );
