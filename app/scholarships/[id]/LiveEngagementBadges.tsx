"use client";

import { useEffect, useState } from "react";

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

/**
 * 서버에서 받은 초기 조회/스크랩 수를 보여주고,
 * 같은 탭 내 북마크·조회수 이벤트만 반영한다. (폴링 없음)
 */
function LiveEngagementBadgesState({
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

    window.addEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
    window.addEventListener(VIEW_EVENT, onViewIncremented as EventListener);

    return () => {
      window.removeEventListener(BOOKMARK_EVENT, onBookmarkToggled as EventListener);
      window.removeEventListener(VIEW_EVENT, onViewIncremented as EventListener);
    };
  }, [scholarshipId]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-ink/70 shadow-sm">
        <svg className="h-3.5 w-3.5 text-ink/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12s3.75-6.75 9.75-6.75S21.75 12 21.75 12s-3.75 6.75-9.75 6.75S2.25 12 2.25 12Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0Z" />
        </svg>
        조회 {viewCount.toLocaleString()}
      </span>
      <span className="inline-flex min-w-0 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-ink/70 shadow-sm">
        <svg className="h-3.5 w-3.5 text-ink/35" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
        </svg>
        스크랩 {scrapCount.toLocaleString()}
      </span>
    </div>
  );
}

export default function LiveEngagementBadges(props: {
  scholarshipId: number;
  initialViewCount: number;
  initialScrapCount: number;
}) {
  return (
    <LiveEngagementBadgesState
      key={`${props.scholarshipId}:${props.initialViewCount}:${props.initialScrapCount}`}
      {...props}
    />
  );
}
