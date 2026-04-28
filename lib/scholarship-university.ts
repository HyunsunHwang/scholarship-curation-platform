/**
 * 특정 대학(들) 대상 장학금인지 판별한다.
 * - qual_university 가 비어 있지 않으면: DB상 대학 제한 → 홈 "전체" 목록에 노출하지 않음
 * - 그 외: 장학금명·기관명에 등록된 대학명이 포함되는지(연세대학교 등) 문자열로 판별
 */
export function isUniversitySpecificScholarship(
  row: {
    name: string;
    organization: string;
    qual_university?: string[] | null;
  },
  universityNames: readonly string[]
): boolean {
  const qu = row.qual_university;
  if (qu != null && qu.length > 0) {
    return true;
  }

  if (universityNames.length === 0) return false;
  const sorted = [...universityNames].sort((a, b) => b.length - a.length);
  const hay = `${row.name} ${row.organization}`.toLowerCase();
  return sorted.some((n) => {
    const t = n.trim();
    if (t.length < 3) return false;
    return hay.includes(t.toLowerCase());
  });
}
