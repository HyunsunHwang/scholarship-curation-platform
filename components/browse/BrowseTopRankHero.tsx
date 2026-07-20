"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { CardScholarship } from "@/components/ScholarshipCard";
import { useAnnouncementLinkClick } from "@/components/announcement/AnnouncementModalProvider";
import { cleanScholarshipName } from "@/lib/scholarship-name";
import { contentKindHref } from "@/lib/content-categories";

const DEFAULT_HERO_BG = "/images/browse-rank-hero.png";
/** 위는 톤 있게, 아래로 갈수록 흰색에 녹아 피드와 연결 */
const DEFAULT_GRADIENT =
  "bg-linear-to-b from-[#ffe4dc] via-[#fff1ec] to-white";

/** 뷰포트에 보이는 카드 수 · 화살표 한 번에 이동량 */
const PAGE_SIZE = 5;

type HeroIntro = {
  title: ReactNode;
  description?: ReactNode;
  ctaLabel: string;
  ctaHref: string;
};

type BrowseTopRankHeroProps = {
  title: ReactNode;
  items: CardScholarship[];
  /**
   * 배경 이미지. null 이면 단색 그라데이션.
   * 기본: browse-rank-hero(고양이). 탐색용.
   */
  backgroundSrc?: string | null;
  /** backgroundSrc=null 일 때 쓰는 그라데이션 클래스 */
  gradientClassName?: string;
  /** 홈 등 — 왼쪽 상단 문구 + 유도 버튼 */
  intro?: HeroIntro | null;
  /** 미지정 시 /browse 로 돌아가는 탐색 링크. null 이면 숨김 */
  backHref?: string | null;
  backLabel?: string;
  badge?: string;
  subtitle?: string | null;
  headingId?: string;
  /** next/image object-* 클래스. 피사체 위치에 맞게 오버라이드 */
  imageClassName?: string;
  /** 좌→우 화이트 워시 강도 */
  washRightClassName?: string;
  /** 하→상 화이트 워시 강도 */
  washUpClassName?: string;
};

function RankCardLink({
  item,
  rank,
}: {
  item: CardScholarship;
  rank: number;
}) {
  const name = cleanScholarshipName(item.name);
  const href = contentKindHref(item.content_kind, item.id);
  const kind = item.content_kind ?? "scholarship";
  const onAnnouncementClick = useAnnouncementLinkClick(kind, item.id);

  return (
    <Link
      href={href}
      onClick={onAnnouncementClick}
      role="listitem"
      data-rank-card
      className="group w-[92px] shrink-0 snap-start sm:w-[108px] md:w-[118px]"
    >
      <div className="relative aspect-2/3 overflow-hidden rounded-lg shadow-md ring-1 ring-black/8 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:shadow-lg">
        {item.poster_image_url ? (
          <Image
            src={item.poster_image_url}
            alt={name}
            fill
            sizes="118px"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-end bg-linear-to-br from-stone-300 to-stone-500 p-2">
            <span className="text-[10px] font-semibold text-white/90">
              {item.organization}
            </span>
          </div>
        )}

        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-2/5 bg-linear-to-t from-black/75 via-black/25 to-transparent"
        />

        <span
          aria-hidden
          className="absolute bottom-0 left-1 z-10 select-none text-[42px] font-black leading-none text-white drop-shadow-[0_2px_6px_rgba(0,0,0,0.55)] sm:bottom-0.5 sm:left-1.5 sm:text-[48px]"
          style={{
            WebkitTextStroke: "1px rgba(0,0,0,0.15)",
            paintOrder: "stroke fill",
          }}
        >
          {rank}
        </span>
      </div>

      <p
        className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-snug text-ink group-hover:text-brand sm:text-xs"
        title={name}
      >
        {name}
      </p>
    </Link>
  );
}

/**
 * 탐색 카테고리 선택 시 상단 시네마틱 TOP 10.
 * 오른쪽에 5장 · 데스크탑은 화살표, 모바일은 스와이프로 더 보기.
 */
