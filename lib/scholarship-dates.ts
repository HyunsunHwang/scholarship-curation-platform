/**
 * 장학금 접수 마감·상시모집 판별 (한국 날짜 기준)
 */

/** 한국 시간 기준 오늘 날짜 YYYY-MM-DD */
export function todayKoreaYYYYMMDD(): string {
  const k = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const y = k.getFullYear();
  const m = String(k.getMonth() + 1).padStart(2, "0");
  const d = String(k.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 마감일이 오늘 이전이면 true (목록에서 제외) */
export function isScholarshipExpired(applyEndDate: string): boolean {
  return applyEndDate < todayKoreaYYYYMMDD();
}

/**
 * 상시·연중 모집으로 DB에 표기된 경우 (마감일 연도 2099 이상 등)
 * 실제 데이터에서 2099-12-31 등으로 저장된 장학금을 상시모집으로 표시
 */
export function isAlwaysOpenRecruitment(applyEndDate: string): boolean {
  const y = parseInt(applyEndDate.slice(0, 4), 10);
  return !Number.isNaN(y) && y >= 2099;
}

/** yyyy-mm-dd → yyyy/mm/dd */
function formatSlash(dateStr: string): string {
  return dateStr.replace(/-/g, "/");
}

/**
 * 상세 페이지 접수 기간 한 줄: 상시모집이면 문구만, 아니면 시작~끝
 */
export function formatApplyPeriodRange(
  applyStartDate: string | null,
  applyEndDate: string | null
): string {
  if (applyEndDate && isAlwaysOpenRecruitment(applyEndDate)) {
    return "상시모집";
  }
  const a = applyStartDate ? formatSlash(applyStartDate) : "—";
  const b = applyEndDate ? formatSlash(applyEndDate) : "—";
  return `${a} ~ ${b}`;
}
