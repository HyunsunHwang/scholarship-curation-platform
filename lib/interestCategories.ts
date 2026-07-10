/**
 * 관심 분야 공통 태그 체계.
 * - id: 내부 고정 식별자 (프로필·공고 분류·추천에 저장/매칭)
 * - label: 화면 표시용 (나중에 바꿔도 id는 유지)
 */

export const INTEREST_CATEGORIES = [
  { id: "planning", label: "기획·전략" },
  { id: "dev", label: "IT·개발" },
  { id: "data_ai", label: "데이터·AI" },
  { id: "design", label: "디자인·크리에이티브" },
  { id: "content", label: "콘텐츠·영상" },
  { id: "marketing", label: "마케팅·광고" },
  { id: "business", label: "경영·금융" },
  { id: "engineering", label: "이공·연구" },
  { id: "humanities", label: "인문·사회" },
  { id: "education", label: "교육" },
  { id: "public", label: "공공·사회공헌" },
  { id: "startup", label: "창업" },
] as const;

export type InterestCategoryId = (typeof INTEREST_CATEGORIES)[number]["id"];

export const INTEREST_CATEGORY_IDS = INTEREST_CATEGORIES.map((c) => c.id);

export const INTEREST_CATEGORY_MAX = 5;

const ID_SET: ReadonlySet<string> = new Set(INTEREST_CATEGORY_IDS);

export function isInterestCategoryId(value: string): value is InterestCategoryId {
  return ID_SET.has(value);
}

export function interestCategoryLabel(id: InterestCategoryId): string {
  return INTEREST_CATEGORIES.find((c) => c.id === id)?.label ?? id;
}

/** 알 수 없는 id는 제거하고 중복·최대 개수를 정리한다. */
export function normalizeInterestCategories(
  values: readonly string[] | null | undefined
): InterestCategoryId[] {
  if (!values?.length) return [];
  const seen = new Set<InterestCategoryId>();
  const out: InterestCategoryId[] = [];
  for (const v of values) {
    if (!isInterestCategoryId(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= INTEREST_CATEGORY_MAX) break;
  }
  return out;
}
