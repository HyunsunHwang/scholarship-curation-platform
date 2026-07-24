"use client";

const MIN_YEAR = 1980;
const MAX_YEAR = new Date().getFullYear() + 5;
const YEARS = Array.from(
  { length: MAX_YEAR - MIN_YEAR + 1 },
  (_, i) => MAX_YEAR - i
);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

const selectClass =
  "h-9 min-w-0 rounded-lg border border-gray-200 bg-white px-2.5 text-sm text-ink outline-none focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-ink/35";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function parseYearMonth(value: string): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})/.exec(value);
  if (!m) return null;
  return { year: Number(m[1]), month: Number(m[2]) };
}

/**
 * 연도·월 드롭다운. 값은 "YYYY-MM-01"(월 단위) 또는 "".
 */
export default function YearMonthSelect({
  value,
  onChange,
  disabled = false,
  yearAriaLabel = "연도",
  monthAriaLabel = "월",
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  yearAriaLabel?: string;
  monthAriaLabel?: string;
}) {
  const parsed = parseYearMonth(value);
  const year = parsed?.year ?? "";
  const month = parsed?.month ?? "";

  function emit(nextYear: number | "", nextMonth: number | "") {
    if (nextYear === "" || nextMonth === "") {
      onChange("");
      return;
    }
    onChange(`${nextYear}-${pad2(nextMonth)}-01`);
  }

  return (
    <div className="flex gap-1.5">
      <select
        aria-label={yearAriaLabel}
        disabled={disabled}
        value={year}
        onChange={(e) => {
          const y = e.target.value ? Number(e.target.value) : "";
          emit(y, month === "" ? (y === "" ? "" : 1) : month);
        }}
        className={`${selectClass} w-22`}
      >
        <option value="">연도</option>
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <select
        aria-label={monthAriaLabel}
        disabled={disabled}
        value={month}
        onChange={(e) => {
          const m = e.target.value ? Number(e.target.value) : "";
          if (m === "") {
            onChange("");
            return;
          }
          emit(year === "" ? new Date().getFullYear() : year, m);
        }}
        className={`${selectClass} w-17`}
      >
        <option value="">월</option>
        {MONTHS.map((m) => (
          <option key={m} value={m}>
            {m}월
          </option>
        ))}
      </select>
    </div>
  );
}
