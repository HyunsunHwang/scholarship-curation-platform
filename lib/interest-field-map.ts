import type { InterestCategoryId } from "@/lib/interestCategories";

/**
 * Career GPS 관심사 → 장학금 qual_field_codes 교차 매핑.
 * 관심사와 계열 택소노미가 다르므로 느슨한 대응만 한다.
 */
export const INTEREST_TO_FIELD_CODES: Record<
  InterestCategoryId,
  readonly string[]
> = {
  planning: ["사회", "인문"],
  dev: ["공학"],
  data_ai: ["공학", "자연"],
  design: ["예체능"],
  content: ["예체능", "인문"],
  marketing: ["사회"],
  business: ["사회"],
  engineering: ["공학", "자연"],
  humanities: ["인문", "사회"],
  education: ["교육"],
  public: ["사회"],
  startup: ["사회", "공학"],
};

export function fieldCodesForInterest(
  interestId: InterestCategoryId
): readonly string[] {
  return INTEREST_TO_FIELD_CODES[interestId] ?? [];
}
