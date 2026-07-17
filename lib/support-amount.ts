import {
  extractBenefitCorpusFromNotice,
  formatTotalPrizeLabel,
  hasMeaningfulPrizeAmount,
  resolveContestBenefits,
} from "@/lib/benefit-categories";

export function formatSupportAmount(text?: string | null): string {
  const raw = text?.trim();
  if (!raw) return "기관 확인 필요";
  return raw;
}

/** 목록 카드용 원문 스니펫 (전체 본문 대신 앞부분만) */
export const CARD_NOTICE_SNIPPET_MAX = 2200;
/** 홈 피드용 — 혜택 키워드 추출에 충분하되 페이로드는 작게 */
export const HOME_CARD_NOTICE_SNIPPET_MAX = 800;

export function clipNoticeForCard(
  text?: string | null,
  max: number = CARD_NOTICE_SNIPPET_MAX
): string | null {
  const raw = text?.trim();
  if (!raw) return null;
  if (raw.length <= max) return raw;
  return raw.slice(0, max);
}

/**
 * 시상금액·benefits·note만으로 카드 문구를 만들 수 있으면
 * original_notice_text 조회/파싱을 생략한다.
 */
export function contestCardSupportNeedsNotice(opts: {
  supportAmountText?: string | null;
  benefits?: string[] | null;
  additionalNote?: string | null;
}): boolean {
  if (hasMeaningfulPrizeAmount(opts.supportAmountText)) return false;
  for (const raw of opts.benefits ?? []) {
    const key = raw.trim();
    if (key && key !== "기타" && key !== "기관 확인 필요") return false;
  }
  const note = opts.additionalNote?.trim();
  if (note && note !== "-" && note !== "—") return false;
  return true;
}

/**
 * 시상·혜택 섹션을 우선으로 잘라 목록용 스니펫을 만든다.
 * (앞부분만 clip하면 시상 구간이 잘려 총상금이 누락되는 경우가 있음)
 */
export function clipNoticeForCardBenefits(
  text?: string | null,
  max: number = HOME_CARD_NOTICE_SNIPPET_MAX,
  /** 이미 추출해 둔 시상 코퍼스 — 중복 파싱 방지 */
  preextractedCorpus?: string | null
): string | null {
  const corpus = preextractedCorpus?.trim()
    ? preextractedCorpus
    : extractBenefitCorpusFromNotice(text)?.corpus;
  if (corpus?.trim()) {
    return clipNoticeForCard(corpus, max);
  }
  return clipNoticeForCard(text, max);
}

/**
 * 목록 카드 하단 문구 = 상세 "지원혜택" 키워드와 동일 소스.
 * (resolveContestBenefits 라벨을 그대로 이어 붙인다)
 */
export function formatCardSupportLine(opts: {
  contentKind?: "scholarship" | "contest" | "education" | "activity" | string | null;
  supportAmountText?: string | null;
  benefits?: string[] | null;
  /** additionalBenefit 등 */
  additionalNote?: string | null;
  /** 원문 — 가능하면 전체(또는 시상 섹션)를 넘길 것 */
  noticeText?: string | null;
  /** 교육/공모전 키워드 추론 보강 */
  name?: string | null;
}): string {
  const kind = opts.contentKind ?? "scholarship";
  const amount = opts.supportAmountText?.trim() || null;
  const isContestLike =
    kind === "contest" || kind === "education" || kind === "activity";

  if (!isContestLike) {
    return formatSupportAmount(amount);
  }

  const labels = resolveContestBenefits({
    benefits: opts.benefits,
    supportAmountText: amount,
    additionalNote: opts.additionalNote,
    noticeText: opts.noticeText,
    contentKind: kind,
    name: opts.name,
  })
    .map((b) => b.label)
    .filter((label) => label !== "기타" && label !== "기관 확인 필요");

  // 시상금액 필드가 있으면 상세와 같이 총상금을 맨 앞에 보장
  if (amount && hasMeaningfulPrizeAmount(amount)) {
    const prize = formatTotalPrizeLabel(amount);
    const rest = labels.filter(
      (label) =>
        label !== prize &&
        label !== "상금" &&
        !/^총\s*상금\b/.test(label)
    );
    return [prize, ...rest].slice(0, 3).join(", ");
  }

  if (labels.length === 0) return "기관 확인 필요";
  return labels.slice(0, 3).join(", ");
}

/** 카드 UI용 — 서버 precompute가 있으면 재계산하지 않는다 */
export function resolveCardSupportLine(opts: {
  contentKind?: "scholarship" | "contest" | "education" | "activity" | string | null;
  supportAmountText?: string | null;
  benefits?: string[] | null;
  additionalNote?: string | null;
  noticeText?: string | null;
  name?: string | null;
  cardSupportLine?: string | null;
}): string {
  const precomputed = opts.cardSupportLine?.trim() || "";
  if (precomputed && precomputed !== "기관 확인 필요") return precomputed;
  return formatCardSupportLine(opts);
}

/** 원문 조회가 필요한 contest id만 골라낸다 */
export function contestIdsNeedingNotice(
  rows: ReadonlyArray<{
    id: number;
    support_amount_text?: string | null;
    benefits?: string[] | null;
    note?: string | null;
  }>
): number[] {
  return rows
    .filter((row) =>
      contestCardSupportNeedsNotice({
        supportAmountText: row.support_amount_text,
        benefits: row.benefits,
        additionalNote: row.note,
      })
    )
    .map((row) => row.id);
}

/** 서버 매핑용 — 원문이 필요할 때만 1회 파싱 */
export function buildContestCardSupportFields(opts: {
  name: string;
  contentKind?: "contest" | "education" | "activity" | string | null;
  supportAmountText?: string | null;
  benefits?: string[] | null;
  additionalNote?: string | null;
  originalNoticeText?: string | null;
}): {
  benefit_notice_text: string | null;
  card_support_line: string;
} {
  const kind = opts.contentKind ?? "contest";
  const shouldParseNotice =
    Boolean(opts.originalNoticeText?.trim()) &&
    contestCardSupportNeedsNotice({
      supportAmountText: opts.supportAmountText,
      benefits: opts.benefits,
      additionalNote: opts.additionalNote,
    });

  let noticeForResolve: string | null = null;
  let benefitNotice: string | null = null;

  if (shouldParseNotice) {
    const extracted = extractBenefitCorpusFromNotice(opts.originalNoticeText);
    const corpus = extracted?.corpus?.trim() ? extracted.corpus : null;
    noticeForResolve = corpus ?? opts.originalNoticeText ?? null;
    benefitNotice = clipNoticeForCardBenefits(
      opts.originalNoticeText,
      HOME_CARD_NOTICE_SNIPPET_MAX,
      corpus
    );
  }

  const card_support_line = formatCardSupportLine({
    contentKind: kind,
    supportAmountText: opts.supportAmountText,
    benefits: opts.benefits,
    additionalNote: opts.additionalNote,
    noticeText: noticeForResolve,
    name: opts.name,
  });

  return {
    // 카드 문구가 확정되면 클라이언트에 원문 스니펫을 보내지 않는다
    benefit_notice_text:
      card_support_line === "기관 확인 필요" ? benefitNotice : null,
    card_support_line,
  };
}
