"use client";

import { useState, useTransition } from "react";
import { toggleBookmark, toggleContestBookmark } from "@/app/mypage/actions";

/**
 * 카드 북마크만 client island로 분리 — 카드 본문 hydration 부담을 줄인다.
 */
export default function CardBookmarkButton({
  scholarshipId,
  initialBookmarked = false,
  bookmarkTarget = "scholarship",
}: {
  scholarshipId: number;
  initialBookmarked?: boolean;
  bookmarkTarget?: "scholarship" | "contest";
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, startTransition] = useTransition();

  function handleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const result =
        bookmarkTarget === "contest"
          ? await toggleContestBookmark(scholarshipId)
          : await toggleBookmark(scholarshipId);
      if ("error" in result) {
        setBookmarked(!next);
        if (result.error === "로그인이 필요합니다.") {
          alert("북마크하려면 로그인이 필요합니다.");
        }
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleBookmark}
      disabled={isPending}
      aria-label={bookmarked ? "스크랩 해제" : "스크랩"}
      className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-opacity disabled:opacity-50 sm:right-3 sm:top-3 sm:h-8 sm:w-8"
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
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
        />
      </svg>
    </button>
  );
}
