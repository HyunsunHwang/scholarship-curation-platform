"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import {
  CONTENT_CATEGORIES,
  categoryHasData,
  type ContentCategoryKey,
} from "@/lib/content-categories";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { daysUntilApplyDeadlineKorea } from "@/lib/scholarship-dates";
import { useHomeSearchQuery } from "./HomeSearchBar";
import HorizontalShelf from "./HorizontalShelf";

const TRENDING_LIMIT = 16;
/** 전체 공고 선반 초기 노출 수 — 나머지는 더보기로 */
const ALL_SHELF_INITIAL = 36;
const ALL_SHELF_STEP = 36;

function itemKey(item: CardScholarship) {
  return `${item.content_kind ?? "scholarship"}-${item.id}`;
}

function matchesSearch(
  name: string,
  organization: string,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const displayName = cleanScholarshipName(name).toLowerCase();
  return (
    name.toLowerCase().includes(q) ||
    displayName.includes(q) ||
    organization.toLowerCase().includes(q)
  );
}

function filterByCategory(
  list: CardScholarship[],
  category: ContentCategoryKey
): CardScholarship[] {
  if (!categoryHasData(category)) return [];
  if (category === "all") return list;
  return list.filter((item) => (item.content_kind ?? "scholarship") === category);
}

function ShelfCard({
  scholarship,
  bookmarked,
}: {
  scholarship: CardScholarship;
  bookmarked: boolean;
}) {
  return (
    <div
      role="listitem"
      className="w-[138px] shrink-0 sm:w-[156px] md:w-[172px] lg:w-[188px]"
    >
      <ScholarshipCard
        scholarship={scholarship}
        initialBookmarked={bookmarked}
      />
    </div>
  );
}

