"use client";

import Link from "next/link";
import Image from "next/image";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import CardBookmarkButton from "@/components/CardBookmarkButton";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { useAnnouncementLinkClick } from "@/components/announcement/AnnouncementModalProvider";
import { daysUntilApplyDeadlineKorea, isAlwaysOpenRecruitment } from "@/lib/scholarship-dates";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { resolveCardSupportLine } from "@/lib/support-amount";
import { contentKindHref } from "@/lib/content-categories";

function getMetrics(viewportWidth: number) {
  // numberCol: 숫자 자리 / overlap: 포스터가 숫자를 덮는 폭 (페어 고정, 과하게 덮지 않음)
  if (viewportWidth >= 1024) {
    return {
      gap: 18,
      numberSize: 176,
      numberCol: 118,
      overlap: 32,
      posterWidth: 152,
    };
  }
  if (viewportWidth >= 768) {
    return {
      gap: 16,
      numberSize: 160,
      numberCol: 108,
      overlap: 28,
      posterWidth: 140,
    };
  }
  if (viewportWidth >= 640) {
    return {
      gap: 14,
      numberSize: 144,
      numberCol: 98,
      overlap: 26,
      posterWidth: 128,
    };
  }
  return {
    gap: 12,
    numberSize: 128,
    numberCol: 88,
    overlap: 22,
    posterWidth: 116,
  };
}

function formatDeadlineBadge(dateStr: string): string {
  if (isAlwaysOpenRecruitment(dateStr)) return "상시";
  const days = daysUntilApplyDeadlineKorea(dateStr);
  if (days < 0) return "마감";
  if (days === 0) return "D-DAY";
  return `D-${days}`;
}

function kindMeta(kind: CardScholarship["content_kind"]) {
  if (kind === "contest") {
    return { label: "공모전", badgeClass: "border-sky-300 text-sky-100" };
  }
  if (kind === "education") {
    return { label: "교육", badgeClass: "border-emerald-300 text-emerald-100" };
  }
  if (kind === "activity") {
    return { label: "대외활동", badgeClass: "border-violet-300 text-violet-100" };
  }
  return { label: "장학금", badgeClass: "border-white/55 text-white" };
}

const institutionGradient: Record<string, string> = {
  국가기관: "from-[#ff3131] to-[#c00000]",
  공공기관: "from-[#b3e4fb] to-[#5ab8e8]",
  지방자치단체: "from-[#fea276] to-[#e06030]",
  기업: "from-violet-400 to-purple-600",
  재단법인: "from-emerald-400 to-teal-600",
  학교법인: "from-[#fbeca8] to-[#f0c040]",
  "언론/방송": "from-rose-400 to-red-600",
  종교단체: "from-[#fbeca8] to-[#fea276]",
  기타: "from-stone-300 to-stone-500",
};

function getTop10CardModel(scholarship: CardScholarship) {
  const displayName = cleanScholarshipName(scholarship.name);
  const supportAmount = resolveCardSupportLine({
    contentKind: scholarship.content_kind,
    supportAmountText: scholarship.support_amount_text,
    benefits: scholarship.benefits,
    additionalNote: scholarship.benefit_note,
    noticeText: scholarship.benefit_notice_text,
    name: scholarship.name,
    cardSupportLine: scholarship.card_support_line,
  });
  const href = contentKindHref(scholarship.content_kind, scholarship.id);
  const kind = scholarship.content_kind ?? "scholarship";
  const isContestLike =
    kind === "contest" || kind === "education" || kind === "activity";
  const { label: kindLabel, badgeClass } = kindMeta(kind);
  const kindBadgeLabel = `${formatDeadlineBadge(scholarship.apply_end_date)} · ${kindLabel}`;
  const gradient =
    institutionGradient[scholarship.institution_type] ?? "from-stone-300 to-stone-500";

  return {
    displayName,
    supportAmount,
    href,
    isContestLike,
    kindBadgeLabel,
    badgeClass,
    gradient,
  };
}

