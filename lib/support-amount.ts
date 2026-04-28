function compactText(text: string): string {
  return text
    .replace(/○/g, "")
    .replace(/※.*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenLongText(text: string): string {
  if (text.length <= 22) return text;
  const firstClause = text.split(/[/.]/)[0]?.trim();
  if (firstClause && firstClause.length <= 22) return firstClause;
  return `${text.slice(0, 21).trim()}…`;
}

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

  if (!options.compact) return raw;

  const normalized = compactText(raw);

  const hourly = normalized.match(/시간당\s*([\d,]+)원.*?([\d,]+)원/);
  if (hourly) return `시간당 ${hourly[1]}~${hourly[2]}원`;

  const usd = normalized.match(/(?:연간\s*)?(?:최대\s*)?USD\s*[\d,]+/i);
  if (usd) return usd[0].replace(/^/, normalized.includes("연간") ? "연 " : "");

  const monthly = normalized.match(/월\s*(?:최대\s*)?[\d,.]+만원(?:\s*[×xX]\s*\d+개월)?/);
  if (monthly) return monthly[0];

  const fullTuition = normalized.match(/(?:학비|수업료)(?:\s*및\s*생활비)?\s*전액/);
  if (fullTuition) return fullTuition[0].replace(" 및 ", "·");

  const tuitionPercent = normalized.match(/수업료\s*[\d/%()A-C\s/]+/);
  if (tuitionPercent) return tuitionPercent[0].trim();

  const maxAmount = normalized.match(/(?:연\s*)?(?:최대\s*)?[\d,.]+(?:~[\d,.]+)?만원(?:\s*내외|\s*이내)?/);
  if (maxAmount) return maxAmount[0].trim();

  const foreignAmount = normalized.match(/[\d,.]+\s*(?:유로|달러|원)(?:\s*~\s*[\d,.]+\s*(?:유로|달러|원))?/);
  if (foreignAmount) return foreignAmount[0].trim();

  return shortenLongText(normalized);
}
