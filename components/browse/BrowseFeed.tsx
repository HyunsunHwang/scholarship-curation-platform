"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import AnnouncementModalProvider from "@/components/announcement/AnnouncementModalProvider";
import BrowseTopRankHero from "@/components/browse/BrowseTopRankHero";
import { cardBookmarkKey } from "@/lib/bookmark-keys";
import {
  BROWSE_SORT_OPTIONS,
  browseHref,
  browsePageTitle,
  type BrowseKind,
  type BrowseSection,
  type BrowseSort,
} from "@/lib/browse-data";

type BrowseFeedProps = {
  items: CardScholarship[];
  page: number;
  totalPages: number;
  totalCount: number;
  kind: BrowseKind;
  sort: BrowseSort;
  section: BrowseSection;
  bookmarkedKeys: string[];
  topRank?: CardScholarship[];
};

export default function BrowseFeed({
  items,
  page,
  totalPages,
  totalCount,
  kind,
  sort,
  section,
  bookmarkedKeys,
  topRank = [],
}: BrowseFeedProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const bookmarkedSet = new Set(bookmarkedKeys);
  const title = browsePageTitle(kind, section);
  const showTopRank = page <= 1 && topRank.length >= 5;

  function goTo(opts: {
    sort?: BrowseSort;
    page?: number;
  }) {
    startTransition(() => {
      router.push(
        browseHref({
          kind,
          section,
          sort: opts.sort ?? sort,
          page: opts.page ?? 1,
        })
      );
    });
  }

  return (
    <AnnouncementModalProvider>
    <div className="w-full">
      {showTopRank ? (
        <BrowseTopRankHero title={title} items={topRank} />
      ) : null}

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:mb-8">
        {!showTopRank ? (
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/browse"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink/55 transition-colors hover:text-ink"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              탐색
            </Link>
          </div>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
              {showTopRank ? "전체 목록" : title}
            </h1>
            <p className="mt-1.5 text-sm text-ink/50">
              총{" "}
              <span className="font-semibold text-brand">
                {totalCount.toLocaleString()}
              </span>
              개
              {totalPages > 1 ? (
                <span className="text-ink/40">
                  {" "}
                  · {page} / {totalPages} 페이지
                </span>
              ) : null}
            </p>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm text-ink/55">정렬</span>
            <div
              role="toolbar"
              aria-label="정렬"
              className={`flex gap-1.5 overflow-x-auto [scrollbar-width:none] ${isPending ? "opacity-60" : ""}`}
            >
              {BROWSE_SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  disabled={isPending}
                  onClick={() => goTo({ sort: opt.key, page: 1 })}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                    sort === opt.key
                      ? "bg-ink text-white"
                      : "bg-beige text-ink/70 hover:bg-cream"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <p className="text-lg font-semibold text-ink">표시할 공고가 없습니다</p>
          <p className="mt-1 text-sm text-ink/50">다른 정렬이나 카테고리를 선택해 보세요.</p>
          <Link
            href="/"
            className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/85"
          >
            홈으로 돌아가기
          </Link>
        </div>
      ) : (
        <>
          <div
            className={`grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5 ${
              isPending ? "opacity-60" : ""
            }`}
          >
            {items.map((item) => (
              <ScholarshipCard
                key={`${item.content_kind ?? "scholarship"}-${item.id}`}
                scholarship={item}
                initialBookmarked={bookmarkedSet.has(cardBookmarkKey(item))}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || isPending}
                onClick={() => goTo({ page: page - 1 })}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                이전
              </button>
              <span className="min-w-16 text-center text-sm text-ink/60">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages || isPending}
                onClick={() => goTo({ page: page + 1 })}
                className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                다음
              </button>
            </div>
          )}
        </>
      )}
      </div>
    </div>
    </AnnouncementModalProvider>
  );
}
