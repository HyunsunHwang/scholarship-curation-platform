"use client";

import { useState, useMemo } from "react";
import ScholarshipCard, { type CardScholarship } from "./ScholarshipCard";
import { daysUntilApplyDeadlineKorea } from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";

type SortOption = "deadline" | "latest" | "views" | "scraps";
type ScopeFilter = "all" | NonNullable<CardScholarship["scope"]>;

const SORT_OPTIONS: { key: SortOption; label: string }[] = [
  { key: "deadline", label: "마감임박순" },
  { key: "latest", label: "최신순" },
  { key: "views", label: "조회수" },
  { key: "scraps", label: "스크랩수" },
];

function matchesSearch(
  name: string,
  organization: string,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const displayName = cleanScholarshipName(name).toLowerCase();
  return (
    name.toLowerCase().includes(q) ||
    displayName.includes(q) ||
    organization.toLowerCase().includes(q)
  );
}

export default function ScholarshipDashboard({
  scholarships,
  bookmarkedIds = [],
  heading = "전체 장학금",
  showScopeTabs = false,
}: {
  scholarships: CardScholarship[];
  bookmarkedIds?: number[];
  heading?: string;
  showScopeTabs?: boolean;
}) {
  const bookmarkedSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("deadline");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");

  const scopeTabs = useMemo(
    () => [
      { key: "all" as const, label: "전체 장학금", count: scholarships.length },
      {
        key: "campus" as const,
        label: "교내 장학금",
        count: scholarships.filter((s) => s.scope === "campus").length,
      },
      {
        key: "external" as const,
        label: "교외 장학금",
        count: scholarships.filter((s) => s.scope === "external").length,
      },
    ],
    [scholarships]
  );

  const filtered = useMemo(() => {
    const list = scholarships.filter((s) => {
      const matchesScope = scopeFilter === "all" || s.scope === scopeFilter;
      return matchesScope && matchesSearch(s.name, s.organization, searchQuery);
    });

    return [...list].sort((a, b) => {
      if (sortBy === "deadline") {
        return (
          daysUntilApplyDeadlineKorea(a.apply_end_date) -
          daysUntilApplyDeadlineKorea(b.apply_end_date)
        );
      }
      if (sortBy === "latest") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortBy === "views") {
        return (b.view_count ?? 0) - (a.view_count ?? 0);
      }
      return (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
    });
  }, [scholarships, scopeFilter, searchQuery, sortBy]);

  return (
    <section id="scholarships" className="bg-[#fafafa] py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-ink">{heading}</h2>
            <p className="mt-1 text-sm text-ink/60">
              총{" "}
              <span className="font-semibold text-brand">
                {filtered.length}개
              </span>
              의 장학금
            </p>
          </div>

          <div className="flex w-full min-w-0 items-center gap-2 sm:max-w-[min(100%,28rem)] sm:flex-1 sm:justify-end lg:max-w-none">
            <span className="shrink-0 text-sm text-ink/60">정렬:</span>
            <div
              role="toolbar"
              aria-label="정렬 기준 선택"
              className="flex min-h-[2.25rem] min-w-0 flex-1 flex-nowrap items-center gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
            >
              {SORT_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setSortBy(option.key)}
                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                    sortBy === option.key
                      ? "bg-brand text-white"
                      : "border border-gray-200 bg-white text-ink/70 hover:bg-[#fff0f0]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {showScopeTabs && (
          <div className="mt-5 flex flex-wrap gap-2">
            {scopeTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setScopeFilter(tab.key)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  scopeFilter === tab.key
                    ? "border-brand bg-brand text-white"
                    : "border-gray-200 bg-white text-ink/70 hover:bg-cream"
                }`}
              >
                {tab.label}
                <span className="ml-1.5 text-xs opacity-75">{tab.count}</span>
              </button>
            ))}
          </div>
        )}

        {/* 검색 */}
        <div className="mt-6 relative max-w-xl">
          <span className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              className="h-4 w-4"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
          </span>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="장학금 이름 또는 기관명 검색"
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink/40 shadow-sm outline-none transition-shadow focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
            autoComplete="off"
            aria-label="장학금 검색"
          />
          {searchQuery.trim() !== "" && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-ink/40 hover:bg-[#fff0f0] hover:text-ink"
              aria-label="검색어 지우기"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18 18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>

        {/* 카드 그리드 */}
        {filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center gap-3 text-center">
            {scholarships.length === 0 ? (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand/10">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-peach"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 14l9-5-9-5-9 5 9 5zm0 0v6"
                    />
                  </svg>
                </div>
                <p className="text-base font-semibold text-ink">
                  등록된 장학금이 없습니다
                </p>
                <p className="text-sm text-ink/50">
                  관리자 패널에서 장학금을 추가해보세요.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-ink">
                  검색 결과가 없습니다.
                </p>
                <p className="text-sm text-ink/50">
                  다른 검색어로 시도하거나 검색어를 지워 전체 목록을 보세요.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-8 grid gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((scholarship) => (
              <ScholarshipCard
                key={scholarship.id}
                scholarship={scholarship}
                initialBookmarked={bookmarkedSet.has(scholarship.id)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
