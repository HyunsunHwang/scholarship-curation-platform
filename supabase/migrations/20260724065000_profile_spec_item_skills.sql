-- Experience items: skills used during that experience
alter table public.profile_spec_items
  add column if not exists skills text[] null;

comment on column public.profile_spec_items.skills is
  'Skills used in this experience (catalog names).';
