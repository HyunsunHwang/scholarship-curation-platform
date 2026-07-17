"use client";

import { memo, useMemo, type ReactNode } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import BrowseTopRankHero from "@/components/browse/BrowseTopRankHero";
import {
  CONTENT_CATEGORIES,
  LIBRARY_CATEGORY_FILTERS,
  categoryHasData,
} from "@/lib/content-categories";
import { browseHref, type BrowseKind } from "@/lib/browse-data";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { daysUntilApplyDeadlineKorea } from "@/lib/scholarship-dates";
import { buildTop10 } from "@/lib/home-rails";
import { useHomeSearchFilters } from "./HomeSearchContext";
import { useHomeBookmarkChecker } from "./HomeBookmarkContext";
import HorizontalShelf from "./HorizontalShelf";
import HomeSectionTitle from "./HomeSectionTitle";

const KIND_SHELF_LIMIT = 12;
const HOME_RANK_HERO_BG = "/images/home-rank-hero.jpg";

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

const ShelfCard = memo(function ShelfCard({
  scholarship,
}: {
  scholarship: CardScholarship;
}) {
  const isBookmarked = useHomeBookmarkChecker();
  return (
    <ScholarshipCard
      scholarship={scholarship}
      initialBookmarked={isBookmarked(scholarship)}
    />
  );
});

export default function HomeFeed({
  scholarships,
  isLoggedIn = false,
  afterHero = null,
  afterTop10 = null,
}: {
  scholarships: CardScholarship[];
  isLoggedIn?: boolean;
  /** 로그인 개인화(For You·이어서 보기) — Suspense 슬롯 */
  afterHero?: ReactNode;
  /** 마감임박·관심/교내/CF 레일 — Suspense 슬롯 */
  afterTop10?: ReactNode;
}) {
  const {
    deferredQuery: deferredSearch,
    category,
    setCategory,
  } = useHomeSearchFilters();
  const isSearching = deferredSearch.trim().length > 0;

  const filtered = useMemo(() => {
    const byCategory = filterByCategory(scholarships, category);
    return byCategory.filter((s) =>
      matchesSearch(s.name, s.organization, deferredSearch)
    );
  }, [scholarships, category, deferredSearch]);

  const showBrowseRails = !isSearching && category === "all";

  const top10 = useMemo(() => {
    if (!showBrowseRails) return [];
    return buildTop10(filtered);
  }, [showBrowseRails, filtered]);

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
  const showTopRankHero = showBrowseRails && top10.length >= 5;

  return (
    <div className="w-full">
      {showTopRankHero ? (
        <BrowseTopRankHero
          title="오늘 TOP 10"
          items={top10}
          backgroundSrc={HOME_RANK_HERO_BG}
          backHref={null}
          badge="TODAY TOP 10"
          subtitle="스크랩·조회가 많은 공고"
          headingId="home-top10-heading"
          imageClassName="object-cover object-[12%_78%] sm:object-[14%_72%] lg:object-[16%_68%]"
          washRightClassName="bg-linear-to-r from-transparent via-white/10 to-white/82"
          washUpClassName="bg-linear-to-t from-white/55 via-white/15 to-transparent"
        />
      ) : null}

      <div
        className={`w-full px-4 pb-10 sm:px-6 lg:px-10 ${
          showTopRankHero ? "pt-1 sm:pt-2" : "pt-4 sm:pt-5"
        }`}
      >
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
        ) : filtered.length === 0 && !showBrowseRails ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
            <p className="text-lg font-semibold text-ink">
              {isSearching ? "검색 결과가 없습니다" : "등록된 공고가 없습니다"}
            </p>
            <p className="text-sm text-ink/50">
              {isSearching
                ? "다른 검색어로 시도해 보세요."
                : "관리자 패널에서 장학금을 추가해보세요."}
            </p>
          </div>
        ) : (
          <>
            {showBrowseRails && isLoggedIn ? afterHero : null}

            {showBrowseRails && isLoggedIn ? afterTop10 : null}

            {showBrowseRails ? (
              kindShelves.map((shelf) => (
                <section
                  key={shelf.key}
                  aria-labelledby={`kind-${shelf.key}-heading`}
                  className="mt-8 sm:mt-10 first:mt-0"
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
                      <ShelfCard scholarship={scholarship} />
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
                    isSearching ? undefined : `총 ${searchShelfItems.length}개`
                  }
                />
                <HorizontalShelf
                  label={isSearching ? "검색 결과" : "전체 공고"}
                  items={searchShelfItems}
                  getKey={(s) => itemKey(s)}
                  renderItem={(scholarship) => (
                    <ShelfCard scholarship={scholarship} />
                  )}
                />
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
