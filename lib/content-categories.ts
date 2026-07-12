/** 홈 피드에서 쓰는 콘텐츠 종류 */
export const CONTENT_CATEGORIES = [
  { key: "all", label: "홈" },
  { key: "contest", label: "공모전" },
  { key: "education", label: "교육" },
  { key: "activity", label: "대외활동" },
  { key: "scholarship", label: "장학금" },
] as const;

export type ContentCategoryKey = (typeof CONTENT_CATEGORIES)[number]["key"];

/** 종류별 선반용 — '홈' 제외 */
export const LIBRARY_CATEGORY_FILTERS = CONTENT_CATEGORIES.filter(
  (c) => c.key !== "all"
);

/** 현재 데이터가 있는 카테고리 */
export const CATEGORIES_WITH_DATA: ReadonlySet<ContentCategoryKey> = new Set([
  "all",
  "contest",
  "education",
  "activity",
  "scholarship",
]);

export function categoryHasData(key: ContentCategoryKey): boolean {
  return CATEGORIES_WITH_DATA.has(key);
}

export function contentKindLabel(
  kind: "contest" | "education" | "activity" | "scholarship" | null | undefined
): string {
  switch (kind) {
    case "education":
      return "교육";
    case "activity":
      return "대외활동";
    case "scholarship":
      return "장학금";
    case "contest":
    default:
      return "공모전";
  }
}

export function contentKindHref(
  kind: "contest" | "education" | "activity" | "scholarship" | null | undefined,
  id: number
): string {
  switch (kind) {
    case "education":
      return `/educations/${id}`;
    case "activity":
      return `/activities/${id}`;
    case "scholarship":
      return `/scholarships/${id}`;
    case "contest":
    default:
      return `/contests/${id}`;
  }
}
