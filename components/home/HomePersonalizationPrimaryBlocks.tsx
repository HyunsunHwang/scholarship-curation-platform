"use client";

import Link from "next/link";
import { memo } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import { browseHref } from "@/lib/browse-data";
import {
  HomeBookmarkHydrator,
  useHomeBookmarkChecker,
} from "@/components/home/HomeBookmarkContext";
import HomeSectionTitle from "@/components/home/HomeSectionTitle";
import HorizontalShelf from "@/components/home/HorizontalShelf";
import RecentViewsShelf from "@/components/home/RecentViewsShelf";

function itemKey(item: CardScholarship) {
  return `${item.content_kind ?? "scholarship"}-${item.id}`;
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

export default function HomePersonalizationPrimaryBlocks({
  catalog,
  bookmarkedKeys,
  forYou,
  serverRecent,
  userName,
  isOnboarded,
}: {
  catalog: CardScholarship[];
  bookmarkedKeys: string[];
  forYou: CardScholarship[];
  serverRecent: CardScholarship[];
  userName: string | null;
  isOnboarded: boolean;
}) {
  const forYouTitle = userName
    ? `${userName}님을 위해 엄선한 공고`
    : "회원님을 위해 엄선한 공고";

  return (
    <>
      <HomeBookmarkHydrator keys={bookmarkedKeys} />

      {!isOnboarded ? (
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

      {forYou.length > 0 ? (
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
              <ShelfCard scholarship={scholarship} />
            )}
          />
        </section>
      ) : null}

      <RecentViewsShelf
        bookmarkedKeys={bookmarkedKeys}
        serverRecent={serverRecent}
        catalog={catalog}
      />
    </>
  );
}
