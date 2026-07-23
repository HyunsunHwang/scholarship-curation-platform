/**
 * 관심 직무(대분류) 공통 태그 체계.
 * - id: 내부 고정 식별자 (프로필·공고 분류·추천에 저장/매칭)
 * - label: 화면 표시용 (나중에 바꿔도 id는 유지)
 *
 * 세부 직무(프론트엔드, PM 등)는 매핑·추천 휴리스틱 참고용이며,
 * 저장·선택 UI에는 대분류만 사용한다.
 */

export const INTEREST_CATEGORIES = [
  { id: "dev_eng", label: "개발·엔지니어링" },
  { id: "pm", label: "기획·PM" },
  { id: "design", label: "디자인" },
  { id: "marketing", label: "마케팅·광고" },
  { id: "business", label: "사업·경영" },
  { id: "sales_cx", label: "영업·고객" },
  { id: "hr_admin", label: "HR·경영지원" },
  { id: "media", label: "미디어·콘텐츠" },
  { id: "research", label: "연구·전문직" },
  { id: "manufacturing", label: "생산·제조" },
  { id: "hw_eng", label: "엔지니어링(하드웨어·설비)" },
  { id: "scm", label: "구매·SCM·물류" },
] as const;

export type InterestCategoryId = (typeof INTEREST_CATEGORIES)[number]["id"];

export const INTEREST_CATEGORY_IDS = INTEREST_CATEGORIES.map((c) => c.id);

export const INTEREST_CATEGORY_MAX = 5;

const ID_SET: ReadonlySet<string> = new Set(INTEREST_CATEGORY_IDS);

/** 구 관심 분야 → 관심 직무 대분류 (데이터 마이그레이션·폴백용) */
export const LEGACY_INTEREST_REMAP: Readonly<Record<string, InterestCategoryId>> = {
  planning: "pm",
  dev: "dev_eng",
  data_ai: "dev_eng",
  design: "design",
  content: "media",
  marketing: "marketing",
  business: "business",
  engineering: "hw_eng",
  humanities: "media",
  education: "hr_admin",
  public: "business",
  startup: "business",
};

export function isInterestCategoryId(value: string): value is InterestCategoryId {
  return ID_SET.has(value);
}

export function interestCategoryLabel(id: InterestCategoryId): string {
  return INTEREST_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/**
 * 알 수 없는 id는 제거하고 중복·최대 개수를 정리한다.
 * 구 관심 분야 id가 들어오면 직무 대분류로 승격한다.
 */
export function normalizeInterestCategories(
  values: readonly string[] | null | undefined
): InterestCategoryId[] {
  if (!values?.length) return [];
  const seen = new Set<InterestCategoryId>();
  const out: InterestCategoryId[] = [];
  for (const raw of values) {
    const mapped = LEGACY_INTEREST_REMAP[raw] ?? raw;
    if (!isInterestCategoryId(mapped) || seen.has(mapped)) continue;
    seen.add(mapped);
    out.push(mapped);
    if (out.length >= INTEREST_CATEGORY_MAX) break;
  }
  return out;
}
