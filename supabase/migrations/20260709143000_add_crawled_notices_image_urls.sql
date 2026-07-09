-- Crawl-time notice body image URLs (absolute).
-- Used to prefill original_notice_image_urls on admin review.

ALTER TABLE public.crawled_notices
  ADD COLUMN IF NOT EXISTS image_urls text[];

COMMENT ON COLUMN public.crawled_notices.image_urls IS
  'Absolute image URLs extracted from the notice detail page at crawl time.';
