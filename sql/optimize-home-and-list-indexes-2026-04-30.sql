-- Home and admin scholarship list performance indexes
-- Safe to run repeatedly with IF NOT EXISTS.

create index if not exists idx_scholarships_home_listing
  on public.scholarships (
    apply_end_date asc,
    is_recommended desc,
    recommended_sort_order asc
  )
  where is_verified = true and list_on_home = true;

create index if not exists idx_scholarships_admin_created_at
  on public.scholarships (created_at desc, id desc);

create index if not exists idx_bookmarks_user_created
  on public.bookmarks (user_id, created_at desc);

create index if not exists idx_bookmarks_scholarship
  on public.bookmarks (scholarship_id);
