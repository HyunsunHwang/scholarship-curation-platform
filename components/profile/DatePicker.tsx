"use client";

import { useEffect, useRef, useState } from "react";

const MIN_YEAR = 1980;
const MAX_YEAR = new Date().getFullYear() + 5;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"
      />
    </svg>
  );
}

function ChevronIcon({ className, direction }: { className?: string; direction: "left" | "right" }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={direction === "left" ? "M15.75 19.5L8.25 12l7.5-7.5" : "M8.25 4.5l7.5 7.5-7.5 7.5"}
      />
    </svg>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * "YYYY-MM-DD" 값을 다루는 한국어 날짜 선택 팝오버.
 * 헤더(‹ 2024년 7월 ›)로 월을 이동하고 일 그리드에서 날짜를 고른다.
 * 헤더 제목을 누르면 연도 이동 + 월 그리드 모드로 전환된다.
 */
export default function DatePicker({
  value,
  onChange,
  placeholder = "선택",
  disabled = false,
  align = "left",
  ariaLabel,
}: {
  /** "YYYY-MM-DD" 또는 "" */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** 팝오버 정렬 (오른쪽 배치 필드는 "right" 권장) */
  align?: "left" | "right";
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"days" | "months">("days");
  const now = new Date();

  const parsed = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  const selected = parsed
    ? { year: Number(parsed[1]), month: Number(parsed[2]), day: Number(parsed[3]) }
    : null;

  const [viewYear, setViewYear] = useState(selected?.year ?? now.getFullYear());
  const [viewMonth, setViewMonth] = useState(selected?.month ?? now.getMonth() + 1);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    // capture 단계에서 Escape를 가로채 팝오버만 닫는다 (모달 전체가 닫히지 않도록)
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  function toggle() {
    if (disabled) return;
    if (!open) {
      setViewYear(selected?.year ?? now.getFullYear());
      setViewMonth(selected?.month ?? now.getMonth() + 1);
      setMode("days");
    }
    setOpen((v) => !v);
  }

  function moveMonth(delta: number) {
    let y = viewYear;
    let m = viewMonth + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    if (y < MIN_YEAR || y > MAX_YEAR) return;
    setViewYear(y);
    setViewMonth(m);
  }

  function pickDay(day: number) {
    onChange(`${viewYear}-${pad2(viewMonth)}-${pad2(day)}`);
    setOpen(false);
  }

  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstWeekday = new Date(viewYear, viewMonth - 1, 1).getDay();

  const display = selected
    ? `${selected.year}.${pad2(selected.month)}.${pad2(selected.day)}`
    : "";

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-brand/60 focus:ring-2 focus:ring-brand/15 disabled:bg-gray-50 ${
          display ? "text-ink" : "text-ink/35"
        } ${disabled ? "text-ink/35" : ""}`}
      >
        <span>{display || placeholder}</span>
        <CalendarIcon className="h-4 w-4 shrink-0 text-ink/35" />
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="날짜 선택"
          className={`absolute z-50 mt-1.5 w-64 rounded-xl border border-gray-200 bg-white p-3 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => (mode === "days" ? moveMonth(-1) : setViewYear((y) => Math.max(MIN_YEAR, y - 1)))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink/50 hover:bg-beige hover:text-ink"
              aria-label={mode === "days" ? "이전 달" : "이전 연도"}
            >
              <ChevronIcon direction="left" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMode((m) => (m === "days" ? "months" : "days"))}
              className="rounded-lg px-2 py-1 text-sm font-bold text-ink hover:bg-beige"
              aria-label="연도·월 선택으로 전환"
            >
              {mode === "days" ? `${viewYear}년 ${viewMonth}월` : `${viewYear}년`}
            </button>
            <button
              type="button"
              onClick={() => (mode === "days" ? moveMonth(1) : setViewYear((y) => Math.min(MAX_YEAR, y + 1)))}
              className="flex h-7 w-7 items-center justify-center rounded-full text-ink/50 hover:bg-beige hover:text-ink"
              aria-label={mode === "days" ? "다음 달" : "다음 연도"}
            >
              <ChevronIcon direction="right" className="h-4 w-4" />
            </button>
          </div>

          {mode === "months" ? (
            <div className="mt-2 grid grid-cols-4 gap-1">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
                const isSelected =
                  viewYear === selected?.year && month === selected?.month;
                return (
                  <button
                    key={month}
                    type="button"
                    onClick={() => {
                      setViewMonth(month);
                      setMode("days");
                    }}
                    className={`rounded-lg py-1.5 text-sm font-medium transition-colors ${
                      isSelected
                        ? "bg-brand font-bold text-white"
                        : "text-ink/75 hover:bg-beige"
                    }`}
                  >
                    {month}월
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <div className="mt-2 grid grid-cols-7 text-center">
                {WEEKDAYS.map((day) => (
                  <span key={day} className="py-1 text-[11px] font-semibold text-ink/40">
                    {day}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-y-0.5">
                {Array.from({ length: firstWeekday }, (_, i) => (
                  <span key={`empty-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                  const isSelected =
                    selected !== null &&
                    viewYear === selected.year &&
                    viewMonth === selected.month &&
                    day === selected.day;
                  const isToday =
                    viewYear === now.getFullYear() &&
                    viewMonth === now.getMonth() + 1 &&
                    day === now.getDate();
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => pickDay(day)}
                      className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-sm transition-colors ${
                        isSelected
                          ? "bg-brand font-bold text-white"
                          : isToday
                            ? "bg-brand/10 font-semibold text-brand hover:bg-brand/20"
                            : "text-ink/75 hover:bg-beige"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={() => {
                onChange(
                  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
                );
                setOpen(false);
              }}
              className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink/55 hover:bg-beige hover:text-ink"
            >
              오늘
            </button>
            {value ? (
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="rounded-full px-2.5 py-1 text-xs font-semibold text-ink/55 hover:bg-beige hover:text-ink"
              >
                지우기
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
