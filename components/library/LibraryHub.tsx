"use client";

import { useEffect, useState } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import LibraryCollectionCard from "@/components/library/LibraryCollectionCard";
import {
  readRecentViews,
  RECENT_VIEWS_CHANGED_EVENT,
  type RecentViewItem,
} from "@/lib/recent-views";

function recentSubtitle(items: RecentViewItem[]): string {
  if (items.length === 0) return "아직 본 공고 없음";
  const latest = items[0]?.viewedAt ?? 0;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const today = start.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (latest >= today) return "오늘";
  if (latest >= today - day) return "어제";
  const daysAgo = Math.floor((today - latest) / day);
  if (daysAgo < 7) return `${daysAgo}일 전`;
  return "최근";
}

export default function LibraryHub({
  isLoggedIn,
  savedItems,
}: {
  isLoggedIn: boolean;
  savedItems: CardScholarship[];
}) {
  const [recentViews, setRecentViews] = useState<RecentViewItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => setRecentViews(readRecentViews());
    sync();
    setHydrated(true);
    window.addEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(RECENT_VIEWS_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const recentCovers = recentViews
    .map((item) => item.poster_image_url)
    .slice(0, 4);
  const savedCovers = savedItems
    .map((item) => item.poster_image_url ?? null)
    .slice(0, 4);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-10">
      <h1 className="text-3xl font-extrabold tracking-tight text-ink sm:text-4xl">
        내 라이브러리
      </h1>

      <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:mt-10 sm:gap-x-6 sm:gap-y-10 md:grid-cols-3 lg:grid-cols-4">
        <LibraryCollectionCard
          href="/library/recent"
          title="최근 조회"
          subtitle={hydrated ? recentSubtitle(recentViews) : "…"}
          cover={{ type: "collage", urls: recentCovers }}
        />

        <LibraryCollectionCard
          href={isLoggedIn ? "/library/saved" : "/auth"}
          title="담은 공고"
          subtitle={
            isLoggedIn
              ? savedItems.length > 0
                ? `저장된 항목 ${savedItems.length}개`
                : "아직 담은 공고 없음"
              : "로그인하고 담기"
          }
          cover={
            savedCovers.length > 1
              ? { type: "collage", urls: savedCovers }
              : { type: "single", url: savedCovers[0] ?? null }
          }
        />

        <LibraryCollectionCard
          href={isLoggedIn ? "/matched" : "/auth"}
          title="조건에 맞는 장학금"
          subtitle={isLoggedIn ? "맞춤 추천" : "로그인하고 시작하기"}
          cover={{ type: "icon", tone: "brand" }}
        />

        <LibraryCollectionCard
          href={isLoggedIn ? "/matched?scope=campus" : "/auth"}
          title="교내 기회"
          subtitle={isLoggedIn ? "우리 학교 전용" : "로그인하고 보기"}
          cover={{ type: "icon", tone: "campus" }}
        />
      </div>
    </div>
  );
}
