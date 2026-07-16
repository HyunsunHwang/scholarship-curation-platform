/**
 * For You / 홈 랭킹 가중치.
 * L1 관심사 + 저장 유사 + 인기 중심. HOME_RANK_VARIANT=a|b 로 A/B 튜닝.
 */

export type ForYouWeights = {
  /** L1 관심사 오버랩 */
  interest: number;
  /** 저장한 공고와 유사도 */
  similarSaved: number;
  /** 인기(스크랩·조회 log) */
  popularity: number;
  recommended: number;
  deadline: number;
  recent: number;
  /** 협업 필터링 후보에 포함될 때 가산 */
  collaborative: number;
};

const VARIANT_A: ForYouWeights = {
  interest: 14,
  similarSaved: 12,
  popularity: 1.2,
  recommended: 6,
  deadline: 0.08,
  recent: 2,
  collaborative: 4,
};

/** 관심사·저장 유사 비중을 더 준 실험군 */
const VARIANT_B: ForYouWeights = {
  interest: 18,
  similarSaved: 14,
  popularity: 1,
  recommended: 4,
  deadline: 0.05,
  recent: 2.5,
  collaborative: 5,
};

export function getForYouWeights(
  variant: string | null | undefined = process.env.HOME_RANK_VARIANT
): ForYouWeights {
  if (variant?.toLowerCase() === "b") return { ...VARIANT_B };
  return { ...VARIANT_A };
}

export function getActiveRankVariant(): "a" | "b" {
  return process.env.HOME_RANK_VARIANT?.toLowerCase() === "b" ? "b" : "a";
}
