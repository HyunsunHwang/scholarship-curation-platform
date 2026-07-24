/**
 * 관심 직무 택소노미.
 * - 대분류: 브라우즈 필터·피커 탭·계열 매핑 경유
 * - 세부(InterestJobId): 프로필·공고 저장/선택·추천 매칭에 사용
 */

export const INTEREST_CATEGORIES = [
  { id: "dev_data_ai", label: "개발 · 데이터 · AI" },
  { id: "pm", label: "기획 · PM" },
  { id: "marketing", label: "마케팅 · 광고 · MD" },
  { id: "design", label: "디자인" },
  { id: "sales", label: "영업" },
  { id: "hr_admin", label: "경영지원 · 인사" },
  { id: "finance", label: "회계 · 재무 · 금융사무" },
  { id: "manufacturing", label: "생산 · 품질" },
  { id: "rnd", label: "연구개발 · 설계" },
  { id: "cx_retail", label: "고객서비스 · 리테일 · 물류" },
  { id: "media", label: "미디어 · 콘텐츠" },
] as const;

export type InterestCategoryId = (typeof INTEREST_CATEGORIES)[number]["id"];

export const INTEREST_CATEGORY_IDS = INTEREST_CATEGORIES.map((c) => c.id);

/** 프로필·온보딩 세부 직무 최대 선택 수 */
export const INTEREST_CATEGORY_MAX = 5;

/** 공고(어드민) 세부 직무 최대 태그 수 */
export const INTEREST_CONTEST_MAX = 8;

/** 대분류별 세부 직무 */
export const INTEREST_SUBCATEGORIES = {
  dev_data_ai: [
    { id: "backend", label: "백엔드/서버 개발" },
    { id: "frontend", label: "프론트엔드 개발" },
    { id: "mobile", label: "앱 개발(iOS/Android)" },
    { id: "game_dev", label: "게임 개발(클라이언트/서버)" },
    { id: "embedded", label: "임베디드/펌웨어" },
    { id: "devops", label: "DevOps/인프라" },
    { id: "qa", label: "소프트웨어 테스트/QA" },
    { id: "security", label: "정보보안" },
    { id: "data_analyst", label: "데이터 분석가" },
    { id: "data_engineer", label: "데이터 엔지니어" },
    { id: "data_scientist", label: "데이터 사이언티스트" },
    { id: "ml_engineer", label: "AI/ML 엔지니어" },
  ],
  pm: [
    { id: "service_pm", label: "서비스 기획 · PM/PO" },
    { id: "biz_strategy", label: "사업기획/전략기획" },
    { id: "bd", label: "사업개발(BD)/제휴" },
    { id: "game_planning", label: "게임 기획" },
    { id: "consultant_jr", label: "컨설턴트(주니어)" },
  ],
  marketing: [
    { id: "brand_marketing", label: "브랜드 마케팅" },
    { id: "performance", label: "퍼포먼스 마케팅(광고 운영)" },
    { id: "content_sns", label: "콘텐츠 마케팅 · SNS 운영" },
    { id: "crm", label: "CRM 마케팅" },
    { id: "growth", label: "그로스 마케팅" },
    { id: "ae", label: "광고기획(AE)" },
    { id: "pr", label: "홍보/PR" },
    { id: "md", label: "MD(상품기획/유통)" },
  ],
  design: [
    { id: "ux_ui", label: "UX/UI 디자인" },
    { id: "graphic", label: "그래픽/시각 디자인" },
    { id: "motion", label: "영상/모션 디자인" },
    { id: "product_design", label: "제품/산업 디자인" },
    { id: "bx", label: "브랜드 디자인(BX)" },
    { id: "web_publishing", label: "웹디자인/퍼블리싱" },
    { id: "space", label: "공간/전시 디자인" },
    { id: "fashion", label: "패션 디자인" },
  ],
  sales: [
    { id: "domestic", label: "국내영업" },
    { id: "overseas", label: "해외영업/무역" },
    { id: "b2b", label: "B2B/법인영업" },
    { id: "tech_sales", label: "기술영업" },
    { id: "sales_ops", label: "영업관리 · 영업지원" },
    { id: "finance_sales", label: "금융영업" },
  ],
  hr_admin: [
    { id: "hr", label: "인사(HR)" },
    { id: "hrd", label: "HRD/교육운영" },
    { id: "general_affairs", label: "총무" },
    { id: "office_support", label: "사무/경영지원" },
    { id: "legal_jr", label: "법무(주니어)" },
    { id: "secretary", label: "비서/사무보조" },
  ],
  finance: [
    { id: "accounting", label: "회계 · 경리" },
    { id: "tax", label: "세무" },
    { id: "treasury", label: "재무/자금" },
    { id: "finance_ops", label: "금융사무(은행·증권·보험 사무)" },
  ],
  manufacturing: [
    { id: "production_mgmt", label: "생산관리" },
    { id: "process_eng", label: "공정기술" },
    { id: "qc", label: "품질관리(QC)" },
    { id: "production_tech", label: "생산기술" },
    { id: "equipment", label: "설비/장비" },
    { id: "ehs", label: "안전/환경(EHS)" },
  ],
  rnd: [
    { id: "mechanical", label: "기계 설계" },
    { id: "ee", label: "전기 · 전자" },
    { id: "semiconductor", label: "반도체(공정/회로/설비)" },
    { id: "chem_materials", label: "화학 · 소재" },
    { id: "bio_pharma", label: "바이오 · 제약 연구" },
    { id: "rnd_general", label: "R&D(일반)" },
    { id: "civil_arch", label: "건축 · 토목 · 시설" },
  ],
  cx_retail: [
    { id: "cs", label: "고객상담/CS" },
    { id: "platform_ops", label: "서비스 운영(플랫폼 오퍼레이션)" },
    { id: "retail", label: "매장/리테일 관리" },
    { id: "scm", label: "물류/SCM" },
    { id: "procurement", label: "구매/자재" },
    { id: "fnb", label: "식음료/외식" },
  ],
  media: [
    { id: "content_prod", label: "콘텐츠 기획/제작" },
    { id: "pd", label: "PD/영상 제작" },
    { id: "editor", label: "기자/에디터" },
    { id: "broadcast_writer", label: "방송 · 구성작가" },
    { id: "publishing", label: "출판/편집" },
    { id: "mcn", label: "크리에이터 운영/MCN" },
  ],
} as const satisfies Record<
  InterestCategoryId,
  readonly { id: string; label: string }[]
