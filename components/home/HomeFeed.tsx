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
import {
  buildTop10,
  pickHomeHero,
  type HomeRail,
} from "@/lib/home-rails";
import { useHomeSearch } from "./HomeSearchContext";
import HorizontalShelf from "./HorizontalShelf";
import HomeSectionTitle from "./HomeSectionTitle";
import HomeHero from "./HomeHero";
import Top10Shelf from "./Top10Shelf";
import RecentViewsShelf from "./RecentViewsShelf";
import { cardBookmarkKey } from "@/lib/bookmark-keys";

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

function PersonalizedRailSection({
  rail,
  isBookmarked,
}: {
  rail: HomeRail;
  isBookmarked: (s: CardScholarship) => boolean;
}) {
  return (
    <section
      aria-labelledby={`${rail.key}-heading`}
      className="mt-8 sm:mt-10"
    >
      <HomeSectionTitle
        id={`${rail.key}-heading`}
        title={rail.title}
        href={rail.href}
        subtitle={rail.subtitle}
      />
      <HorizontalShelf
        label={rail.title}
        items={rail.items}
        getKey={(s) => `${rail.key}-${itemKey(s)}`}
        renderItem={(scholarship) => (
          <ShelfCard
            scholarship={scholarship}
            bookmarked={isBookmarked(scholarship)}
          />
        )}
      />
    </section>
  );
}

