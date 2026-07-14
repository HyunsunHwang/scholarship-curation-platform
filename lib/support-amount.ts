import {
  hasMeaningfulPrizeAmount,
  resolveContestBenefits,
} from "@/lib/benefit-categories";

export function formatSupportAmount(text?: string | null): string {
  const raw = text?.trim();
  if (!raw) return "기관 확인 필요";
  return raw;
}

function isEmptyOrZeroSupportAmount(text?: string | null): boolean {
  const raw = text?.trim();
  if (!raw) return true;
  if (/기관\s*확인/.test(raw)) return true;
  return !hasMeaningfulPrizeAmount(raw);
}

/** 목록 카드용 원문 스니펫 (전체 본문 대신 앞부분만) */
export const CARD_NOTICE_SNIPPET_MAX = 2200;

export function clipNoticeForCard(text?: string | null): string | null {
  const raw = text?.trim();
  if (!raw) return null;
  if (raw.length <= CARD_NOTICE_SNIPPET_MAX) return raw;
  return raw.slice(0, CARD_NOTICE_SNIPPET_MAX);
}

/** 목록 카드 하단: 공모전(총상금 0)·교육·대외활동은 지원혜택 키워드로 대체 */
export function formatCardSupportLine(opts: {
  contentKind?: "scholarship" | "contest" | "education" | "activity" | string | null;
  supportAmountText?: string | null;
  benefits?: string[] | null;
  /** additionalBenefit 등 */
  additionalNote?: string | null;
  /** 원문 앞부분 — 목록에서도 상품·부상 등 키워드를 잡기 위함 */
  noticeText?: string | null;
}): string {
  const kind = opts.contentKind ?? "scholarship";
  const amount = opts.supportAmountText?.trim() || null;
  const isContestLike =
    kind === "contest" || kind === "education" || kind === "activity";

  if (!isContestLike) {
    return formatSupportAmount(amount);
  }

  // 공모전: 의미 있는 총상금이 있으면 금액 유지
  if (kind === "contest" && !isEmptyOrZeroSupportAmount(amount)) {
    return formatSupportAmount(amount);
  }

  // 교육·대외활동: 금액 문구가 실질적이면 그대로 (없으면 키워드)
  if (
    (kind === "education" || kind === "activity") &&
    !isEmptyOrZeroSupportAmount(amount)
  ) {
    return formatSupportAmount(amount);
  }

  const labels = resolveContestBenefits({
    benefits: opts.benefits,
    supportAmountText: null,
    additionalNote: opts.additionalNote,
    noticeText: opts.noticeText,
    contentKind: kind,
  })
    .map((b) => b.label)
    .filter((label) => label !== "기타");

  if (labels.length === 0) return "기관 확인 필요";
  return labels.join(", ");
}
