"use client";

import { useEffect, useMemo, useState } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import {
  readRecentViews,
  RECENT_VIEWS_CHANGED_EVENT,
  type RecentViewItem,
} from "@/lib/recent-views";
import { cardBookmarkKey } from "@/lib/bookmark-keys";
import { isScholarshipExpired } from "@/lib/scholarship-dates";
import { buildContinueWatching } from "@/lib/home-rails";
import HomeSectionTitle from "./HomeSectionTitle";
import HorizontalShelf from "./HorizontalShelf";

function toCard(item: RecentViewItem): CardScholarship {
  return {
    id: item.id,
    name: item.name,
    organization: item.organization,
    institution_type: "기타",
    support_types: [],
    apply_end_date: item.apply_end_date,
    poster_image_url: item.poster_image_url,
    created_at: new Date(item.viewedAt).toISOString(),
    content_kind: item.content_kind,
  };
}

export default function RecentViewsShelf({
  bookmarkedKeys = [],
  serverRecent = [],
}: {
  bookmarkedKeys?: string[];
  /** 서버 browse_events (로그인) — localStorage와 병합 */
  serverRecent?: CardScholarship[];
}) {
  const [localRecent, setLocalRecent] = useState<CardScholarship[]>([]);
  const bookmarkedSet = useMemo(() => new Set(bookmarkedKeys), [bookmarkedKeys]);

  useEffect(() => {
    function sync() {
      setLocalRecent(
        readRecentViews()
          .filter((row) => !isScholarshipExpired(row.apply_end_date))
          .map(toCard)
      );
    }
    sync();
    window.addEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const items = useMemo(
    () =>
      buildContinueWatching({
        serverRecent,
        localRecent,
      }),
    [serverRecent, localRecent]
  );

  if (items.length === 0) return null;

  const hasServer = serverRecent.length > 0;

  return (
    <section aria-labelledby="continue-watching-heading" className="mt-8 sm:mt-10">
      <HomeSectionTitle
        id="continue-watching-heading"
        title="이어서 보기"
        href="/library/recent"
        subtitle={
          hasServer
            ? "여러 기기에서 이어 본 공고"
            : "최근 본 공고를 이어서 살펴보세요"
        }
      />
      <HorizontalShelf
        label="이어서 보기"
        items={items}
        getKey={(s) => `continue-${s.content_kind ?? "scholarship"}-${s.id}`}
        renderItem={(scholarship) => (
          <ScholarshipCard
            scholarship={scholarship}
            initialBookmarked={bookmarkedSet.has(cardBookmarkKey(scholarship))}
          />
        )}
      />
    </section>
  );
}