function Top10Poster({
  scholarship,
  bookmarked,
}: {
  scholarship: CardScholarship;
  bookmarked: boolean;
}) {
  const {
    displayName,
    supportAmount,
    href,
    isContestLike,
    kindBadgeLabel,
    badgeClass,
    gradient,
  } = getTop10CardModel(scholarship);
  const kind = scholarship.content_kind ?? "scholarship";
  const onAnnouncementClick = useAnnouncementLinkClick(kind, scholarship.id);

  return (
    <Link
      href={href}
      onClick={onAnnouncementClick}
      className="group relative block h-full w-full overflow-hidden rounded-xl ring-1 ring-black/5 sm:rounded-2xl"
    >
      {scholarship.poster_image_url ? (
        <Image
          src={scholarship.poster_image_url}
          alt={displayName}
          fill
          sizes="(max-width: 639px) 110px, (max-width: 767px) 120px, (max-width: 1023px) 132px, 144px"
          loading="lazy"
          className="object-cover transition-opacity duration-200 group-hover:opacity-90"
        />
      ) : (
        <div
          className={`flex h-full w-full items-end bg-linear-to-br p-3 ${gradient}`}
        >
          <span className="inline-flex items-center rounded-full border border-white/40 bg-black/45 px-2 py-0.5 text-[10px] font-semibold text-white">
            {scholarship.institution_type}
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-black/25" />

      <span
        className={`absolute left-1.5 top-1.5 z-10 inline-flex max-w-[calc(100%-2.25rem)] items-center truncate rounded-sm border bg-black/70 px-1.5 py-[3px] text-[10px] font-semibold leading-none text-white sm:left-2 sm:top-2 ${badgeClass}`}
        aria-label={kindBadgeLabel}
      >
        {kindBadgeLabel}
      </span>

      <CardBookmarkButton
        scholarshipId={scholarship.id}
        initialBookmarked={bookmarked}
        bookmarkTarget={isContestLike ? "contest" : "scholarship"}
      />

      <div className="absolute inset-x-0 bottom-0 z-10">
        <div className="bg-brand px-1.5 py-1 text-center sm:px-2 sm:py-1.5">
          <p
            className="truncate text-[10px] font-bold tracking-tight text-white sm:text-[11px]"
            title={supportAmount}
          >
            {supportAmount}
          </p>
        </div>
      </div>
    </Link>
  );
}

function Top10Meta({ scholarship }: { scholarship: CardScholarship }) {
  const { displayName, href } = getTop10CardModel(scholarship);
  const kind = scholarship.content_kind ?? "scholarship";
  const onAnnouncementClick = useAnnouncementLinkClick(kind, scholarship.id);

  return (
    <Link href={href} onClick={onAnnouncementClick} className="group block min-w-0">
      <p
        className="truncate text-xs font-semibold leading-snug text-ink transition-colors group-hover:text-brand sm:text-sm"
        title={displayName}
      >
        {displayName}
      </p>
      <p
        className="mt-0.5 truncate text-[11px] text-ink/45 sm:text-xs"
        title={scholarship.organization}
      >
        {scholarship.organization}
      </p>
    </Link>
  );
}

export default function Top10Shelf({
  items,
  isBookmarked,
}: {
  items: CardScholarship[];
  isBookmarked: (scholarship: CardScholarship) => boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const [metrics, setMetrics] = useState(() =>
    typeof window === "undefined"
      ? {
          gap: 18,
          numberSize: 176,
          numberCol: 118,
          overlap: 32,
          posterWidth: 152,
        }
      : getMetrics(window.innerWidth)
  );

  const itemWidth =
    metrics.numberCol - metrics.overlap + metrics.posterWidth;
  const stride = itemWidth + metrics.gap;
  const posterHeight = Math.round(metrics.posterWidth * (3 / 2));

  const updateArrows = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 2);
    setCanNext(el.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const sync = () => {
      setMetrics(getMetrics(window.innerWidth));
      updateArrows();
    };

    sync();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);

    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [updateArrows, items.length]);

  function scrollByDir(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el || stride <= 0) return;
    const page = Math.max(1, Math.floor((el.clientWidth + metrics.gap) / stride));
    const currentIndex = Math.round(el.scrollLeft / stride);
    const nextIndex = Math.max(
      0,
      Math.min(items.length - 1, currentIndex + dir * page)
    );
    el.scrollTo({ left: nextIndex * stride, behavior: "smooth" });
  }

  return (
    <div className="group/shelf relative">
      <button
        type="button"
        aria-label="TOP 10 이전"
        onClick={() => scrollByDir(-1)}
        disabled={!canPrev}
        className={`absolute left-0 top-[38%] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition-opacity lg:flex ${
          canPrev
            ? "opacity-0 group-hover/shelf:opacity-100 hover:scale-105"
            : "pointer-events-none opacity-0"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5 8.25 12l7.5-7.5"
          />
        </svg>
      </button>

      <button
        type="button"
        aria-label="TOP 10 다음"
        onClick={() => scrollByDir(1)}
        disabled={!canNext}
        className={`absolute right-0 top-[38%] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/5 transition-opacity lg:flex ${
          canNext
            ? "opacity-0 group-hover/shelf:opacity-100 hover:scale-105"
            : "pointer-events-none opacity-0"
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m8.25 4.5 7.5 7.5-7.5 7.5"
          />
        </svg>
      </button>

      <div
        ref={scrollerRef}
        role="list"
        aria-label="오늘 TOP 10"
        className="snap-x snap-mandatory overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          className="flex"
          style={{ gap: metrics.gap, paddingLeft: 2, paddingRight: 12 }}
        >
          {items.map((item, index) => {
            const rank = index + 1;

            return (
              <div
                key={`${item.content_kind ?? "scholarship"}-${item.id}`}
                role="listitem"
                className="shrink-0 snap-start"
                style={{ width: itemWidth }}
              >
                {/* 숫자+포스터를 flex 한 쌍으로 묶어 한 칸 밀림 방지 */}
                <div
                  className="flex items-end"
                  style={{ height: posterHeight }}
                >
                  <span
                    aria-hidden
                    className="pointer-events-none relative z-0 shrink-0 select-none text-right font-black tabular-nums leading-none"
                    style={{
                      width: metrics.numberCol,
                      marginRight: -metrics.overlap,
                      fontSize: metrics.numberSize,
                      letterSpacing: rank === 10 ? "-0.08em" : "0",
                      // 흰 배경: 밝은 채움 + 또렷한 외곽선
                      color: "#ffffff",
                      WebkitTextStroke: "2.5px rgba(28, 25, 23, 0.42)",
                      paintOrder: "stroke fill",
                      transform: "translateY(0.06em)",
                    }}
                  >
                    {rank}
                  </span>
                  <div
                    className="relative z-10 h-full shrink-0"
                    style={{ width: metrics.posterWidth }}
                  >
                    <Top10Poster
                      scholarship={item}
                      bookmarked={isBookmarked(item)}
                    />
                  </div>
                </div>
                <div
                  className="mt-2"
                  style={{
                    marginLeft: metrics.numberCol - metrics.overlap,
                    width: metrics.posterWidth,
                  }}
                >
                  <Top10Meta scholarship={item} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
