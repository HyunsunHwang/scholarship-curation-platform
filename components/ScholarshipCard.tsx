"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleBookmark } from "@/app/mypage/actions";
import { isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";

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

function formatDeadline(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시모집";
  const days = getDaysUntilDeadline(dateStr);
  if (days < 0) return "마감됨";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days} · 마감 임박`;
  // yyyy-mm-dd → mm월 dd일
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}월 ${parseInt(d)}일 마감`;
}

function deadlineColor(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "text-indigo-600";
  const days = getDaysUntilDeadline(dateStr);
  if (days < 0) return "text-gray-400";
  if (days <= 7) return "text-red-500";
  if (days <= 30) return "text-amber-600";
  return "text-gray-500";
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

  const gradient =
    institutionGradient[scholarship.institution_type] ?? "from-gray-400 to-gray-600";

  function handleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const result = await toggleBookmark(scholarship.id);
      if ("error" in result) {
        setBookmarked(!next);
        if (result.error === "로그인이 필요합니다.") {
          alert("북마크하려면 로그인이 필요합니다.");
        }
      }
    });
  }

  const color = deadlineColor(scholarship.apply_end_date);
  const deadlineLabel = formatDeadline(scholarship.apply_end_date);

  return (
    <div className="group flex flex-col">
      {/* ── 이미지 영역 ── */}
      <Link
        href={`/scholarships/${scholarship.id}`}
        className="relative block overflow-hidden rounded-2xl aspect-2/3"
      >
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
            <span className="inline-flex items-center rounded-full border border-white/30 bg-white/20 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
              {scholarship.institution_type}
            </span>
          </div>
        )}

        {/* 북마크 버튼 (에어비엔비 스타일 — 이미지 위 오버레이) */}
        <button
          type="button"
          onClick={handleBookmark}
          disabled={isPending}
          aria-label={bookmarked ? "북마크 해제" : "북마크"}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full transition-opacity disabled:opacity-50"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className={`h-6 w-6 drop-shadow-sm transition-colors ${
              bookmarked
                ? "fill-indigo-500 stroke-indigo-500"
                : "fill-black/20 stroke-white"
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
      </Link>

      {/* ── 텍스트 영역 ── */}
      <Link
        href={`/scholarships/${scholarship.id}`}
        className="mt-3 flex flex-col gap-0.5"
      >
        {/* 장학금 이름 */}
        <p className="text-sm font-semibold leading-snug text-gray-900 line-clamp-2 group-hover:text-indigo-600 transition-colors">
          {scholarship.name}
        </p>

        {/* 기관명 */}
        <p className="text-xs text-gray-400">{scholarship.organization}</p>

        {/* 마감일 */}
        <p className={`mt-0.5 text-xs font-medium ${color}`}>{deadlineLabel}</p>

        {/* 지원 금액 */}
        <p className="mt-1 text-sm font-bold text-gray-900">
          {formatAmount(scholarship.support_amount)}
        </p>
      </Link>
    </div>
  );
}