export default function BrowseTopRankHero({
  title,
  items,
  backgroundSrc = DEFAULT_HERO_BG,
  gradientClassName = DEFAULT_GRADIENT,
  intro = null,
  backHref = "/browse",
  backLabel = "탐색",
  badge = "TODAY TOP 10",
  subtitle = "스크랩·조회가 많은 공고 순위",
  headingId = "browse-top-rank-heading",
  imageClassName = "object-cover object-[18%_center] sm:object-[22%_center]",
  washRightClassName = "bg-linear-to-r from-transparent via-white/20 to-white/88",
  washUpClassName = "bg-linear-to-t from-white via-white/45 to-transparent",
}: BrowseTopRankHeroProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const useGradient = backgroundSrc === null;

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

    updateArrows();
    el.addEventListener("scroll", updateArrows, { passive: true });
    const ro = new ResizeObserver(updateArrows);
    ro.observe(el);
    window.addEventListener("resize", updateArrows);

    return () => {
      el.removeEventListener("scroll", updateArrows);
      ro.disconnect();
      window.removeEventListener("resize", updateArrows);
    };
  }, [updateArrows, items.length]);

  function scrollByPage(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>("[data-rank-card]");
    if (!first) return;
    const styles = getComputedStyle(el);
    const gap = Number.parseFloat(styles.columnGap || styles.gap || "12") || 12;
    const stride = first.offsetWidth + gap;
    el.scrollBy({ left: dir * stride * PAGE_SIZE, behavior: "smooth" });
  }

  if (items.length < 5) return null;

  return (
    <section
      aria-labelledby={intro ? "home-hero-intro-heading" : headingId}
      className={intro ? "relative mb-0" : "relative mb-3 sm:mb-4"}
    >
      <div className="relative min-h-[280px] sm:min-h-[320px] lg:min-h-[360px]">
        <div className="absolute inset-0 overflow-hidden" aria-hidden>
          {useGradient ? (
            <>
              <div className={`absolute inset-0 ${gradientClassName}`} />
              <div className="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-t from-white to-transparent" />
            </>
          ) : (
            <>
              <Image
                src={backgroundSrc ?? DEFAULT_HERO_BG}
                alt=""
                fill
                priority
                sizes="100vw"
                className={imageClassName}
              />
              <div className={`absolute inset-0 ${washRightClassName}`} />
              <div className={`absolute inset-0 ${washUpClassName}`} />
            </>
          )}
        </div>

        <div
          className={`relative mx-auto flex h-full flex-col px-4 sm:px-6 md:px-10 ${
            intro
              ? "min-h-[280px] max-w-[1760px] justify-center gap-6 pt-8 pb-6 sm:min-h-[320px] sm:gap-8 sm:pt-10 sm:pb-7 lg:min-h-[360px] lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:pt-12 lg:pb-8"
              : "min-h-[280px] max-w-6xl justify-end pt-12 pb-5 sm:min-h-[320px] sm:pt-14 sm:pb-6 lg:min-h-[360px]"
          }`}
        >
          {backHref ? (
            <Link
              href={backHref}
              className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/75 px-3 py-1.5 text-sm font-medium text-ink/70 shadow-sm backdrop-blur-sm transition hover:bg-white hover:text-ink sm:left-6 sm:top-5"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              {backLabel}
            </Link>
          ) : null}

          {intro ? (
            <div className="relative z-10 w-full shrink-0 lg:max-w-md xl:max-w-lg">
              <h2
                id="home-hero-intro-heading"
                className="text-[1.75rem] font-extrabold leading-[1.3] tracking-tight text-ink sm:text-[2.05rem] md:text-[2.35rem]"
              >
                {intro.title}
              </h2>
              {intro.description ? (
                <p className="mt-3 max-w-[22rem] text-sm font-medium leading-relaxed text-ink/65 sm:max-w-none sm:text-[15px]">
                  {intro.description}
                </p>
              ) : null}
              <Link
                href={intro.ctaHref}
                className="mt-5 inline-flex items-center rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand/85 active:scale-[0.98] sm:mt-6 sm:px-6 sm:py-3"
              >
                {intro.ctaLabel}
              </Link>
            </div>
          ) : null}

          <div
            className={`flex w-full flex-col items-stretch sm:items-end ${
              intro ? "min-w-0 lg:ml-auto lg:w-auto" : ""
            }`}
          >
            <div className="mb-4 w-full text-right sm:mb-5 sm:w-auto sm:max-w-none">
              <p className="inline-flex items-center justify-end gap-2 rounded-full bg-white/70 px-2.5 py-1 text-[11px] font-bold tracking-[0.14em] text-emerald-800 shadow-sm backdrop-blur-sm sm:text-xs">
                {badge}
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600"
                />
              </p>
              {intro ? (
                <p
                  id={headingId}
                  className="mt-2 text-lg font-extrabold leading-snug tracking-tight text-ink sm:text-xl md:text-[1.35rem]"
                >
                  {title}
                </p>
              ) : (
                <h2
                  id={headingId}
                  className="mt-2 text-2xl font-extrabold tracking-tight text-ink drop-shadow-[0_1px_0_rgba(255,255,255,0.9)] sm:text-3xl"
                >
                  {title}
                </h2>
              )}
              {subtitle ? (
                <p className="mt-1.5 text-sm font-medium text-ink/70">
                  {subtitle}
                </p>
              ) : null}
            </div>

            <div className="group/rank relative w-full max-w-[min(100%,calc(5*92px+4*0.625rem))] sm:ml-auto sm:max-w-[calc(5*108px+4*0.75rem)] md:max-w-[calc(5*118px+4*0.75rem)]">
              <button
                type="button"
                aria-label="이전 순위"
                onClick={() => scrollByPage(-1)}
                disabled={!canPrev}
                className={`absolute -left-3 top-[38%] z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/10 transition md:flex lg:-left-4 lg:h-10 lg:w-10 ${
                  canPrev
                    ? "opacity-100 hover:scale-105"
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
                aria-label="다음 순위"
                onClick={() => scrollByPage(1)}
                disabled={!canNext}
                className={`absolute -right-3 top-[38%] z-20 hidden h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white text-ink shadow-md ring-1 ring-black/10 transition md:flex lg:-right-4 lg:h-10 lg:w-10 ${
                  canNext
                    ? "opacity-100 hover:scale-105"
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
                aria-label="TOP 10 공고"
                className="flex snap-x snap-mandatory gap-2.5 overflow-x-auto scroll-smooth pb-1 [scrollbar-width:none] sm:gap-3 [&::-webkit-scrollbar]:hidden"
              >
                {items.map((item, index) => (
                  <RankCardLink
                    key={`${item.content_kind ?? "scholarship"}-${item.id}`}
                    item={item}
                    rank={index + 1}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
