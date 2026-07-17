/**
 * 공모전·대외활동·교육 대상 필터.
 * 플랫폼은 대학생 대상(또는 제한 없음/미기재)만 노출한다.
 */

export const STUDENT_TARGET = "대학생";
export const UNRESTRICTED_TARGET = "대상 제한 없음";

export function isUniversityStudentAudience(
  targets: string[] | null | undefined
): boolean {
  if (!targets?.length) return true;
  return (
    targets.includes(STUDENT_TARGET) ||
    targets.includes(UNRESTRICTED_TARGET)
  );
}

/**
 * PostgREST `.or(...)` — targets가 null/빈배열이거나
 * 대학생·대상 제한 없음을 포함하는 행만.
 */
export const CONTEST_STUDENT_AUDIENCE_OR =
  'targets.is.null,targets.eq.{},targets.cs.{"대학생"},targets.cs.{"대상 제한 없음"}';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyContestStudentAudienceFilter(query: any) {
  return query.or(CONTEST_STUDENT_AUDIENCE_OR);
}
