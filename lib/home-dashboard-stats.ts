import type { CardScholarship } from "@/components/ScholarshipCard";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
  isScholarshipExpired,
  todayKoreaYYYYMMDD,
} from "@/lib/scholarship-dates";

export type HomeDashboardStats = {
  userName: string | null;
  /** "7월 29일 수요일" */
  dateLabel: string;
  weekDeadlineCount: number;
  newTodayCount: number;
  savedCount: number;
  recentCount: number;
  urgentCount: number;
  qualifiedCount: number;
};

const WEEKDAY_KO = [
  "일요일",
  "월요일",
  "화요일",
  "수요일",
  "목요일",
  "금요일",
  "토요일",
] as const;

/** Asia/Seoul 달력 기준 Date 부품 */
function koreaDateParts(base = new Date()) {
  const k = new Date(
    base.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  return {
    year: k.getFullYear(),
    month: k.getMonth() + 1,
    day: k.getDate(),
    weekday: k.getDay(),
  };
}

export function formatKoreaDateLabel(base = new Date()): string {
  const { month, day, weekday } = koreaDateParts(base);
  return `${month}월 ${day}일 ${WEEKDAY_KO[weekday]}`;
}

/** 이번 주(월~일) KST YYYY-MM-DD 구간 */
export function koreaWeekRangeYYYYMMDD(base = new Date()): {
  start: string;
  end: string;
} {
  const { year, month, day, weekday } = koreaDateParts(base);
  // weekday: 0=Sun … 월요일 시작 → monOffset
  const monOffset = weekday === 0 ? -6 : 1 - weekday;
  const startUtc = Date.UTC(year, month - 1, day + monOffset);
  const endUtc = Date.UTC(year, month - 1, day + monOffset + 6);

  const fmt = (ms: number) => {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };
  return { start: fmt(startUtc), end: fmt(endUtc) };
}

function createdOnKoreaDay(createdAt: string, today: string): boolean {
  if (!createdAt) return false;
  const k = new Date(
    new Date(createdAt).toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const y = k.getFullYear();
  const m = String(k.getMonth() + 1).padStart(2, "0");
  const d = String(k.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}` === today;
}

/** 카탈로그에서 주간 마감·오늘 신규 집계 (추가 DB 호출 없음) */
export function countCatalogDashboardSignals(catalog: CardScholarship[]): {
  weekDeadlineCount: number;
  newTodayCount: number;
} {
  const today = todayKoreaYYYYMMDD();
  const { start, end } = koreaWeekRangeYYYYMMDD();

  let weekDeadlineCount = 0;
  let newTodayCount = 0;

  for (const item of catalog) {
    if (createdOnKoreaDay(item.created_at, today)) newTodayCount += 1;

    const endDate = item.apply_end_date?.split("T")[0];
    if (!endDate) continue;
    if (isAlwaysOpenRecruitment(endDate)) continue;
    if (isScholarshipExpired(endDate)) continue;
    if (endDate >= start && endDate <= end) weekDeadlineCount += 1;
  }

  return { weekDeadlineCount, newTodayCount };
}

export function buildHomeDashboardStats(input: {
  userName: string | null;
  catalog: CardScholarship[];
  savedCount: number;
  recentCount: number;
  urgentCount: number;
  qualifiedCount: number;
}): HomeDashboardStats {
  const { weekDeadlineCount, newTodayCount } = countCatalogDashboardSignals(
    input.catalog
  );

  return {
    userName: input.userName,
    dateLabel: formatKoreaDateLabel(),
    weekDeadlineCount,
    newTodayCount,
    savedCount: input.savedCount,
    recentCount: input.recentCount,
    urgentCount: input.urgentCount,
    qualifiedCount: input.qualifiedCount,
  };
}

/** 마감 임박 판별이 유효한지 재확인용 (테스트/디버그) */
export function isDeadlineWithinDays(applyEndDate: string, days: number) {
  if (isAlwaysOpenRecruitment(applyEndDate)) return false;
  const d = daysUntilApplyDeadlineKorea(applyEndDate);
  return !Number.isNaN(d) && d >= 0 && d <= days;
}
