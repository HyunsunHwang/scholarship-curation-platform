"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { CardScholarship } from "./ScholarshipCard";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
  todayKoreaYYYYMMDD,
} from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const URGENT_DEADLINE_DAYS = 6;

type CalendarDay = {
  key: string;
  date: Date;
  day: number;
  isCurrentMonth: boolean;
};

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map((part) => parseInt(part, 10));
  return new Date(year, month - 1, day);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthLabel(date: Date): string {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split("-");
  return `${parseInt(month, 10)}월 ${parseInt(day, 10)}일`;
}

function getCalendarDays(monthDate: Date): CalendarDay[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDate = new Date(year, month, 1 - firstDay.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      key: toDateKey(date),
      date,
      day: date.getDate(),
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function getInitialDateKey(scholarships: CardScholarship[]): string {
  const today = todayKoreaYYYYMMDD();
  const upcomingDeadline = scholarships
    .filter((scholarship) => !isAlwaysOpenRecruitment(scholarship.apply_end_date))
    .map((scholarship) => scholarship.apply_end_date.split("T")[0])
    .filter((dateKey) => dateKey >= today)
    .sort((a, b) => a.localeCompare(b))[0];

  return upcomingDeadline ?? today;
}

function deadlineLabel(dateKey: string): string {
  const daysLeft = daysUntilApplyDeadlineKorea(dateKey);
  if (daysLeft === 0) return "오늘 마감";
  if (daysLeft > 0) return `D-${daysLeft}`;
  return "마감됨";
}

export default function BookmarkedScholarshipCalendar({
  scholarships,
}: {
  scholarships: CardScholarship[];
}) {
  const initialDateKey = getInitialDateKey(scholarships);
  const [selectedDateKey, setSelectedDateKey] = useState(initialDateKey);
  const [visibleMonth, setVisibleMonth] = useState(() =>
    parseDateKey(initialDateKey)
  );

  const deadlineScholarships = useMemo(
    () =>
      scholarships
        .filter((scholarship) => !isAlwaysOpenRecruitment(scholarship.apply_end_date))
        .sort((a, b) => a.apply_end_date.localeCompare(b.apply_end_date)),
    [scholarships]
  );

  const alwaysOpenCount = scholarships.length - deadlineScholarships.length;
  const urgentDeadlineCount = deadlineScholarships.filter((scholarship) => {
    const daysLeft = daysUntilApplyDeadlineKorea(scholarship.apply_end_date);
    return daysLeft >= 0 && daysLeft <= URGENT_DEADLINE_DAYS;
  }).length;

  const scholarshipsByDate = useMemo(() => {
    const map = new Map<string, CardScholarship[]>();

    for (const scholarship of deadlineScholarships) {
      const dateKey = scholarship.apply_end_date.split("T")[0];
      const rows = map.get(dateKey) ?? [];
      rows.push(scholarship);
      map.set(dateKey, rows);
    }

    return map;
  }, [deadlineScholarships]);

  const selectedScholarships = scholarshipsByDate.get(selectedDateKey) ?? [];
  const upcomingDeadlines = deadlineScholarships.slice(0, 4);
  const calendarDays = getCalendarDays(visibleMonth);
  const todayKey = todayKoreaYYYYMMDD();

  function moveMonth(offset: number) {
    setVisibleMonth((current) => {
      const next = new Date(current);
      next.setMonth(current.getMonth() + offset, 1);
      return next;
    });
  }

  function selectToday() {
    const today = parseDateKey(todayKey);
    setVisibleMonth(today);
    setSelectedDateKey(todayKey);
  }

  return (
    <section className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
      <div className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-linear-to-r from-brand/10 via-white to-cream px-5 py-5 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-sm font-semibold text-brand">북마크 마감 캘린더</p>
              <h2 className="mt-1 text-2xl font-bold text-ink">
                마감 임박(D-{URGENT_DEADLINE_DAYS}까지) 장학금이{" "}
                <span className="text-brand">{urgentDeadlineCount}개</span>나
                있어요
              </h2>
              <p className="mt-2 text-sm text-ink/60">
                날짜를 누르면 해당일에 마감되는 북마크 장학금이 표시됩니다.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-white px-3 py-1.5 font-semibold text-ink shadow-sm">
                마감 일정 {deadlineScholarships.length}개
              </span>
              {alwaysOpenCount > 0 && (
                <span className="rounded-full bg-brand/10 px-3 py-1.5 font-semibold text-brand">
                  상시모집 {alwaysOpenCount}개
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="p-4 sm:p-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => moveMonth(-1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-ink transition-colors hover:bg-cream"
                  aria-label="이전 달"
                >
                  <span aria-hidden="true">{"<"}</span>
                </button>
                <h3 className="min-w-32 text-center text-lg font-bold text-ink">
                  {monthLabel(visibleMonth)}
                </h3>
                <button
                  type="button"
                  onClick={() => moveMonth(1)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-ink transition-colors hover:bg-cream"
                  aria-label="다음 달"
                >
                  <span aria-hidden="true">{">"}</span>
                </button>
              </div>
              <button
                type="button"
                onClick={selectToday}
                className="self-start rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink transition-colors hover:bg-cream sm:self-auto"
              >
                오늘
              </button>
            </div>

            <div className="grid grid-cols-7 border-b border-gray-100 pb-2 text-center text-xs font-semibold text-ink/50">
              {WEEKDAYS.map((weekday) => (
                <div key={weekday}>{weekday}</div>
              ))}
            </div>

            <div className="mt-2 grid grid-cols-7 gap-1 sm:gap-2">
              {calendarDays.map((day) => {
                const events = scholarshipsByDate.get(day.key) ?? [];
                const isSelected = day.key === selectedDateKey;
                const isToday = day.key === todayKey;

                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => setSelectedDateKey(day.key)}
                    className={`min-h-20 rounded-2xl border p-2 text-left transition-colors sm:min-h-24 ${
                      isSelected
                        ? "border-brand bg-brand text-white shadow-sm"
                        : events.length > 0
                        ? "border-brand/20 bg-brand/5 hover:bg-brand/10"
                        : "border-transparent hover:bg-gray-50"
                    } ${day.isCurrentMonth ? "" : "opacity-40"}`}
                    aria-label={`${formatShortDate(day.key)} 마감 장학금 ${events.length}개`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                          isToday && !isSelected
                            ? "bg-ink text-white"
                            : isSelected
                            ? "bg-white/20 text-white"
                            : "text-ink"
                        }`}
                      >
                        {day.day}
                      </span>
                      {events.length > 0 && (
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                            isSelected
                              ? "bg-white text-brand"
                              : "bg-brand text-white"
                          }`}
                        >
                          {events.length}
                        </span>
                      )}
                    </div>
                    {events.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {events.slice(0, 2).map((scholarship) => (
                          <p
                            key={scholarship.id}
                            className={`truncate text-[11px] font-medium ${
                              isSelected ? "text-white" : "text-ink/70"
                            }`}
                          >
                            {cleanScholarshipName(scholarship.name)}
                          </p>
                        ))}
                        {events.length > 2 && (
                          <p
                            className={`text-[11px] font-semibold ${
                              isSelected ? "text-white/80" : "text-brand"
                            }`}
                          >
                            +{events.length - 2}개 더
                          </p>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <aside className="border-t border-gray-100 bg-beige p-5 lg:border-l lg:border-t-0">
            <div>
              <p className="text-sm font-semibold text-ink/60">선택한 날짜</p>
              <h3 className="mt-1 text-xl font-bold text-ink">
                {formatShortDate(selectedDateKey)}
              </h3>
            </div>

            <div className="mt-5">
              {selectedScholarships.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-gray-200 bg-white p-5 text-sm text-ink/50">
                  이 날짜에 마감되는 북마크 장학금이 없어요.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedScholarships.map((scholarship) => (
                    <Link
                      key={scholarship.id}
                      href={`/scholarships/${scholarship.id}`}
                      className="block rounded-2xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand/40 hover:bg-cream"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm font-bold text-ink">
                            {cleanScholarshipName(scholarship.name)}
                          </p>
                          <p className="mt-1 truncate text-xs text-ink/50">
                            {scholarship.organization}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-brand/10 px-2 py-1 text-xs font-bold text-brand">
                          {deadlineLabel(scholarship.apply_end_date)}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {upcomingDeadlines.length > 0 && (
              <div className="mt-7">
                <h4 className="text-sm font-bold text-ink">다가오는 마감</h4>
                <div className="mt-3 space-y-2">
                  {upcomingDeadlines.map((scholarship) => (
                    <button
                      key={scholarship.id}
                      type="button"
                      onClick={() => {
                        const dateKey = scholarship.apply_end_date.split("T")[0];
                        setSelectedDateKey(dateKey);
                        setVisibleMonth(parseDateKey(dateKey));
                      }}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-left text-sm transition-colors hover:bg-cream"
                    >
                      <span className="min-w-0 truncate font-medium text-ink/70">
                        {cleanScholarshipName(scholarship.name)}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-brand">
                        {formatShortDate(scholarship.apply_end_date)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
