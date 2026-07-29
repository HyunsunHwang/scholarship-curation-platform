function validDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function dateParts(raw) {
  const match = String(raw ?? "").match(/^\s*(?:(\d{4})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*(?:\([^)]*\))?\s*$/u);
  if (!match) return null;
  return { year: match[1] ? Number(match[1]) : null, month: Number(match[2]), day: Number(match[3]) };
}

function formatDate({ year, month, day }) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function normalizeKoreanDate(raw, { inheritedYear = null } = {}) {
  const parts = dateParts(raw);
  const year = parts?.year ?? inheritedYear;
  if (!parts || !year || !validDate(year, parts.month, parts.day)) return { value: null, status: parts ? "invalid" : "unresolved" };
  return { value: formatDate({ ...parts, year }), status: "normalized" };
}

export function normalizeKoreanDateRange(rawStart, rawEnd) {
  const startParts = dateParts(rawStart);
  const start = normalizeKoreanDate(rawStart);
  const end = normalizeKoreanDate(rawEnd, { inheritedYear: startParts?.year ?? null });
  return {
    raw_start: rawStart ?? null,
    raw_end: rawEnd ?? null,
    normalized_start: start.value,
    normalized_end: end.value,
    normalization_status: start.status === "normalized" && end.status === "normalized" ? "normalized" : "unresolved",
  };
}

export function normalizeKoreanAmount(rawAmountText) {
  const raw = String(rawAmountText ?? "");
  const match = raw.match(/(\d+(?:,\d{3})*)\s*만원/u);
  if (!match) return { raw_amount_text: rawAmountText ?? null, amount_krw: null, status: "not_numeric" };
  return { raw_amount_text: rawAmountText, amount_krw: Number(match[1].replaceAll(",", "")) * 10_000, status: "normalized" };
}

export function normalizeContact(rawValue) {
  const raw = String(rawValue ?? "");
  const phoneNumbers = raw.match(/0\d{1,2}-\d{3,4}-\d{4}/gu) ?? [];
  const emails = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu) ?? [];
  return { raw_value: rawValue ?? null, phone_numbers: phoneNumbers, emails };
}
