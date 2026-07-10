/** 홈 피드·라이브러리에서 쓰는 콘텐츠 종류 (공모전/교육/대외활동은 UI만, 데이터는 추후) */
export const CONTENT_CATEGORIES = [
  { key: "all", label: "모두" },
  { key: "contest", label: "공모전" },
  { key: "education", label: "교육" },
  { key: "activity", label: "대외활동" },
  { key: "scholarship", label: "장학금" },
] as const;

export type ContentCategoryKey = (typeof CONTENT_CATEGORIES)[number]["key"];

/** 사이드바 필터용 — '모두' 제외 */
export const LIBRARY_CATEGORY_FILTERS = CONTENT_CATEGORIES.filter(
  (c) => c.key !== "all"
);

/** 현재 데이터가 있는 카테고리 (그 외는 빈 상태) */
export const CATEGORIES_WITH_DATA: ReadonlySet<ContentCategoryKey> = new Set([
  "all",
  "scholarship",
]);

export function categoryHasData(key: ContentCategoryKey): boolean {
  return CATEGORIES_WITH_DATA.has(key);
}
