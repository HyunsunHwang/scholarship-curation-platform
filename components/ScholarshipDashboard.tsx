"use client";

import { useState, useMemo } from "react";
import ScholarshipCard, { type CardScholarship } from "./ScholarshipCard";

type SortOption = "deadline" | "amount";

const INSTITUTION_LABEL: Record<string, string> = {
  국가기관: "국가기관",
  공공기관: "공공기관",
  지방자치단체: "지역",
  기업: "기업",
  재단법인: "재단",
  학교법인: "학교",
  "언론/방송": "언론",
  종교단체: "종교",
  기타: "기타",
};

function getDays(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ScholarshipDashboard({
  scholarships,
  bookmarkedIds = [],
}: {
  scholarships: CardScholarship[];
  bookmarkedIds?: number[];
}) {
  const bookmarkedSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);
  const [activeType, setActiveType] = useState<string>("전체");
  const [sortBy, setSortBy] = useState<SortOption>("deadline");

  // 실제 데이터에 존재하는 institution_type만 카테고리로 노출
  const categories = useMemo(() => {
    const types = Array.from(new Set(scholarships.map((s) => s.institution_type)));
    return [
      { label: "전체", value: "전체" },
      ...types.map((t) => ({ label: INSTITUTION_LABEL[t] ?? t, value: t })),
    ];
  }, [scholarships]);

  const filtered = useMemo(() => {
    const list =
      activeType === "전체"
        ? scholarships
        : scholarships.filter((s) => s.institution_type === activeType);

    return [...list].sort((a, b) => {
      if (sortBy === "deadline") {
        return getDays(a.apply_end_date) - getDays(b.apply_end_date);
      }
      // 금액순: 0(전액)을 최대값으로 취급
      const aVal = a.support_amount === 0 ? Infinity : a.support_amount;
      const bVal = b.support_amount === 0 ? Infinity : b.support_amount;
      return bVal - aVal;
    });
  }, [scholarships, activeType, sortBy]);

  return (
    <section id="scholarships" className="bg-gray-50 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">전체 장학금</h2>
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

        {/* 카테고리 필터 */}
        {categories.length > 1 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat.value}
                onClick={() => setActiveType(cat.value)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  activeType === cat.value
                    ? "bg-gray-900 text-white"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        )}

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
                  해당 유형의 장학금이 없습니다.
                </p>
                <p className="text-sm text-gray-500">다른 카테고리를 선택해보세요.</p>
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
