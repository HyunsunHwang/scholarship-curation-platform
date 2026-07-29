"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo } from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { useAnnouncementLinkClick } from "@/components/announcement/AnnouncementModalProvider";
import { browseHref } from "@/lib/browse-data";
import { contentKindHref } from "@/lib/content-categories";
import {
  buildCategoryCharts,
  cardItemKey,
  type HomeCategoryChartColumn,
} from "@/lib/home-rails";
import {
  daysUntilApplyDeadlineKorea,
  isAlwaysOpenRecruitment,
} from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { resolveCardSupportLine } from "@/lib/support-amount";
import HomeSectionTitle from "./HomeSectionTitle";

function benefitLine(item: CardScholarship): string {
  const support = resolveCardSupportLine({
    contentKind: item.content_kind,
    supportAmountText: item.support_amount_text,
    benefits: item.benefits,
    additionalNote: item.benefit_note,
    noticeText: item.benefit_notice_text,
    name: item.name,
    cardSupportLine: item.card_support_line,
  });
  if (support && support !== "기관 확인 필요") return support;
  return item.organization;
}

function deadlineLine(applyEndDate: string): string {
  if (isAlwaysOpenRecruitment(applyEndDate)) return "상시모집";
  const days = daysUntilApplyDeadlineKorea(applyEndDate);
  if (Number.isNaN(days) || days < 0) return "마감됨";
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M2.5 14.5 4.2 6.8a.7.7 0 0 1 1.22-.22L8 9.2l1.4-4.2a.7.7 0 0 1 1.34 0L12 9.2l2.58-2.62a.7.7 0 0 1 1.22.22l1.7 7.7H2.5Z" />
      <path d="M3 15.5h14v1.2a.8.8 0 0 1-.8.8H3.8a.8.8 0 0 1-.8-.8v-1.2Z" />
    </svg>
  );
}

function ChartRow({ item }: { item: CardScholarship }) {
  const name = cleanScholarshipName(item.name);
  const href = contentKindHref(item.content_kind, item.id);
  const kind = item.content_kind ?? "scholarship";
  const onClick = useAnnouncementLinkClick(kind, item.id);
  const benefit = benefitLine(item);
  const deadline = deadlineLine(item.apply_end_date);

  return (
    <Link
      href={href}
      onClick={onClick}
      role="listitem"
      className="flex items-center gap-3 rounded-xl bg-white px-2.5 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] ring-1 ring-black/4 transition hover:ring-black/10 sm:px-3"
    >
      <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded-md bg-[#f6f6f9] sm:h-16 sm:w-11">
        {item.poster_image_url ? (
          <Image
            src={item.poster_image_url}
            alt=""
            fill
            sizes="44px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-end bg-linear-to-br from-[#020080] to-[#8019de] p-1">
            <span className="line-clamp-2 text-[8px] font-semibold leading-tight text-white/90">
              {item.organization}
            </span>
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] text-ink/45 sm:text-xs" title={benefit}>
          {benefit}
        </p>
        <p className="mt-0.5 line-clamp-1 text-sm font-bold text-ink" title={name}>
          {name}
        </p>
      </div>

      <p
        className="max-w-[38%] shrink-0 text-right text-[11px] font-bold leading-snug text-[#8019de] sm:max-w-[42%] sm:text-xs"
        title={deadline}
      >
        <span className="line-clamp-2">{deadline}</span>
      </p>
    </Link>
  );
}

function ChartColumn({ column }: { column: HomeCategoryChartColumn }) {
  const moreHref = browseHref({
    kind: column.kind,
    sort: "scraps",
  });

  return (
    <div className="flex min-w-0 flex-col">
      <div className="mb-3 flex items-center gap-1.5">
        <CrownIcon className="h-4 w-4 text-[#020080]" />
        <h3 className="text-base font-bold tracking-tight text-ink sm:text-lg">
          {column.title}
        </h3>
      </div>

      <div role="list" className="flex flex-col gap-2">
        {column.items.map((item) => (
          <ChartRow key={cardItemKey(item)} item={item} />
        ))}
      </div>

      <Link
        href={moreHref}
        className="mt-3 inline-flex items-center justify-center rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-[#020080] ring-1 ring-[#020080]/15 transition hover:bg-[#020080]/5 hover:ring-[#020080]/30"
      >
        {column.moreLabel}
        <span aria-hidden className="ml-1">
          &gt;
        </span>
      </Link>
    </div>
  );
}

export default function HomeCategoryCharts({
  columns: columnsProp,
  catalog = [],
}: {
  /** 서버에서 스크랩순으로 만든 차트 열 (우선) */
  columns?: HomeCategoryChartColumn[];
  /** columns 없을 때 카탈로그에서 스크랩순 폴백 */
  catalog?: CardScholarship[];
}) {
  const columns = useMemo(() => {
    if (columnsProp && columnsProp.length > 0) return columnsProp;
    return buildCategoryCharts(catalog);
  }, [columnsProp, catalog]);
  if (columns.length === 0) return null;

  return (
    <section
      aria-labelledby="category-charts-heading"
      className="-mx-4 mt-8 bg-[#f6f6f9] px-4 py-6 sm:-mx-6 sm:mt-10 sm:px-6 sm:py-8 lg:-mx-10 lg:px-10"
    >
      <HomeSectionTitle id="category-charts-heading" title="실시간 인기 차트" />
      <div
        className={`grid grid-cols-1 gap-6 ${
          columns.length >= 3
            ? "lg:grid-cols-3"
            : columns.length === 2
              ? "md:grid-cols-2"
              : ""
        }`}
      >
        {columns.map((column) => (
          <ChartColumn key={column.kind} column={column} />
        ))}
      </div>
    </section>
  );
}
