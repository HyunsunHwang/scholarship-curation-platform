"use client";

import { useState, useTransition } from "react";
import { toggleBookmark } from "@/app/mypage/actions";

export type CardScholarship = {
  id: number;
  name: string;
  organization: string;
  institution_type: string;
  support_types: string[];
  support_amount: number;
  apply_end_date: string;
  poster_image_url?: string | null;
  created_at: string;
};

const institutionGradient: Record<string, string> = {
  국가기관: "from-indigo-400 to-blue-700",
  공공기관: "from-blue-400 to-cyan-600",
  지방자치단체: "from-orange-400 to-amber-600",
  기업: "from-violet-400 to-purple-600",
  재단법인: "from-emerald-400 to-teal-600",
  학교법인: "from-cyan-400 to-sky-600",
  "언론/방송": "from-red-400 to-rose-600",
  종교단체: "from-yellow-400 to-amber-600",
  기타: "from-gray-400 to-gray-600",
};

const institutionTagColor: Record<string, string> = {
  국가기관: "bg-indigo-50 text-indigo-700 border-indigo-200",
  공공기관: "bg-blue-50 text-blue-700 border-blue-200",
  지방자치단체: "bg-orange-50 text-orange-700 border-orange-200",
  기업: "bg-violet-50 text-violet-700 border-violet-200",
  재단법인: "bg-emerald-50 text-emerald-700 border-emerald-200",
  학교법인: "bg-cyan-50 text-cyan-700 border-cyan-200",
  "언론/방송": "bg-red-50 text-red-700 border-red-200",
  종교단체: "bg-yellow-50 text-yellow-700 border-yellow-200",
  기타: "bg-gray-50 text-gray-700 border-gray-200",
};

function getDaysUntilDeadline(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(dateStr);
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function formatAmount(won: number): string {
  if (won === 0) return "전액";
  const manWon = won / 10000;
  if (manWon >= 10000) return `연 ${(manWon / 10000).toFixed(0)}억원`;
  if (manWon >= 1) return `연 ${manWon.toLocaleString()}만원`;
  return `연 ${won.toLocaleString()}원`;
}

function isNewScholarship(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < 14 * 24 * 60 * 60 * 1000;
}

function DeadlineBadge({ dateStr }: { dateStr: string }) {
  const days = getDaysUntilDeadline(dateStr);

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
  initialBookmarked = false,
}: {
  scholarship: CardScholarship;
  initialBookmarked?: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, startTransition] = useTransition();

  const gradient = institutionGradient[scholarship.institution_type] ?? "from-gray-400 to-gray-600";
  const tagColorClass = institutionTagColor[scholarship.institution_type] ?? "bg-gray-50 text-gray-700 border-gray-200";
  const showNew = isNewScholarship(scholarship.created_at);

  function handleBookmark() {
    const next = !bookmarked;
    setBookmarked(next); // 낙관적 업데이트
    startTransition(async () => {
      const result = await toggleBookmark(scholarship.id);
      if ("error" in result) {
        setBookmarked(!next); // 실패 시 되돌리기
        if (result.error === "로그인이 필요합니다.") {
          alert("북마크하려면 로그인이 필요합니다.");
        }
      }
    });
  }

  return (
    <div className="group flex flex-col rounded-2xl border border-gray-100 bg-white overflow-hidden shadow-sm transition-all hover:shadow-lg hover:-translate-y-0.5">
      {/* 포스터 영역 */}
      <div className="relative aspect-video overflow-hidden">
        {scholarship.poster_image_url ? (
          <img
            src={scholarship.poster_image_url}
            alt={scholarship.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div
            className={`h-full w-full bg-linear-to-br ${gradient} flex items-end p-4 transition-transform duration-300 group-hover:scale-105`}
          >
            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold bg-white/20 border-white/30 text-white backdrop-blur-sm">
              {scholarship.institution_type}
            </span>
            {showNew && (
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
          <DeadlineBadge dateStr={scholarship.apply_end_date} />
          <button
            type="button"
            onClick={handleBookmark}
            disabled={isPending}
            aria-label={bookmarked ? "북마크 해제" : "북마크"}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-gray-100 active:scale-90 disabled:opacity-50"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              className={`h-5 w-5 transition-colors ${
                bookmarked ? "fill-indigo-500 stroke-indigo-500" : "fill-none stroke-gray-400"
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
            {scholarship.name}
          </h3>
          <p className="mt-0.5 text-xs text-gray-400 font-medium">
            {scholarship.organization}
          </p>
        </div>

        {/* 지원 형태 태그 */}
        {scholarship.support_types.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {scholarship.support_types.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${tagColorClass}`}
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* 지원 규모 */}
        <div className="mt-auto pt-3 border-t border-gray-50">
          <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">
            지원 규모
          </p>
          <p className="mt-0.5 text-xl font-extrabold text-gray-900 leading-none">
            {formatAmount(scholarship.support_amount)}
          </p>
        </div>
      </div>
    </div>
  );
}
