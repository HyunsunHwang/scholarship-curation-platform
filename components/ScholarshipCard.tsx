"use client";

import { useState } from "react";
import { getDaysUntilDeadline, type Scholarship } from "@/lib/mock-data";

const categoryGradient: Record<string, string> = {
  성적우수: "from-blue-400 to-blue-600",
  소득기준: "from-emerald-400 to-teal-600",
  지역: "from-orange-400 to-amber-600",
  기업: "from-violet-400 to-purple-600",
  특기: "from-pink-400 to-rose-600",
  국가: "from-indigo-400 to-blue-700",
};

const categoryColor: Record<string, string> = {
  성적우수: "bg-blue-50 text-blue-700 border-blue-200",
  소득기준: "bg-emerald-50 text-emerald-700 border-emerald-200",
  지역: "bg-orange-50 text-orange-700 border-orange-200",
  기업: "bg-violet-50 text-violet-700 border-violet-200",
  특기: "bg-pink-50 text-pink-700 border-pink-200",
  국가: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

function DeadlineBadge({ deadline }: { deadline: string }) {
  const days = getDaysUntilDeadline(deadline);

  if (days < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-400">
        마감됨
      </span>
    );
  }
  if (days === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        D-Day
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
        D-{days}
      </span>
    );
  }
  if (days <= 30) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-600">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
        D-{days}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-500">
      D-{days}
    </span>
  );
}

export default function ScholarshipCard({
  scholarship,
}: {
  scholarship: Scholarship;
}) {
  const [bookmarked, setBookmarked] = useState(false);
  const gradient =
    categoryGradient[scholarship.category] ?? "from-gray-400 to-gray-600";
  const tagColorClass =
    categoryColor[scholarship.category] ??
    "bg-gray-50 text-gray-700 border-gray-200";

  return (
    <div className="group flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5">
      {/* 포스터 영역 */}
      <div className="relative aspect-video overflow-hidden">
        {scholarship.posterUrl ? (
          <img
            src={scholarship.posterUrl}
            alt={scholarship.title}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className={`h-full w-full bg-linear-to-br ${gradient} flex items-end p-4 transition-transform duration-300 group-hover:scale-105`}
          >
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-white/20 border-white/30 text-white backdrop-blur-sm`}
            >
              {scholarship.category}
            </span>
            {scholarship.isNew && (
              <span className="ml-2 inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs font-bold text-indigo-600">
                NEW
              </span>
            )}
          </div>
        )}
      </div>

      {/* 콘텐츠 영역 */}
      <div className="flex flex-1 flex-col p-4 gap-3">
        {/* 마감일 + 북마크 버튼 */}
        <div className="flex items-center justify-between">
          <DeadlineBadge deadline={scholarship.deadline} />
          <button
            type="button"
            onClick={() => setBookmarked((prev) => !prev)}
            aria-label={bookmarked ? "북마크 해제" : "북마크"}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100 active:scale-90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className={`h-5 w-5 transition-colors ${
                bookmarked
                  ? "fill-indigo-500 stroke-indigo-500"
                  : "fill-none stroke-gray-400"
              }`}
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
              />
            </svg>
          </button>
        </div>

        {/* 제목 + 기관 */}
        <div>
          <h3 className="text-base font-bold leading-snug text-gray-900 group-hover:text-indigo-600 transition-colors line-clamp-2">
            {scholarship.title}
          </h3>
          <p className="mt-0.5 text-xs text-gray-400 font-medium">
            {scholarship.organization}
          </p>
        </div>

        {/* 북마크 수 / 조회수 */}
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
              />
            </svg>
            {formatCount(scholarship.bookmarkCount + (bookmarked ? 1 : 0))}
          </span>
          <span className="flex items-center gap-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
              />
            </svg>
            {formatCount(scholarship.viewCount)}
          </span>
        </div>

        {/* 지원 형태 태그 */}
        <div className="flex flex-wrap gap-1.5">
          {scholarship.tags.map((tag) => (
            <span
              key={tag}
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tagColorClass}`}
            >
              {tag}
            </span>
          ))}
        </div>

        {/* 지원 규모 */}
        <div className="mt-auto pt-3 border-t border-gray-50 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
              지원 규모
            </p>
            <p className="mt-0.5 text-xl font-extrabold text-gray-900 leading-none">
              {scholarship.amount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
