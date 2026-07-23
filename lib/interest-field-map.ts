import type { InterestCategoryId } from "@/lib/interestCategories";

/**
 * 관심 직무 → 장학금 qual_field_codes 교차 매핑.
 * 직무와 계열 택소노미가 다르므로 느슨한 대응만 한다.
 */
export const INTEREST_TO_FIELD_CODES: Record<
  InterestCategoryId,
  readonly string[]
> = {
  dev_eng: ["공학"],
  pm: ["사회", "인문"],
  design: ["예체능"],
  marketing: ["사회"],
  business: ["사회"],
  sales_cx: ["사회"],
  hr_admin: ["사회", "교육"],
  media: ["예체능", "인문"],
  research: ["자연", "공학"],
  manufacturing: ["공학"],
  hw_eng: ["공학"],
  scm: ["사회"],
};

export function fieldCodesForInterest(
  interestId: InterestCategoryId
): readonly string[] {
  return INTEREST_TO_FIELD_CODES[interestId] ?? [];
}
