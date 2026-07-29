import { normalizeContact, normalizeKoreanAmount, normalizeKoreanDate } from "./deterministic-normalizers.mjs";

export function extractRawCandidates(text, source_ref) {
  const value = String(text ?? "");
  const dates = [...value.matchAll(/(?:\d{4}\s*[.-]\s*)?\d{1,2}\s*[.-]\s*\d{1,2}\.?\s*(?:\([^)]*\))?\s*(?:\d{1,2}:\d{2})?/gu)].map((match) => ({ raw_candidate: match[0].trim(), normalized_date: normalizeKoreanDate(match[0]).value, normalized_time: (match[0].match(/\d{1,2}:\d{2}/u) ?? [null])[0], source_ref }));
  const amounts = [...value.matchAll(/(?:연|학기당)?\s*(?:\d+(?:,\d{3})*만원|\d+천만원|\d+억\d*천?만원|\d+(?:\.\d+)?%|수업료\s*전액)/gu)].map((match) => { const raw_candidate = match[0].trim(); return { raw_candidate, amount_krw: normalizeKoreanAmount(raw_candidate).amount_krw, rate_percent: (raw_candidate.match(/(\d+(?:\.\d+)?)%/u) ?? [null, null])[1], scope: /전액/u.test(raw_candidate) ? "full_tuition" : null, source_ref }; });
  const contact = normalizeContact(value); const contacts = [...contact.phone_numbers, ...contact.emails].map((raw_candidate) => ({ raw_candidate, source_ref }));
  return { dates, amounts, contacts };
}