export default function HomeFeed({
  scholarships,
  bookmarkedIds = [],
}: {
  scholarships: CardScholarship[];
  bookmarkedIds?: number[];
}) {
  const [category, setCategory] = useState<ContentCategoryKey>("all");
  const [allVisibleCount, setAllVisibleCount] = useState(ALL_SHELF_INITIAL);
  const searchQuery = useHomeSearchQuery();
  const deferredSearch = useDeferredValue(searchQuery);
  const bookmarkedSet = useMemo(() => new Set(bookmarkedIds), [bookmarkedIds]);

  // 검색어·카테고리 변경 시 더보기 커서 리셋
  const filterKey = `${category}|${deferredSearch}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (prevFilterKey !== filterKey) {
    setPrevFilterKey(filterKey);
    setAllVisibleCount(ALL_SHELF_INITIAL);
  }

  const filtered = useMemo(() => {
    const byCategory = filterByCategory(scholarships, category);
    return byCategory.filter((s) =>
      matchesSearch(s.name, s.organization, deferredSearch)
    );
  }, [scholarships, category, deferredSearch]);

  const isSearching = deferredSearch.trim().length > 0;

  const trending = useMemo(() => {
    if (isSearching) return [];
    return [...filtered]
      .sort((a, b) => {
        const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
        if (scrapDiff !== 0) return scrapDiff;
        return (b.view_count ?? 0) - (a.view_count ?? 0);
      })
      .slice(0, TRENDING_LIMIT);
  }, [filtered, isSearching]);

  const trendingKeys = useMemo(
    () => new Set(trending.map(itemKey)),
    [trending]
  );

  const allSorted = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      if (a.is_recommended && !b.is_recommended) return -1;
      if (!a.is_recommended && b.is_recommended) return 1;
      return (
        daysUntilApplyDeadlineKorea(a.apply_end_date) -
        daysUntilApplyDeadlineKorea(b.apply_end_date)
      );
    });
    // 인기 선반에 이미 올린 카드는 전체 선반에서 제외해 DOM 이중 마운트 방지
    if (trendingKeys.size === 0) return sorted;
    return sorted.filter((item) => !trendingKeys.has(itemKey(item)));
  }, [filtered, trendingKeys]);

  const visibleAll = useMemo(
    () => allSorted.slice(0, allVisibleCount),
    [allSorted, allVisibleCount]
  );
  const hasMoreAll = allSorted.length > visibleAll.length;

  const emptyCategory = !categoryHasData(category);
  const categoryLabel =
    CONTENT_CATEGORIES.find((c) => c.key === category)?.label ?? "";
  const totalShown = trending.length + allSorted.length;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl bg-white lg:rounded-2xl">
      {/* 카테고리 탭 */}
      <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 px-4 py-3 backdrop-blur sm:px-5">
        <div
          role="tablist"
          aria-label="공고 종류"
          className="flex gap-2 overflow-x-auto [scrollbar-width:none]"
        >
          {CONTENT_CATEGORIES.map((tab) => {
            const active = category === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setCategory(tab.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  active
                    ? "bg-ink text-white"
                    : "bg-beige text-ink/70 hover:bg-cream"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-5 sm:py-6">
        {emptyCategory ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
            <p className="text-lg font-semibold text-ink">
              {categoryLabel} 공고는 준비 중이에요
            </p>
            <p className="text-sm text-ink/50">
              곧 다양한 {categoryLabel} 정보를 만나보실 수 있어요.
            </p>
            <button
              type="button"
              onClick={() => setCategory("scholarship")}
              className="mt-3 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/85"
            >
              장학금 보기
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
            <p className="text-lg font-semibold text-ink">
              {searchQuery.trim()
                ? "검색 결과가 없습니다"
                : "등록된 공고가 없습니다"}
            </p>
            <p className="text-sm text-ink/50">
              {searchQuery.trim()
                ? "다른 검색어로 시도해 보세요."
                : "관리자 패널에서 장학금을 추가해보세요."}
            </p>
          </div>
        ) : (
          <>
            {/* 인기 상승 공고 — 검색 중이 아닐 때만 */}
            {trending.length > 0 && (
              <section aria-labelledby="trending-heading">
                <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
                  <h2
                    id="trending-heading"
                    className="text-xl font-bold tracking-tight text-ink sm:text-2xl"
                  >
                    인기 상승 공고
                  </h2>
                  <Link
                    href="#all-announcements"
                    className="shrink-0 text-sm font-semibold text-ink/50 transition-colors hover:text-brand"
                  >
                    모두 표시
                  </Link>
                </div>
                <HorizontalShelf label="인기 상승 공고">
                  {trending.map((scholarship) => (
                    <ShelfCard
                      key={`trend-${itemKey(scholarship)}`}
                      scholarship={scholarship}
                      bookmarked={
                        (scholarship.content_kind ?? "scholarship") ===
                          "scholarship" && bookmarkedSet.has(scholarship.id)
                      }
                    />
                  ))}
                </HorizontalShelf>
              </section>
            )}

            {/* 전체 공고 — 가로 스크롤 */}
            <section
              id="all-announcements"
              aria-labelledby="all-heading"
              className={`scroll-mt-4 ${trending.length > 0 ? "mt-8 sm:mt-10" : ""}`}
            >
              <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
                <div>
                  <h2
                    id="all-heading"
                    className="text-xl font-bold tracking-tight text-ink sm:text-2xl"
                  >
                    {isSearching ? "검색 결과" : "전체 공고"}
                  </h2>
                  <p className="mt-1 text-sm text-ink/50">
                    총{" "}
                    <span className="font-semibold text-brand">
                      {totalShown}개
                    </span>
                    {trending.length > 0 ? (
                      <span className="text-ink/40">
                        {" "}
                        (인기 {trending.length} · 나머지 {allSorted.length})
                      </span>
                    ) : null}
                  </p>
                </div>
              </div>
              <HorizontalShelf label={isSearching ? "검색 결과" : "전체 공고"}>
                {visibleAll.map((scholarship) => (
                  <ShelfCard
                    key={itemKey(scholarship)}
                    scholarship={scholarship}
                    bookmarked={
                      (scholarship.content_kind ?? "scholarship") ===
                        "scholarship" && bookmarkedSet.has(scholarship.id)
                    }
                  />
                ))}
              </HorizontalShelf>
              {hasMoreAll && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() =>
                      setAllVisibleCount((n) => n + ALL_SHELF_STEP)
                    }
                    className="rounded-full border border-gray-200 bg-white px-5 py-2 text-sm font-semibold text-ink/70 transition-colors hover:border-brand/40 hover:text-brand"
                  >
                    더 보기 ({allSorted.length - visibleAll.length}개)
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
