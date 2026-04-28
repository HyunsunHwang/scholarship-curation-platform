-- "Bucket not found" 해결: 프로덕션 Supabase → SQL Editor에서 이 파일만 실행해도 됩니다.
-- (site_settings 테이블은 이미 있다고 가정하고 Storage 버킷 + 정책만 적용)

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
