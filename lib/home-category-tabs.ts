/** 홈 히어로 아래 카테고리 칩 */
export const HOME_CATEGORY_TABS = [
  { key: "all", label: "전체" },
  { key: "activity", label: "대외활동" },
  { key: "contest", label: "공모전" },
  { key: "education", label: "교육" },
  { key: "scholarship", label: "장학금" },
  { key: "internship", label: "인턴" },
  { key: "hiring", label: "채용" },
] as const;

export type HomeCategoryTabKey = (typeof HOME_CATEGORY_TABS)[number]["key"];

export function isHomeCategoryTabKey(value: string): value is HomeCategoryTabKey {
  return HOME_CATEGORY_TABS.some((tab) => tab.key === value);
}
