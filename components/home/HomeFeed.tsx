"use client";

import { memo, useMemo, type ReactNode } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import BrowseTopRankHero from "@/components/browse/BrowseTopRankHero";
import HomeCategoryChips from "@/components/home/HomeCategoryChips";
import {
  HOME_CATEGORY_TABS,
  type HomeCategoryTabKey,
} from "@/lib/home-category-tabs";
import { browseHref } from "@/lib/browse-data";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { daysUntilApplyDeadlineKorea } from "@/lib/scholarship-dates";
import { buildTop10 } from "@/lib/home-rails";
import { useHomeSearchFilters } from "./HomeSearchContext";
import { useHomeBookmarkChecker } from "./HomeBookmarkContext";
import HomeSectionTitle from "./HomeSectionTitle";

const INTERNSHIP_BENEFIT_TAGS = [
  "인턴쉽 기회",
  "인턴/정규직채용",
  "인턴십",
  "인턴",
];

const HIRING_BENEFIT_TAGS = [
  "인턴/정규직채용",
  "입사시 혜택",
  "입사시 가산점",
  "채용연계",
  "입사혜택",
  "입사 가산점",
  "채용",
];

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

function hasBenefitTag(item: CardScholarship, tags: string[]): boolean {
  const benefits = item.benefits;
  if (!Array.isArray(benefits) || benefits.length === 0) return false;
  return benefits.some((b) =>
    tags.some((tag) => String(b).includes(tag) || tag.includes(String(b)))
  );
}

function filterByHomeTab(
  list: CardScholarship[],
  category: HomeCategoryTabKey
): CardScholarship[] {
  if (category === "all") return list;
  if (
    category === "activity" ||
    category === "contest" ||
    category === "education" ||
    category === "scholarship"
  ) {
    return list.filter(
      (item) => (item.content_kind ?? "scholarship") === category
    );
  }
  if (category === "internship") {
    return list.filter(
      (item) =>
        (item.content_kind ?? "scholarship") !== "scholarship" &&
        hasBenefitTag(item, INTERNSHIP_BENEFIT_TAGS)
    );
  }
  if (category === "hiring") {
    return list.filter((item) => {
      if (item.is_advertisement) return true;
      return (
        (item.content_kind ?? "scholarship") !== "scholarship" &&
        hasBenefitTag(item, HIRING_BENEFIT_TAGS)
      );
    });
  }
  return list;
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

function tabMoreHref(category: HomeCategoryTabKey): string {
  if (category === "internship") {
    return browseHref({ section: "internship", sort: "deadline" });
  }
  if (category === "hiring") {
    return browseHref({ section: "hiring", sort: "deadline" });
  }
  if (
    category === "activity" ||
    category === "contest" ||
    category === "education" ||
    category === "scholarship"
  ) {
    return browseHref({ kind: category, sort: "deadline" });
  }
  return browseHref({ kind: "all", sort: "deadline", list: true });
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
  heroIntroContent = null,
}: {
  scholarships: CardScholarship[];
  /** 로그인: For You·이어서 보기 / 비로그인: 진단 티저 — Suspense 슬롯 */
  afterHero?: ReactNode;
  /** 로그인: 마감임박·관심/교내/CF 레일 / 비로그인: 로드맵 레일 — Suspense 슬롯 */
  afterTop10?: ReactNode;
  /** 로그인: 개인화 대시보드 히어로. 없으면 마케팅 카피 */
  heroIntroContent?: ReactNode;
}) {
  const {
    deferredQuery: deferredSearch,
    category,
    setCategory,
  } = useHomeSearchFilters();
  const isSearching = deferredSearch.trim().length > 0;

  const filtered = useMemo(() => {
    const byCategory = filterByHomeTab(scholarships, category);
    return byCategory.filter((s) =>
      matchesSearch(s.name, s.organization, deferredSearch)
    );
  }, [scholarships, category, deferredSearch]);

  const showBrowseRails = !isSearching && category === "all";

  const top10 = useMemo(() => {
    if (isSearching) return [];
    const pool = scholarships.filter((s) =>
      matchesSearch(s.name, s.organization, deferredSearch)
    );
    return buildTop10(pool);
  }, [isSearching, scholarships, deferredSearch]);

  const searchShelfItems = useMemo(() => {
    if (showBrowseRails) return [];
    return sortByDeadline(filtered);
  }, [showBrowseRails, filtered]);

  const categoryLabel =
    HOME_CATEGORY_TABS.find((c) => c.key === category)?.label ?? "전체";
  const showTopRankHero = !isSearching && top10.length >= 5;

  return (
    <div className="w-full">
      {showTopRankHero ? (
        <BrowseTopRankHero
          title=""
          items={top10}
          backgroundSrc={null}
          backHref={null}
          badge="TODAY TOP 10"
          subtitle={null}
          headingId="home-top10-heading"
          introContent={heroIntroContent}
          intro={
            heroIntroContent
              ? null
              : {
                  title: (
                    <>
                      나에게 꼭 맞는
                      <br />
                      커리어 정보를 한눈에
                    </>
                  ),
                  description:
                    "교내 장학금부터 대외활동까지, 내 프로필 기반 맞춤 추천",
                  ctaLabel: "내 공고 보러가기",
                  ctaHref: "/matched",
                }
          }
        />
      ) : null}

      {!isSearching ? <HomeCategoryChips /> : null}

      <div
        className={`w-full px-4 pb-10 sm:px-6 lg:px-10 ${
          showTopRankHero || !isSearching ? "pt-0 sm:pt-1" : "pt-4 sm:pt-5"
        }`}
      >
        {filtered.length === 0 && !showBrowseRails ? (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-center">
            <p className="text-lg font-semibold text-ink">
              {isSearching
                ? "검색 결과가 없습니다"
                : `${categoryLabel} 공고가 없습니다`}
            </p>
            <p className="text-sm text-ink/50">
              {isSearching
                ? "다른 검색어로 시도해 보세요."
                : "다른 카테고리를 선택해 보세요."}
            </p>
            <button
              type="button"
              onClick={() => setCategory("all")}
              className="mt-3 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand/85"
            >
              전체 보기
            </button>
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
                  title={isSearching ? "검색 결과" : `${categoryLabel} 공고`}
                  href={tabMoreHref(category)}
                  subtitle={`${searchShelfItems.length.toLocaleString()}개`}
                />
                <div
                  role="list"
                  aria-label={isSearching ? "검색 결과" : `${categoryLabel} 공고`}
                  className="grid grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-8 md:grid-cols-4 lg:grid-cols-5"
                >
                  {searchShelfItems.map((scholarship) => (
                    <div key={itemKey(scholarship)} role="listitem">
                      <ShelfCard scholarship={scholarship} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