export default function HomeFeed({
  scholarships,
  bookmarkedKeys = [],
  forYou = [],
  urgentBookmarks = [],
  serverRecent = [],
  interestRails = [],
  campusRail = null,
  regionRail = null,
  collaborativeRail = null,
  userName = null,
  isLoggedIn = false,
  isOnboarded = false,
}: {
  scholarships: CardScholarship[];
  bookmarkedKeys?: string[];
  forYou?: CardScholarship[];
  urgentBookmarks?: CardScholarship[];
  serverRecent?: CardScholarship[];
  interestRails?: HomeRail[];
  campusRail?: HomeRail | null;
  regionRail?: HomeRail | null;
  collaborativeRail?: HomeRail | null;
  userName?: string | null;
  isLoggedIn?: boolean;
  isOnboarded?: boolean;
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
  const showBrowseRails = !isSearching && category === "all";

  const hero = useMemo(() => {
    if (!showBrowseRails) return null;
    return pickHomeHero({ forYou, catalog: scholarships });
  }, [showBrowseRails, forYou, scholarships]);

  const top10Exclude = useMemo(() => {
    const keys = new Set<string>();
    if (hero) keys.add(itemKey(hero));
    for (const s of forYou.slice(0, 4)) keys.add(itemKey(s));
    return keys;
  }, [hero, forYou]);

  const top10 = useMemo(() => {
    if (!showBrowseRails) return [];
    return buildTop10(filtered, top10Exclude);
  }, [showBrowseRails, filtered, top10Exclude]);

  const kindShelves = useMemo(() => {
    if (!showBrowseRails) return [];
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
  }, [showBrowseRails, scholarships, deferredSearch]);

  const searchShelfItems = useMemo(() => {
    if (showBrowseRails) return [];
    return sortByDeadline(filtered);
  }, [showBrowseRails, filtered]);

  const emptyCategory = !categoryHasData(category);
  const categoryLabel =
    CONTENT_CATEGORIES.find((c) => c.key === category)?.label ?? "";

  const browseKind: BrowseKind = category === "all" ? "all" : category;

  function isBookmarked(scholarship: CardScholarship) {
    return bookmarkedSet.has(cardBookmarkKey(scholarship));
  }

  const forYouTitle = userName
    ? `${userName}님을 위해 엄선한 공고`
    : "회원님을 위해 엄선한 공고";

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
      ) : filtered.length === 0 && !showBrowseRails && forYou.length === 0 ? (
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
          {showBrowseRails && isLoggedIn && !isOnboarded ? (
            <div className="mb-5 rounded-2xl border border-brand/20 bg-cream px-4 py-3.5 sm:mb-6 sm:px-5">
              <p className="text-sm font-bold text-ink">
                관심사를 등록하면 추천이 더 정확해져요
              </p>
              <p className="mt-0.5 text-xs text-ink/55">
                학교·전공·관심사를 채우면 취향에 맞는 공고를 더 잘 골라 드립니다.
              </p>
              <Link
                href="/onboarding"
                className="mt-2.5 inline-flex rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white hover:bg-brand/85"
              >
                온보딩 이어하기
              </Link>
            </div>
          ) : null}

          {showBrowseRails && hero ? (
            <div className="mb-8 sm:mb-10">
              <HomeHero
                scholarship={hero}
                bookmarked={isBookmarked(hero)}
                eyebrow={
                  forYou.length > 0
                    ? "오늘의 추천"
                    : hero.is_recommended
                      ? "에디터 추천"
                      : "인기 공고"
                }
                showMatchedCta={false}
              />
            </div>
          ) : null}

          {showBrowseRails && forYou.length > 0 ? (
            <section aria-labelledby="for-you-heading">
              <HomeSectionTitle
                id="for-you-heading"
                title={forYouTitle}
                href={browseHref({ kind: "all", sort: "scraps" })}
                subtitle="회원님을 위한 엄선"
              />
              <HorizontalShelf
                label={forYouTitle}
                items={forYou}
                getKey={(s) => `foryou-${itemKey(s)}`}
                renderItem={(scholarship) => (
                  <ShelfCard
                    scholarship={scholarship}
                    bookmarked={isBookmarked(scholarship)}
                  />
                )}
              />
            </section>
          ) : null}

          {showBrowseRails ? (
            <RecentViewsShelf
              bookmarkedKeys={bookmarkedKeys}
              serverRecent={serverRecent}
            />
          ) : null}

          {showBrowseRails && top10.length > 0 ? (
            <section
              aria-labelledby="top10-heading"
              className="mt-8 sm:mt-10"
            >
              <HomeSectionTitle
                id="top10-heading"
                title="오늘 TOP 10"
                href={browseHref({
                  kind: browseKind,
                  section: "trending",
                  sort: "scraps",
                })}
                subtitle="스크랩·조회가 많은 공고"
              />
              <Top10Shelf items={top10} isBookmarked={isBookmarked} />
            </section>
          ) : null}

          {showBrowseRails && urgentBookmarks.length > 0 ? (
            <section
              aria-labelledby="urgent-bookmarks-heading"
              className="mt-8 sm:mt-10"
            >
              <HomeSectionTitle
                id="urgent-bookmarks-heading"
                title="저장한 공고 · 마감 임박"
                href="/library/saved"
                subtitle="14일 안에 마감되는 찜한 공고"
              />
              <HorizontalShelf
                label="저장한 공고 · 마감 임박"
                items={urgentBookmarks}
                getKey={(s) => `urgent-${itemKey(s)}`}
                renderItem={(scholarship) => (
                  <ShelfCard
                    scholarship={scholarship}
                    bookmarked={isBookmarked(scholarship)}
                  />
                )}
              />
            </section>
          ) : null}

          {showBrowseRails
            ? interestRails.map((rail) => (
                <PersonalizedRailSection
                  key={rail.key}
                  rail={rail}
                  isBookmarked={isBookmarked}
                />
              ))
            : null}

          {showBrowseRails && campusRail ? (
            <PersonalizedRailSection
              rail={campusRail}
              isBookmarked={isBookmarked}
            />
          ) : null}

          {showBrowseRails && regionRail ? (
            <PersonalizedRailSection
              rail={regionRail}
              isBookmarked={isBookmarked}
            />
          ) : null}

          {showBrowseRails && collaborativeRail ? (
            <PersonalizedRailSection
              rail={collaborativeRail}
              isBookmarked={isBookmarked}
            />
          ) : null}

          {showBrowseRails ? (
            kindShelves.map((shelf) => (
              <section
                key={shelf.key}
                aria-labelledby={`kind-${shelf.key}-heading`}
                className="mt-8 sm:mt-10"
              >
                <HomeSectionTitle
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
              className="scroll-mt-4"
            >
              <HomeSectionTitle
                id="all-heading"
                title={
                  isSearching
                    ? "검색 결과"
                    : `${categoryLabel === "홈" ? "전체" : categoryLabel} 공고`
                }
                href={browseHref({
                  kind: browseKind,
                  sort: "deadline",
                  list: browseKind === "all",
                })}
                subtitle={
                  isSearching
                    ? undefined
                    : `총 ${searchShelfItems.length}개`
                }
              />
              <HorizontalShelf
                label={isSearching ? "검색 결과" : "전체 공고"}
                items={searchShelfItems}
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
