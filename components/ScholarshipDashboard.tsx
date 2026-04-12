"use client";

import { useState, useMemo } from "react";
import {
  getDaysUntilDeadline,
  scholarships,
  type ScholarshipCategory,
} from "@/lib/mock-data";
import ScholarshipCard from "./ScholarshipCard";

type SortOption = "deadline" | "amount";

const CATEGORIES: { label: string; value: ScholarshipCategory | "전체" }[] = [
  { label: "전체", value: "전체" },
  { label: "국가", value: "국가" },
  { label: "소득기준", value: "소득기준" },
  { label: "성적우수", value: "성적우수" },
  { label: "기업", value: "기업" },
  { label: "지역", value: "지역" },
  { label: "특기", value: "특기" },
];

export default function ScholarshipDashboard() {
  const [activeCategory, setActiveCategory] = useState<
    ScholarshipCategory | "전체"
  >("전체");
  const [sortBy, setSortBy] = useState<SortOption>("deadline");

  const filtered = useMemo(() => {
    const list =
      activeCategory === "전체"
        ? scholarships
        : scholarships.filter((s) => s.category === activeCategory);

    return [...list].sort((a, b) => {
      if (sortBy === "deadline") {
        return (
          getDaysUntilDeadline(a.deadline) - getDaysUntilDeadline(b.deadline)
        );
      }
      // 금액순: 전액(0)을 가장 높은 값으로 취급
      const aVal = a.amountValue === 0 ? Infinity : a.amountValue;
      const bVal = b.amountValue === 0 ? Infinity : b.amountValue;
      return bVal - aVal;
    });
  }, [activeCategory, sortBy]);

  return (
    <section id="scholarships" className="bg-gray-50 py-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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

        <div className="mt-6 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setActiveCategory(cat.value)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.value
                  ? "bg-gray-900 text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="mt-16 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-lg font-medium text-gray-900">
              해당 카테고리의 장학금이 없습니다.
            </p>
            <p className="text-sm text-gray-500">다른 카테고리를 선택해보세요.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((scholarship) => (
              <ScholarshipCard key={scholarship.id} scholarship={scholarship} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
