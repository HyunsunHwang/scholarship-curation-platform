alter table public.scholarships
  add column if not exists original_notice_image_url text,
  add column if not exists original_notice_image_urls text[],
  add column if not exists original_notice_text text;

comment on column public.scholarships.original_notice_image_url is
  'Original scholarship notice image URL uploaded by the source institution';

comment on column public.scholarships.original_notice_image_urls is
  'Original scholarship notice image URLs uploaded by the source institution';

comment on column public.scholarships.original_notice_text is
  'Original scholarship notice text copied from the source institution';

update public.scholarships
set original_notice_image_urls = array[original_notice_image_url]
where original_notice_image_url is not null
  and original_notice_image_url <> ''
  and (original_notice_image_urls is null or cardinality(original_notice_image_urls) = 0);
