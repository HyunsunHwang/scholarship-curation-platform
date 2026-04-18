"use client";

import { useState, useMemo } from "react";
import ScholarshipCard, { type CardScholarship } from "./ScholarshipCard";

type SortOption = "deadline" | "amount";

function matchesSearch(
  name: string,
  organization: string,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    name.toLowerCase().includes(q) ||
    organization.toLowerCase().includes(q)
  );
}

function getDays(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ScholarshipDashboard({
  scholarships,
  bookmarkedIds = [],
  heading = "전체 장학금",
}: {
  scholarships: CardScholarship[];
  bookmarkedIds?: number[];
  heading?: string;
}) {
  const bookmarkedSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("deadline");

  const filtered = useMemo(() => {
    const list = scholarships.filter((s) =>
      matchesSearch(s.name, s.organization, searchQuery)
    );

    return [...list].sort((a, b) => {
      if (sortBy === "deadline") {
        return getDays(a.apply_end_date) - getDays(b.apply_end_date);
      }
      // 금액순: 0(전액)을 최대값으로 취급
      const aVal = a.support_amount === 0 ? Infinity : a.support_amount;
      const bVal = b.support_amount === 0 ? Infinity : b.support_amount;
      return bVal - aVal;
    });
  }, [scholarships, searchQuery, sortBy]);

  return (
    <section id="scholarships" className="bg-gray-50 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{heading}</h2>
            <p className="mt-1 text-sm text-gray-500">
              총{" "}
              <span className="font-semibold text-indigo-600">
                {filtered.length}개
              </span>
              의 장학금
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">정렬:</span>
            <button
              onClick={() => setSortBy("deadline")}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                sortBy === "deadline"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              마감임박순
            </button>
            <button
              onClick={() => setSortBy("amount")}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                sortBy === "amount"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              금액순
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="mt-6 relative max-w-xl">
          <span className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400">
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
            className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-10 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none ring-indigo-500/0 transition-shadow focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20"
            autoComplete="off"
            aria-label="장학금 검색"
          />
          {searchQuery.trim() !== "" && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-8 w-8 text-gray-400"
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
                <p className="text-base font-semibold text-gray-900">
                  등록된 장학금이 없습니다
                </p>
                <p className="text-sm text-gray-500">
                  관리자 패널에서 장학금을 추가해보세요.
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-medium text-gray-900">
                  검색 결과가 없습니다.
                </p>
                <p className="text-sm text-gray-500">
                  다른 검색어로 시도하거나 검색어를 지워 전체 목록을 보세요.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