>;

export type InterestJobId =
  (typeof INTEREST_SUBCATEGORIES)[InterestCategoryId][number]["id"];

/** @deprecated InterestJobId 사용 */
export type InterestSubcategoryId = InterestJobId;

export const ALL_INTEREST_JOBS: readonly {
  id: InterestJobId;
  label: string;
  categoryId: InterestCategoryId;
}[] = INTEREST_CATEGORY_IDS.flatMap((categoryId) =>
  INTEREST_SUBCATEGORIES[categoryId].map((job) => ({
    id: job.id as InterestJobId,
    label: job.label,
    categoryId,
  }))
);

const CATEGORY_ID_SET: ReadonlySet<string> = new Set(INTEREST_CATEGORY_IDS);
const JOB_ID_SET: ReadonlySet<string> = new Set(ALL_INTEREST_JOBS.map((j) => j.id));
const JOB_BY_ID = new Map(ALL_INTEREST_JOBS.map((j) => [j.id, j]));

/** DB CHECK / 마이그레이션용 세부 id 목록 */
export const INTEREST_JOB_IDS: readonly InterestJobId[] = ALL_INTEREST_JOBS.map(
  (j) => j.id
);

/**
 * 예전 대분류·관심 분야 id (세부 직무가 아님).
 * normalize 시 drop — 과매칭 방지. 사용자는 UI에서 세부를 다시 고른다.
 */
const LEGACY_CATEGORY_IDS: ReadonlySet<string> = new Set([
  "planning",
  "dev",
  "data_ai",
  "design",
  "content",
  "marketing",
  "business",
  "engineering",
  "humanities",
  "education",
  "public",
  "startup",
  "dev_eng",
  "pm",
  "sales_cx",
  "hr_admin",
  "media",
  "research",
  "manufacturing",
  "hw_eng",
  // 구 대분류 scm은 세부 scm과 충돌 → 세부 id가 우선이므로 여기 넣지 않음
  "dev_data_ai",
  "sales",
  "finance",
  "rnd",
  "cx_retail",
]);

export function isInterestCategoryId(value: string): value is InterestCategoryId {
  return CATEGORY_ID_SET.has(value);
}

export function isInterestJobId(value: string): value is InterestJobId {
  return JOB_ID_SET.has(value);
}

export function interestCategoryLabel(id: InterestCategoryId): string {
  return INTEREST_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

export function interestJobLabel(id: InterestJobId): string {
  return JOB_BY_ID.get(id)?.label ?? id;
}

export function categoryOfInterestJob(id: InterestJobId): InterestCategoryId {
  return JOB_BY_ID.get(id)!.categoryId;
}

export function interestSubcategories(categoryId: InterestCategoryId) {
  return INTEREST_SUBCATEGORIES[categoryId];
}

/**
 * 브라우즈 필터 등: 대분류 id면 하위 세부 전부, 세부 id면 그대로.
 */
export function expandInterestFilterIds(
  ids: readonly string[] | null | undefined
): InterestJobId[] {
  if (!ids?.length) return [];
  const seen = new Set<InterestJobId>();
  const out: InterestJobId[] = [];
  for (const raw of ids) {
    if (isInterestJobId(raw)) {
      if (!seen.has(raw)) {
        seen.add(raw);
        out.push(raw);
      }
      continue;
    }
    if (isInterestCategoryId(raw)) {
      for (const job of INTEREST_SUBCATEGORIES[raw]) {
        const id = job.id as InterestJobId;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
      }
    }
  }
  return out;
}

/**
 * 프로필·공고 저장용: 세부 직무만 통과. 대분류/레거시는 drop.
 */
export function normalizeInterestCategories(
  values: readonly string[] | null | undefined,
  max: number = INTEREST_CATEGORY_MAX
): InterestJobId[] {
  if (!values?.length) return [];
  const seen = new Set<InterestJobId>();
  const out: InterestJobId[] = [];
  for (const raw of values) {
    if (LEGACY_CATEGORY_IDS.has(raw) && !isInterestJobId(raw)) continue;
    if (!isInterestJobId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
    if (out.length >= max) break;
  }
  return out;
}
