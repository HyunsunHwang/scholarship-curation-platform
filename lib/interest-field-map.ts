import {
  categoryOfInterestJob,
  isInterestCategoryId,
  isInterestJobId,
  type InterestCategoryId,
  type InterestJobId,
} from "@/lib/interestCategories";

/**
 * 관심 직무 대분류 → 장학금 qual_field_codes 교차 매핑.
 * 직무와 계열 택소노미가 다르므로 느슨한 대응만 한다.
 */
export const INTEREST_TO_FIELD_CODES: Record<
  InterestCategoryId,
  readonly string[]
> = {
  dev_data_ai: ["공학"],
  pm: ["사회", "인문"],
  marketing: ["사회"],
  design: ["예체능"],
  sales: ["사회"],
  hr_admin: ["사회", "교육"],
  finance: ["사회"],
  manufacturing: ["공학"],
  rnd: ["자연", "공학"],
  cx_retail: ["사회"],
  media: ["예체능", "인문"],
};

/** 세부 직무 또는 대분류 id → 계열 코드 */
export function fieldCodesForInterest(
  interestId: InterestJobId | InterestCategoryId | string
): readonly string[] {
  if (isInterestJobId(interestId)) {
    return INTEREST_TO_FIELD_CODES[categoryOfInterestJob(interestId)] ?? [];
  }
  if (isInterestCategoryId(interestId)) {
    return INTEREST_TO_FIELD_CODES[interestId] ?? [];
  }
  return [];
}
