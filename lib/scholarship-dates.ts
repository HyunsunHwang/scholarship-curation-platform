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

const MS_PER_DAY = 86_400_000;

/**
 * 한국(Asia/Seoul) 달력 기준, 마감일까지 남은 **일** 수.
 * - `applyEndDate`는 DB의 `date`(YYYY-MM-DD) 문자열.
 * - `new Date("YYYY-MM-DD")`는 UTC 자정으로 해석되어 브라우저 TZ와 섞이면 D-가 하루 어긋날 수 있어,
 *   `isScholarshipExpired`와 같이 **날짜 문자열만** 비교한다.
 * - 반환: 마감 **당일** = 0(오늘 마감), **전날** = 1 (D-1), …
 */
export function daysUntilApplyDeadlineKorea(applyEndDate: string): number {
  const endPart = applyEndDate.split("T")[0];
  const [y1, m1, d1] = endPart.split("-").map((x) => parseInt(x, 10));
  const [y2, m2, d2] = todayKoreaYYYYMMDD()
    .split("-")
    .map((x) => parseInt(x, 10));
  if (!y1 || !m1 || !d1 || !y2 || !m2 || !d2) return NaN;
  const endUtc = Date.UTC(y1, m1 - 1, d1);
  const startUtc = Date.UTC(y2, m2 - 1, d2);
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
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
