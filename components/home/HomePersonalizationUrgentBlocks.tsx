"use client";

import { memo } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import { useHomeBookmarkChecker } from "@/components/home/HomeBookmarkContext";
import HomeSectionTitle from "@/components/home/HomeSectionTitle";
import HorizontalShelf from "@/components/home/HorizontalShelf";

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

export default function HomePersonalizationUrgentBlocks({
  urgentBookmarks,
}: {
  urgentBookmarks: CardScholarship[];
}) {
  return (
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
          <ShelfCard scholarship={scholarship} />
        )}
      />
    </section>
  );
}
