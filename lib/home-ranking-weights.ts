/**
 * For You / 홈 랭킹 가중치.
 * HOME_RANK_VARIANT=a|b 로 A/B 튜닝 (서버 env).
 */

export type ForYouWeights = {
  recommended: number;
  deadline: number;
  interest: number;
  recent: number;
  scrap: number;
  view: number;
  /** 협업 필터링 후보에 포함될 때 가산 */
  collaborative: number;
};

const VARIANT_A: ForYouWeights = {
  recommended: 40,
  deadline: 0.25,
  interest: 8,
  recent: 4,
  scrap: 0.05,
  view: 0.01,
  collaborative: 6,
};

/** 관심사·협업 비중을 더 준 실험군 */
const VARIANT_B: ForYouWeights = {
  recommended: 30,
  deadline: 0.2,
  interest: 12,
  recent: 5,
  scrap: 0.04,
  view: 0.01,
  collaborative: 10,
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
