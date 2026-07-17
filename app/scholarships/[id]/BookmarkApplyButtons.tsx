"use client";

import { useEffect, useState, useTransition } from "react";
import { toggleBookmark, toggleContestBookmark } from "@/app/mypage/actions";
import { trackAnalyticsEventClient } from "@/lib/analytics/client";

const BOOKMARK_EVENT = "scholarship:bookmark-toggled";

export default function BookmarkApplyButtons({
  scholarshipId,
  applyUrl,
  initialBookmarked,
  showBookmark = true,
  bookmarkTarget = "scholarship",
  variant = "default",
}: {
  scholarshipId: number;
  applyUrl: string;
  initialBookmarked: boolean;
  showBookmark?: boolean;
  /** 공모전·교육·대외활동은 contest_bookmarks 사용 */
  bookmarkTarget?: "scholarship" | "contest";
  /** heroOverlay: 포스터 위 CTA / stack: 세로 버튼만(모달 등) */
  variant?: "default" | "heroOverlay" | "stack";
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
      const result =
        bookmarkTarget === "contest"
          ? await toggleContestBookmark(scholarshipId)
          : await toggleBookmark(scholarshipId);
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

  if (variant === "heroOverlay") {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
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
          className="inline-flex items-center gap-2 rounded-md bg-white px-5 py-2.5 text-sm font-bold text-ink shadow-md transition hover:bg-white/90 active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path d="M8.25 5.25v13.5l11.25-6.75L8.25 5.25z" />
          </svg>
          지원하기
        </a>
        {showBookmark ? (
          <button
            type="button"
            onClick={handleBookmark}
            disabled={isPending}
            aria-label={bookmarked ? "스크랩 해제" : "스크랩하기"}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/70 bg-black/35 text-white backdrop-blur-sm transition hover:border-white hover:bg-black/50 disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-5 w-5 transition-colors ${
                bookmarked ? "fill-brand stroke-brand" : "fill-none stroke-white"
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
        ) : null}
      </div>
    );
  }

  if (variant === "stack") {
    return (
      <div className="mb-3 flex items-center gap-1.5">
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
          className="inline-flex min-w-0 flex-1 items-center justify-center rounded-full bg-brand px-2 py-1.5 text-[11px] font-bold leading-none text-white transition hover:bg-brand/85 active:scale-[0.98]"
        >
          지원하기
        </a>

        {showBookmark ? (
          <button
            type="button"
            onClick={handleBookmark}
            disabled={isPending}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-full border border-gray-200 bg-white px-2 py-1.5 text-[11px] font-medium leading-none text-ink/70 transition hover:bg-cream active:scale-[0.98] disabled:opacity-50"
          >
            <svg
              viewBox="0 0 24 24"
              className={`h-3 w-3 shrink-0 transition-colors ${
                bookmarked ? "fill-brand stroke-brand" : "fill-none stroke-ink/35"
              }`}
              strokeWidth={1.8}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
              />
            </svg>
            {bookmarked ? "스크랩됨" : "스크랩"}
          </button>
        ) : null}
      </div>
    );
  }

  const stackButtons = (
    <div className="mt-4 hidden flex-col gap-2.5 md:flex">
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
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-bold text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] transition hover:bg-brand/85 active:scale-[0.98]"
      >
        지원하기
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
        </svg>
      </a>

      {showBookmark ? (
        <button
          type="button"
          onClick={handleBookmark}
          disabled={isPending}
          className="flex w-full items-center justify-center gap-1.5 rounded-full border border-gray-200 bg-white py-3 text-sm font-medium text-ink/70 shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition hover:bg-cream active:scale-[0.98] disabled:opacity-50"
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
              d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
            />
          </svg>
          {bookmarked ? "스크랩됨" : "스크랩하기"}
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      {stackButtons}

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

          {showBookmark ? (
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
                d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
              />
            </svg>
          </button>
          ) : null}
        </div>
      </div>
    </>
  );
}
