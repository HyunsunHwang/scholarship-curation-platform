"use client";

import { useEffect, useState } from "react";
import { getScholarshipLiveCounts } from "./actions";

const BOOKMARK_EVENT = "scholarship:bookmark-toggled";
const VIEW_EVENT = "scholarship:view-incremented";

type BookmarkEventDetail = {
  scholarshipId: number;
  bookmarked: boolean;
};

type ViewEventDetail = {
  scholarshipId: number;
  viewCount?: number;
};

export default function LiveEngagementBadges({
  scholarshipId,
  initialViewCount,
  initialScrapCount,
}: {
  scholarshipId: number;
  initialViewCount: number;
  initialScrapCount: number;
}) {
  const [viewCount, setViewCount] = useState(initialViewCount);
  const [scrapCount, setScrapCount] = useState(initialScrapCount);

  useEffect(() => {
    let isUnmounted = false;

    const syncCounts = async () => {
      const latest = await getScholarshipLiveCounts(scholarshipId);
      if (isUnmounted) return;
      setViewCount(latest.viewCount);
      setScrapCount(latest.scrapCount);
    };

    const onBookmarkToggled = (event: Event) => {
      const detail = (event as CustomEvent<BookmarkEventDetail>).detail;
      if (!detail || detail.scholarshipId !== scholarshipId) return;
      setScrapCount((prev) => Math.max(0, prev + (detail.bookmarked ? 1 : -1)));
    };

    const onViewIncremented = (event: Event) => {
      const detail = (event as CustomEvent<ViewEventDetail>).detail;
      if (!detail || detail.scholarshipId !== scholarshipId) return;
      if (typeof detail.viewCount === "number") {
        setViewCount(detail.viewCount);
      } else {
        setViewCount((prev) => prev + 1);
      }
    };

    const onFocusOrVisible = () => {
      if (document.visibilityState === "visible") {
        void syncCounts();
      }
    };

    window.addEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
    window.addEventListener(VIEW_EVENT, onViewIncremented as EventListener);
    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    const intervalId = window.setInterval(() => {
      void syncCounts();
    }, 15000);

    return () => {
      isUnmounted = true;
      window.removeEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
      window.removeEventListener(VIEW_EVENT, onViewIncremented as EventListener);
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
      window.clearInterval(intervalId);
    };
  }, [scholarshipId]);

  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink/70 shadow-sm">
        <svg className="h-3.5 w-3.5 text-ink/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
        </svg>
        조회 {viewCount.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-semibold text-ink/70 shadow-sm">
        <svg className="h-3.5 w-3.5 text-ink/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0Z" />
        </svg>
        스크랩 {scrapCount.toLocaleString()}
      </span>
    </div>
  );
}
