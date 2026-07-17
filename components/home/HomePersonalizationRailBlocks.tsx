"use client";

import { memo } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import type { HomeRail } from "@/lib/home-rails";
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

function PersonalizedRailSection({ rail }: { rail: HomeRail }) {
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
          <ShelfCard scholarship={scholarship} />
        )}
      />
    </section>
  );
}

export default function HomePersonalizationRailBlocks({
  interestRails,
  campusRail,
  regionRail,
  collaborativeRail,
}: {
  interestRails: HomeRail[];
  campusRail: HomeRail | null;
  regionRail: HomeRail | null;
  collaborativeRail: HomeRail | null;
}) {
  return (
    <>
      {interestRails.map((rail) => (
        <PersonalizedRailSection key={rail.key} rail={rail} />
      ))}
      {campusRail ? <PersonalizedRailSection rail={campusRail} /> : null}
      {regionRail ? <PersonalizedRailSection rail={regionRail} /> : null}
      {collaborativeRail ? (
        <PersonalizedRailSection rail={collaborativeRail} />
      ) : null}
    </>
  );
}
