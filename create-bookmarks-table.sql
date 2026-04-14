-- bookmarks 테이블 생성
CREATE TABLE IF NOT EXISTS public.bookmarks (
  id         bigserial PRIMARY KEY,
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scholarship_id bigint NOT NULL REFERENCES public.scholarships(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, scholarship_id)
);

-- RLS 활성화
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

-- 유저는 자신의 북마크만 조회/추가/삭제 가능
CREATE POLICY "Users can view own bookmarks"
  ON public.bookmarks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own bookmarks"
  ON public.bookmarks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own bookmarks"
  ON public.bookmarks FOR DELETE
  USING (auth.uid() = user_id);
