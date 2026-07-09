-- notice_sources: 학과/단과대/대학 공지 게시판 크롤 설정.
-- org_units = 조직 트리, notice_sources = 게시판(URL+크롤설정).
-- CSV(data/notice-sources*.csv)는 당분간 동기화 입력/백업으로 유지.
--
-- Applied remotely via Supabase MCP as migration `create_notice_sources`.

CREATE TYPE public.notice_source_level AS ENUM (
  'university',
  'college',
  'department'
);

CREATE TABLE public.notice_sources (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text NOT NULL,
  university_slug text NOT NULL,
  org_unit_id bigint REFERENCES public.org_units(id) ON DELETE SET NULL,
  source_level public.notice_source_level NOT NULL DEFAULT 'department',
  source_name text NOT NULL,
  college_name text,
  department_name text,
  list_url text NOT NULL,
  base_url text,
  list_item_selector text,
  link_selector text,
  title_selector text,
  date_selector text,
  detail_content_selector text,
  detail_date_selector text,
  notice_url_pattern text,
  keywords text,
  adapter text,
  enabled boolean NOT NULL DEFAULT true,
  university_id bigint,
  college_id bigint,
  department_id bigint,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notice_sources_source_id_key UNIQUE (source_id),
  CONSTRAINT notice_sources_university_slug_check CHECK (university_slug ~ '^[a-z0-9_]+$'),
  CONSTRAINT notice_sources_list_url_check CHECK (list_url ~* '^https?://')
);

COMMENT ON TABLE public.notice_sources IS
  '크롤 대상 공지 게시판. org_units 트리에 연결되며, CSV는 동기화/백업용.';
COMMENT ON COLUMN public.notice_sources.source_id IS
  '안정적 외부 키 (예: yonsei_001, cau_univ_001). 크롤 리포트/ingest와 조인.';
COMMENT ON COLUMN public.notice_sources.org_unit_id IS
  '소속 조직 노드. university/college/department 어느 레벨이든 가능.';
COMMENT ON COLUMN public.notice_sources.adapter IS
  '전용 목록 수집기 이름. 비어 있으면 기본 HTML cheerio 파서.';

CREATE INDEX notice_sources_university_slug_idx
  ON public.notice_sources (university_slug);
CREATE INDEX notice_sources_org_unit_id_idx
  ON public.notice_sources (org_unit_id);
CREATE INDEX notice_sources_enabled_slug_idx
  ON public.notice_sources (enabled, university_slug);

CREATE OR REPLACE FUNCTION public.set_notice_sources_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notice_sources_updated_at
BEFORE UPDATE ON public.notice_sources
FOR EACH ROW
EXECUTE FUNCTION public.set_notice_sources_updated_at();

ALTER TABLE public.notice_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY notice_sources_select_public
  ON public.notice_sources
  FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY notice_sources_insert_admin
  ON public.notice_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY notice_sources_update_admin
  ON public.notice_sources
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY notice_sources_delete_admin
  ON public.notice_sources
  FOR DELETE
  TO authenticated
  USING (public.is_admin());
