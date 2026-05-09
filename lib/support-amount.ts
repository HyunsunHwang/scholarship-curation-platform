export function formatSupportAmount(
  won: number,
  text?: string | null,
  options: { compact?: boolean } = {}
): string {
  const raw = text?.trim();
  if (!raw) {
    if (won === 0) return "기관 확인 필요";
    const manWon = won / 10000;
    if (manWon >= 10000) return `연 ${(manWon / 10000).toFixed(0)}억원`;
    if (manWon >= 1) return `연 ${manWon.toLocaleString()}만원`;
    return `연 ${won.toLocaleString()}원`;
  }

  // support_amount_text가 있으면 compact 옵션 여부와 관계없이 원문 그대로 노출
  return raw;
}
