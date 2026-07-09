"use client";

import { useEffect, useState, useTransition } from "react";
import { toggleBookmark } from "@/app/mypage/actions";
import { trackAnalyticsEventClient } from "@/lib/analytics/client";

const BOOKMARK_EVENT = "scholarship:bookmark-toggled";

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

  useEffect(() => {
    const onBookmarkToggled = (event: Event) => {
      const detail = (event as CustomEvent<{ scholarshipId: number; bookmarked: boolean }>).detail;
      if (!detail || detail.scholarshipId !== scholarshipId) return;
      setBookmarked(detail.bookmarked);
    };
    window.addEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
    return () => window.removeEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
  }, [scholarshipId]);

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
        return;
      }
      window.dispatchEvent(
        new CustomEvent(BOOKMARK_EVENT, {
          detail: { scholarshipId, bookmarked: result.bookmarked },
        })
      );
    });
  }

  return (
    <>
      <div className="mt-4 hidden flex-col gap-2 md:flex">
        <a
          href={applyUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void trackAnalyticsEventClient({
              eventName: "apply_clicked",
              scholarshipId,
            });
          }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3.5 text-sm font-bold text-white shadow-md shadow-brand/25 transition hover:bg-brand/85 active:scale-95"
        >
          지원하기
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
        </a>

        <button
          type="button"
          onClick={handleBookmark}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white py-3 text-sm font-medium text-ink/70 transition hover:bg-cream active:scale-95 disabled:opacity-50"
        >
          <svg
            viewBox="0 0 24 24"
            className={`h-4 w-4 transition-colors ${
              bookmarked ? "fill-brand stroke-brand" : "fill-none stroke-ink/35"
            }`}
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0 1 11.186 0Z"
            />
          </svg>
          {bookmarked ? "스크랩됨" : "스크랩하기"}
        </button>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-6px_20px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2">
          <a
            href={applyUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => {
              void trackAnalyticsEventClient({
                eventName: "apply_clicked",
                scholarshipId,
              });
            }}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#6ca6e8] px-4 py-3 text-sm font-bold text-white transition hover:bg-[#5f99da] active:scale-[0.98]"
          >
            지원하기
          </a>

          <button
            type="button"
            onClick={handleBookmark}
            disabled={isPending}
            aria-label={bookmarked ? "스크랩 해제" : "스크랩하기"}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-gray-300 bg-white text-ink/70 transition hover:bg-cream active:scale-95 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 transition-colors ${
                bookmarked ? "fill-brand stroke-brand" : "fill-none stroke-ink/45"
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
      </div>
    </>
  );
}
