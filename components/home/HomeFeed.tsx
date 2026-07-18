"use client";

import { memo, useMemo, type ReactNode } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import BrowseTopRankHero from "@/components/browse/BrowseTopRankHero";
import {
  CONTENT_CATEGORIES,
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
  afterHero = null,
  afterTop10 = null,
}: {
  scholarships: CardScholarship[];
  /** 로그인: For You·이어서 보기 / 비로그인: 진단 티저 — Suspense 슬롯 */
  afterHero?: ReactNode;
  /** 로그인: 마감임박·관심/교내/CF 레일 / 비로그인: 로드맵 레일 — Suspense 슬롯 */
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
          backHref={null}
          badge="TODAY TOP 10"
          subtitle={null}
          headingId="home-top10-heading"
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
            {showBrowseRails ? afterHero : null}

            {showBrowseRails ? afterTop10 : null}

            {!showBrowseRails ? (
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
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
