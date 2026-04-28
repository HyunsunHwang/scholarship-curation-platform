"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleBookmark } from "@/app/mypage/actions";
import { daysUntilApplyDeadlineKorea, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { formatSupportAmount } from "@/lib/support-amount";

export type CardScholarship = {
  id: number;
  name: string;
  organization: string;
  institution_type: string;
  support_types: string[];
  support_amount: number;
  support_amount_text?: string | null;
  apply_end_date: string;
  poster_image_url?: string | null;
  created_at: string;
  view_count?: number | null;
  scrap_count?: number | null;
  scope?: "campus" | "external";
};

const institutionGradient: Record<string, string> = {
  국가기관:     "from-[#ff3131] to-[#c00000]",
  공공기관:     "from-[#b3e4fb] to-[#5ab8e8]",
  지방자치단체: "from-[#fea276] to-[#e06030]",
  기업:         "from-violet-400 to-purple-600",
  재단법인:     "from-emerald-400 to-teal-600",
  학교법인:     "from-[#fbeca8] to-[#f0c040]",
  "언론/방송":  "from-rose-400 to-red-600",
  종교단체:     "from-[#fbeca8] to-[#fea276]",
  기타:         "from-stone-300 to-stone-500",
};

function formatDeadline(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시모집";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감됨";
  if (days === 0) return "오늘 마감";
  if (days <= 7) return `D-${days} · 마감 임박`;
  const [, m, d] = dateStr.split("-");
  return `${parseInt(m)}월 ${parseInt(d)}일 마감`;
}

function deadlineColor(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "text-brand";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "text-ink/40";
  if (days <= 7) return "text-brand";
  if (days <= 30) return "text-[#e07030]";
  return "text-ink/50";
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
    institutionGradient[scholarship.institution_type] ?? "from-stone-300 to-stone-500";

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
  const displayName = cleanScholarshipName(scholarship.name);
  const supportAmount = formatSupportAmount(
    scholarship.support_amount,
    scholarship.support_amount_text,
    { compact: true }
  );
  const fullSupportAmount = formatSupportAmount(
    scholarship.support_amount,
    scholarship.support_amount_text
  );

  return (
    <div className="group flex flex-col">
      {/* ── 이미지 영역 ── */}
      <Link
        href={`/scholarships/${scholarship.id}`}
        className="relative block overflow-hidden rounded-xl aspect-2/3 sm:rounded-2xl"
      >
        {scholarship.poster_image_url ? (
          <img
            src={scholarship.poster_image_url}
            alt={displayName}
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

        {/* 기관명 오버레이 */}
        <div className="absolute bottom-2 left-2 max-w-[78%] sm:bottom-3 sm:left-3 sm:max-w-[70%]">
          <span className="inline-block max-w-full truncate rounded-full bg-black/40 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm sm:px-2.5 sm:text-xs">
            {scholarship.organization}
          </span>
        </div>

        {/* 북마크 버튼 */}
        <button
          type="button"
          onClick={handleBookmark}
          disabled={isPending}
          aria-label={bookmarked ? "북마크 해제" : "북마크"}
          className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:opacity-50 sm:right-3 sm:top-3 sm:h-8 sm:w-8"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            className={`h-5 w-5 drop-shadow-sm transition-colors sm:h-6 sm:w-6 ${
              bookmarked
                ? "fill-brand stroke-brand"
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
        className="mt-2 flex flex-col gap-0.5 sm:mt-3"
      >
        <p className="text-xs font-semibold leading-snug text-ink line-clamp-2 group-hover:text-brand transition-colors sm:text-sm">
          {displayName}
        </p>
        <p className={`mt-0.5 text-[11px] font-medium sm:text-xs ${color}`}>
          {deadlineLabel}
        </p>
        <p
          className="mt-1 truncate text-xs font-bold text-ink sm:text-sm"
          title={fullSupportAmount}
        >
          {supportAmount}
        </p>
      </Link>
    </div>
  );
}
