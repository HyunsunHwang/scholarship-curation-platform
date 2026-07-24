/** 어학 스펙: 언어 + 구사 수준 (+ 선택적 시험 성적) */

export const LANGUAGE_OPTIONS = [
  "영어",
  "중국어",
  "일본어",
  "스페인어",
  "프랑스어",
  "독일어",
  "러시아어",
  "아랍어",
  "기타",
] as const;

export const LANGUAGE_PROFICIENCY_LEVELS = [
  { id: "daily", label: "일상 회화" },
  { id: "business", label: "비즈니스 회화" },
  { id: "native", label: "원어민 수준" },
] as const;

export type LanguageProficiencyId =
  (typeof LANGUAGE_PROFICIENCY_LEVELS)[number]["id"];

export const LANGUAGE_EXAM_OPTIONS = [
  "TOEIC",
  "TOEIC Speaking",
  "TOEFL iBT",
  "IELTS",
  "OPIc",
  "TEPS",
  "HSK",
  "JLPT",
  "JPT",
  "기타",
] as const;

const PROFICIENCY_LABELS: ReadonlySet<string> = new Set(
  LANGUAGE_PROFICIENCY_LEVELS.map((l) => l.label)
);

/** description에 저장하는 성적 접두사 */
const SCORE_PREFIX = "성적: ";

export function proficiencyLabel(
  id: LanguageProficiencyId | string
): string {
  return (
    LANGUAGE_PROFICIENCY_LEVELS.find((l) => l.id === id)?.label ??
    LANGUAGE_PROFICIENCY_LEVELS.find((l) => l.label === id)?.label ??
    id
  );
}

export function encodeLanguageScore(
  exam: string,
  score: string
): string | null {
  const e = exam.trim();
  const s = score.trim();
  if (!e && !s) return null;
  return `${SCORE_PREFIX}${[e, s].filter(Boolean).join(" ")}`;
}

export function parseLanguageScore(
  description: string | null
): { exam: string; score: string } | null {
  if (!description?.startsWith(SCORE_PREFIX)) return null;
  const rest = description.slice(SCORE_PREFIX.length).trim();
  if (!rest) return { exam: "", score: "" };
  const known = LANGUAGE_EXAM_OPTIONS.find(
    (ex) => rest === ex || rest.startsWith(`${ex} `)
  );
  if (known) {
    return {
      exam: known,
      score: rest.slice(known.length).trim(),
    };
  }
  const space = rest.indexOf(" ");
  if (space === -1) return { exam: rest, score: "" };
  return { exam: rest.slice(0, space), score: rest.slice(space + 1).trim() };
}

export function isProficiencyLabel(value: string | null): boolean {
  return Boolean(value && PROFICIENCY_LABELS.has(value));
}

/** 목록 표시용 한 줄 */
export function formatLanguageSummary(item: {
  title: string;
  organization: string | null;
  description: string | null;
}): string {
  const parts = [item.title];
  if (item.organization && isProficiencyLabel(item.organization)) {
    parts.push(item.organization);
  } else if (item.organization) {
    parts.push(item.organization);
  }
  const score = parseLanguageScore(item.description);
  if (score) {
    parts.push([score.exam, score.score].filter(Boolean).join(" "));
  }
  return parts.filter(Boolean).join(" · ");
}
