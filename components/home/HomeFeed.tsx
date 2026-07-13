"use client";

import Link from "next/link";
import { useMemo } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import {
  CONTENT_CATEGORIES,
  LIBRARY_CATEGORY_FILTERS,
  categoryHasData,
} from "@/lib/content-categories";
import { browseHref, type BrowseKind } from "@/lib/browse-data";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { daysUntilApplyDeadlineKorea } from "@/lib/scholarship-dates";
import { useHomeSearch } from "./HomeSearchContext";
import HorizontalShelf from "./HorizontalShelf";
import { cardBookmarkKey } from "@/lib/bookmark-keys";

const TRENDING_LIMIT = 16;
const KIND_SHELF_LIMIT = 16;

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
  category: (typeof CONTENT_CATEGORIES)[number]["key"]
): CardScholarship[] {
  if (!categoryHasData(category)) return [];
  if (category === "all") return list;
  return list.filter((item) => (item.content_kind ?? "scholarship") === category);
}

function sortByDeadline(list: CardScholarship[]) {
  return [...list].sort((a, b) => {
    if (a.is_recommended && !b.is_recommended) return -1;
    if (!a.is_recommended && b.is_recommended) return 1;
    return (
      daysUntilApplyDeadlineKorea(a.apply_end_date) -
      daysUntilApplyDeadlineKorea(b.apply_end_date)
    );
  });
}

function sortByTrending(list: CardScholarship[]) {
  return [...list].sort((a, b) => {
    const scrapDiff = (b.scrap_count ?? 0) - (a.scrap_count ?? 0);
    if (scrapDiff !== 0) return scrapDiff;
    return (b.view_count ?? 0) - (a.view_count ?? 0);
  });
}

