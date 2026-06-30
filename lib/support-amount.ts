export function formatSupportAmount(
  text?: string | null,
): string {
  const raw = text?.trim();
  if (!raw) return "기관 확인 필요";
  return raw;
}
