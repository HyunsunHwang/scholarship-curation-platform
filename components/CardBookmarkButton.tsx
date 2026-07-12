"use client";

import { useState, useTransition } from "react";
import { toggleBookmark } from "@/app/mypage/actions";

/**
 * 카드 북마크만 client island로 분리 — 카드 본문 hydration 부담을 줄인다.
 */
export default function CardBookmarkButton({
  scholarshipId,
  initialBookmarked = false,
}: {
  scholarshipId: number;
  initialBookmarked?: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, startTransition] = useTransition();

  function handleBookmark(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !bookmarked;
    setBookmarked(next);
    startTransition(async () => {
      const result = await toggleBookmark(scholarshipId);
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
      aria-label={bookmarked ? "북마크 해제" : "북마크"}
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
          d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
        />
      </svg>
    </button>
  );
}