/** 에어비앤비식: 제목 옆 원형 화살표 → 전체 목록 */
function SectionTitleWithArrow({
  id,
  title,
  href,
  subtitle,
}: {
  id: string;
  title: string;
  href: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2
            id={id}
            className="text-xl font-bold tracking-tight text-ink sm:text-2xl"
          >
            <Link href={href} className="transition-colors hover:text-brand">
              {title}
            </Link>
          </h2>
          <Link
            href={href}
            aria-label={`${title} 전체 보기`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-ink shadow-sm transition hover:border-ink/25 hover:bg-cream hover:shadow-md active:scale-95"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.25}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
              />
            </svg>
          </Link>
        </div>
        {subtitle ? (
          <p className="mt-1 text-sm text-ink/50">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}

function ShelfCard({
  scholarship,
  bookmarked,
}: {
  scholarship: CardScholarship;
  bookmarked: boolean;
}) {
  return (
    <ScholarshipCard
      scholarship={scholarship}
      initialBookmarked={bookmarked}
    />
  );
}

export default function HomeFeed({
  scholarships,
  bookmarkedKeys = [],
}: {
  scholarships: CardScholarship[];
  bookmarkedKeys?: string[];
}) {
  const {
    query: searchQuery,
    deferredQuery: deferredSearch,
    category,
    setCategory,
  } = useHomeSearch();
  const bookmarkedSet = useMemo(() => new Set(bookmarkedKeys), [bookmarkedKeys]);

  const filtered = useMemo(() => {
    const byCategory = filterByCategory(scholarships, category);
    return byCategory.filter((s) =>
      matchesSearch(s.name, s.organization, deferredSearch)
    );
  }, [scholarships, category, deferredSearch]);

  const isSearching = deferredSearch.trim().length > 0;
  const showKindShelves = !isSearching && category === "all";

  const trending = useMemo(() => {
    if (isSearching) return [];
    return sortByTrending(filtered).slice(0, TRENDING_LIMIT);
  }, [filtered, isSearching]);

  const trendingKeys = useMemo(
    () => new Set(trending.map(itemKey)),
    [trending]
  );

  const allSorted = useMemo(() => {
    const sorted = sortByDeadline(filtered);
    if (trendingKeys.size === 0) return sorted;
    return sorted.filter((item) => !trendingKeys.has(itemKey(item)));
  }, [filtered, trendingKeys]);

  const kindShelves = useMemo(() => {
    if (!showKindShelves) return [];
    return LIBRARY_CATEGORY_FILTERS.map((tab) => {
      const items = sortByDeadline(
        scholarships.filter(
          (s) =>
            (s.content_kind ?? "scholarship") === tab.key &&
            matchesSearch(s.name, s.organization, deferredSearch)
        )
      ).slice(0, KIND_SHELF_LIMIT);
      return { ...tab, items };
    }).filter((shelf) => shelf.items.length > 0);
  }, [showKindShelves, scholarships, deferredSearch]);

  const emptyCategory = !categoryHasData(category);
  const categoryLabel =
    CONTENT_CATEGORIES.find((c) => c.key === category)?.label ?? "";
  const totalShown = trending.length + allSorted.length;

  const browseKind: BrowseKind = category === "all" ? "all" : category;

  function isBookmarked(scholarship: CardScholarship) {
    return bookmarkedSet.has(cardBookmarkKey(scholarship));
  }

  return (
    <div className="w-full">
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
      ) : filtered.length === 0 && !showKindShelves ? (
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
          {trending.length > 0 && (
            <section aria-labelledby="trending-heading">
              <SectionTitleWithArrow
                id="trending-heading"
                title="인기 상승 공고"
                href={browseHref({
                  kind: browseKind,
                  section: "trending",
                  sort: "scraps",
                })}
              />
              <HorizontalShelf
                label="인기 상승 공고"
                items={trending}
                getKey={(s) => `trend-${itemKey(s)}`}
                renderItem={(scholarship) => (
                  <ShelfCard
                    scholarship={scholarship}
                    bookmarked={isBookmarked(scholarship)}
                  />
                )}
              />
            </section>
          )}

          {showKindShelves ? (
            kindShelves.map((shelf, index) => (
              <section
                key={shelf.key}
                aria-labelledby={`kind-${shelf.key}-heading`}
                className={
                  trending.length > 0 || index > 0
                    ? "mt-8 sm:mt-10"
                    : undefined
                }
              >
                <SectionTitleWithArrow
                  id={`kind-${shelf.key}-heading`}
                  title={shelf.label}
                  href={browseHref({ kind: shelf.key, sort: "deadline" })}
                  subtitle={`${shelf.items.length}개 미리보기`}
                />
                <HorizontalShelf
                  label={shelf.label}
                  items={shelf.items}
                  getKey={(s) => itemKey(s)}
                  renderItem={(scholarship) => (
                    <ShelfCard
                      scholarship={scholarship}
                      bookmarked={isBookmarked(scholarship)}
                    />
                  )}
                />
              </section>
            ))
          ) : (
            <section
              id="all-announcements"
              aria-labelledby="all-heading"
              className={`scroll-mt-4 ${trending.length > 0 ? "mt-8 sm:mt-10" : ""}`}
            >
              <SectionTitleWithArrow
                id="all-heading"
                title={
                  isSearching
                    ? "검색 결과"
                    : `${categoryLabel === "홈" ? "전체" : categoryLabel} 공고`
                }
                href={browseHref({ kind: browseKind, sort: "deadline" })}
                subtitle={
                  isSearching
                    ? undefined
                    : `총 ${totalShown}개${
                        trending.length > 0
                          ? ` (인기 ${trending.length} · 나머지 ${allSorted.length})`
                          : ""
                      }`
                }
              />
              <HorizontalShelf
                label={isSearching ? "검색 결과" : "전체 공고"}
                items={isSearching ? filtered : allSorted}
                getKey={(s) => itemKey(s)}
                renderItem={(scholarship) => (
                  <ShelfCard
                    scholarship={scholarship}
                    bookmarked={isBookmarked(scholarship)}
                  />
                )}
              />
            </section>
          )}
        </>
      )}
    </div>
  );
}
