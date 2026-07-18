"use client";

import Link from "next/link";
import { memo, useMemo, useState } from "react";
import ScholarshipCard, { type CardScholarship } from "@/components/ScholarshipCard";
import HomeSectionTitle from "@/components/home/HomeSectionTitle";
import HorizontalShelf from "@/components/home/HorizontalShelf";
import {
  cardItemKey,
  collectRailKeys,
  finalizeRailItems,
  sortByTrending,
} from "@/lib/home-rails";
import {
  INTEREST_CATEGORIES,
  type InterestCategoryId,
} from "@/lib/interestCategories";
import { fieldCodesForInterest } from "@/lib/interest-field-map";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";

const GuestShelfCard = memo(function GuestShelfCard({
  scholarship,
}: {
  scholarship: CardScholarship;
}) {
  return <ScholarshipCard scholarship={scholarship} />;
});

/* ── 분야별 인기 공고 ──────────────────────────────────────── */

const FINDER_SHELF_LIMIT = 16;
const FINDER_CHIP_MIN_ITEMS = 4;

function itemMatchesInterest(
  item: CardScholarship,
  interestId: InterestCategoryId
): boolean {
  if ((item.interest_categories ?? []).includes(interestId)) return true;
  const fields = fieldCodesForInterest(interestId);
  if (fields.length === 0) return false;
  return (item.qual_field_codes ?? []).some((f) => fields.includes(f));
}

