"use client";

import { useState, useTransition } from "react";
import { toggleBookmark } from "@/app/mypage/actions";

export default function BookmarkApplyButtons({
  scholarshipId,
  applyUrl,
  initialBookmarked,
}: {
  scholarshipId: number;
  applyUrl: string;
  initialBookmarked: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, startTransition] = useTransition();

  function handleBookmark() {
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
    <div className="flex gap-3 mt-4">
      <button
        type="button"
        onClick={handleBookmark}
        disabled={isPending}
        className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold border transition-colors ${
          bookmarked
            ? "bg-indigo-50 border-indigo-300 text-indigo-700 hover:bg-indigo-100"
            : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"
        } disabled:opacity-50`}
      >
        <svg
          viewBox="0 0 24 24"
          className={`h-4 w-4 transition-colors ${
            bookmarked ? "fill-indigo-500 stroke-indigo-500" : "fill-none stroke-gray-500"
          }`}
          strokeWidth={1.8}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
          />
        </svg>
        {bookmarked ? "북마크됨" : "북마크"}
      </button>

      <a
        href={applyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-1 items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
      >
        지원하기
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>
    </div>
  );
}
