/**
 * DB에 등록된 대학명이 장학금명·기관명에 포함되면 특정 대학 대상으로 간주한다.
 * (긴 이름을 먼저 검사해 부분 일치 충돌을 줄임)
 */
export function isUniversitySpecificScholarship(
  row: { name: string; organization: string },
  universityNames: readonly string[]
): boolean {
  if (universityNames.length === 0) return false;
  const sorted = [...universityNames].sort((a, b) => b.length - a.length);
  const hay = `${row.name} ${row.organization}`.toLowerCase();
  return sorted.some((n) => {
    const t = n.trim();
    if (t.length < 3) return false;
    return hay.includes(t.toLowerCase());
  });
}