function GuestInterestRail({ catalog }: { catalog: CardScholarship[] }) {
  // 공고가 충분한 분야만 칩으로 노출 — 빈 결과 화면 방지
  const interestOptions = useMemo(() => {
    return INTEREST_CATEGORIES.map((category) => ({
      ...category,
      items: sortByTrending(
        catalog.filter((item) => itemMatchesInterest(item, category.id))
      ).slice(0, FINDER_SHELF_LIMIT),
    })).filter((option) => option.items.length >= FINDER_CHIP_MIN_ITEMS);
  }, [catalog]);

  const [activeId, setActiveId] = useState<InterestCategoryId | null>(null);
  const active =
    interestOptions.find((option) => option.id === activeId) ??
    interestOptions[0];

  if (!active) return null;

  return (
    <section aria-labelledby="guest-interest-heading" className="mt-8 sm:mt-10">
      <HomeSectionTitle
        id="guest-interest-heading"
        title="분야별 인기 공고"
        href="/browse"
      />

      <div className="-mx-4 mb-3 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:[&::-webkit-scrollbar]:hidden [&::-webkit-scrollbar]:hidden">
        <div className="flex w-max gap-2">
          {interestOptions.map((option) => {
            const on = option.id === active.id;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={on}
                onClick={() => setActiveId(option.id)}
                className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  on
                    ? "bg-ink text-white"
                    : "bg-beige text-ink/70 hover:bg-cream hover:text-ink"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <HorizontalShelf
        label={`${active.label} 인기 공고`}
        items={active.items}
        getKey={(item) => `finder-${active.id}-${cardItemKey(item)}`}
        renderItem={(scholarship) => (
          <GuestShelfCard scholarship={scholarship} />
        )}
      />
    </section>
  );
}

/* ── 이력·기업 제안 안내 ───────────────────────────────────── */

function GuestSignupStrip() {
  return (
    <div className="mt-8 flex flex-col gap-3 rounded-2xl bg-beige px-5 py-4 sm:mt-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>
        <p className="text-sm font-semibold text-ink">
          여기서 저장하고 지원한 활동이 그대로 나의 이력이 됩니다
        </p>
        <p className="mt-0.5 text-xs text-ink/50">
          쌓인 이력을 보고 기업이 먼저 제안하는 매칭도 준비하고 있어요.
        </p>
      </div>
      <Link
        href="/auth"
        className="shrink-0 self-start rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-ink/85 sm:self-auto"
      >
        무료로 시작하기
      </Link>
    </div>
  );
}

/* ── 종류별 레일 ───────────────────────────────────────────── */

const GUEST_URGENT_DAYS = 14;
const GUEST_RAIL_MIN = 4;

function sortByDeadlineAsc(list: CardScholarship[]) {
  return [...list].sort(
    (a, b) =>
      daysUntilApplyDeadlineKorea(a.apply_end_date) -
      daysUntilApplyDeadlineKorea(b.apply_end_date)
  );
}

type GuestRail = {
  key: string;
  title: string;
  subtitle?: string;
  href: string;
  items: CardScholarship[];
};

function buildGuestRails(catalog: CardScholarship[]): GuestRail[] {
  const rails: GuestRail[] = [];
  const usedKeys = collectRailKeys();

  const urgent = finalizeRailItems(
    sortByDeadlineAsc(
      catalog.filter((item) => {
        if (isAlwaysOpenRecruitment(item.apply_end_date)) return false;
        const days = daysUntilApplyDeadlineKorea(item.apply_end_date);
        return !Number.isNaN(days) && days >= 0 && days <= GUEST_URGENT_DAYS;
      })
    ),
    usedKeys
  );
  if (urgent.length >= GUEST_RAIL_MIN) {
    rails.push({
      key: "guest-urgent",
      title: "마감 임박",
      subtitle: "2주 안에 마감되는 공고",
      href: "/browse?sort=deadline&list=1",
      items: urgent,
    });
    for (const item of urgent) usedKeys.add(cardItemKey(item));
  }

  const kindRails: {
    kind: NonNullable<CardScholarship["content_kind"]>;
    key: string;
    title: string;
    subtitle?: string;
    href: string;
  }[] = [
    {
      kind: "contest",
      key: "guest-contest",
      title: "요즘 인기 공모전",
      href: "/browse?kind=contest",
    },
    {
      kind: "education",
      key: "guest-education",
      title: "교육·강연",
      subtitle: "무료 강의부터 부트캠프까지",
      href: "/browse?kind=education",
    },
    {
      kind: "activity",
      key: "guest-activity",
      title: "대외활동",
      subtitle: "서포터즈·기자단·멘토링",
      href: "/browse?kind=activity",
    },
    {
      kind: "scholarship",
      key: "guest-scholarship",
      title: "장학금",
      href: "/browse?kind=scholarship",
    },
  ];

  for (const definition of kindRails) {
    const items = finalizeRailItems(
      sortByTrending(
        catalog.filter(
          (item) => (item.content_kind ?? "scholarship") === definition.kind
        )
      ),
      usedKeys
    );
    if (items.length < GUEST_RAIL_MIN) continue;
    rails.push({ ...definition, items });
    for (const item of items) usedKeys.add(cardItemKey(item));
  }

  return rails;
}

function GuestRailSection({
  rail,
  flush = false,
}: {
  rail: GuestRail;
  /** 히어로 바로 다음 섹션 — 상단 여백 축소 */
  flush?: boolean;
}) {
  return (
    <section
      aria-labelledby={`${rail.key}-heading`}
      className={flush ? "mt-2 sm:mt-3" : "mt-8 sm:mt-10"}
    >
      <HomeSectionTitle
        id={`${rail.key}-heading`}
        title={rail.title}
        subtitle={rail.subtitle}
        href={rail.href}
      />
      <HorizontalShelf
        label={rail.title}
        items={rail.items}
        getKey={(item) => `${rail.key}-${cardItemKey(item)}`}
        renderItem={(scholarship) => (
          <GuestShelfCard scholarship={scholarship} />
        )}
      />
    </section>
  );
}

/* ── 진입점 ───────────────────────────────────────────────── */

/**
 * 비로그인 홈: 마감 임박 → 분야별 인기 → 종류별 레일, 사이에 가입 안내 한 줄.
 * 로그인 시 이 자리에는 HomePersonalization*이 들어간다.
 */
export default function HomeGuestSections({
  catalog,
}: {
  catalog: CardScholarship[];
}) {
  const rails = useMemo(() => buildGuestRails(catalog), [catalog]);
  const [firstRail, ...restRails] = rails;

  return (
    <>
      {firstRail ? <GuestRailSection rail={firstRail} flush /> : null}
      <GuestInterestRail catalog={catalog} />
      <GuestSignupStrip />
      {restRails.map((rail) => (
        <GuestRailSection key={rail.key} rail={rail} />
      ))}
    </>
  );
}
